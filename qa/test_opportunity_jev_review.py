"""Manual JEV reviews intercepted locally; no real TypeSafe credits are used."""
import json
import os
from pathlib import Path
import pytest
from playwright.sync_api import expect
from test_release2 import fictional_portfolio


def result():
    return {'ok':True,'enabled':True,'fallback':False,'kind':'opportunities','answers':{'next_check':{'type':'choice','choice':'monitor'},'context':{'type':'choice','choice':'bounded_review'}},'input_tokens':123,'latency_ms':42,'model':'fixture-model','token':'fixture-private-response'}


def open_review(page):
    fictional_portfolio(page)
    page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fixture-session")')
    page.goto('/opportunities')
    scanner=page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_test_id('opportunity-card').first.wait_for()
    panel=scanner.get_by_test_id('opportunity-jev-review')
    panel.locator('summary').focus();panel.locator('summary').press('Enter')
    return scanner,panel


def test_manual_review_is_one_authenticated_bounded_request_and_reuses_results(page):
    calls=[]
    def assess(route):
        route.fulfill(status=200,content_type='application/json',body=json.dumps(result()))
    page.on('request',lambda request:calls.append(request) if '/api/jev-assess' in request.url else None)
    scanner,panel=open_review(page)
    page.route('**/api/jev-assess',assess)
    assert calls==[]
    panel.get_by_role('button',name='Run JEV coverage review · uses credits',exact=True).dblclick()
    expect(panel.get_by_test_id('opportunity-jev-result')).to_be_visible()
    assert len(calls)==1 and calls[0].method=='POST'
    assert calls[0].headers['authorization']=='Bearer fixture-session'
    payload=calls[0].post_data_json
    assert payload['kind']=='opportunities' and len(json.dumps(payload))<1024
    assert not set(payload['state']).intersection({'quantity','averageCost','notes','thesis','portfolioContext','token'})
    assert 'Insufficient evidence' in panel.inner_text()
    assert 'Gather dated, independent evidence' in panel.inner_text()
    assert '123' in panel.inner_text() and 'Exact credits and remaining balance are unavailable' in panel.inner_text()
    assert 'fixture-private-response' not in panel.inner_text()
    assert 'Needs reliable data' in scanner.inner_text()
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    expect(panel.get_by_role('button',name='JEV review loaded',exact=True)).to_be_disabled()
    assert len(calls)==1


def test_unavailable_reviews_never_retry_automatically_and_attempts_are_bounded(page):
    calls=[]
    def assess(route):
        calls.append(route.request.url)
        route.fulfill(status=503,content_type='application/json',body=json.dumps({'error':'Bearer fixture-private-error'}))
    _,panel=open_review(page)
    page.route('**/api/jev-assess',assess)
    for attempt in range(5):
        panel.get_by_role('button',name='Run JEV coverage review · uses credits' if attempt==0 else 'Retry JEV review · may use credits',exact=True).click()
        expect(panel.get_by_role('alert')).to_contain_text('No automatic retry occurred')
        expect(panel.get_by_role('button')).to_be_disabled() if attempt==4 else expect(panel.get_by_role('button')).to_be_enabled()
        assert len(calls)==attempt+1
    assert 'This view’s request limit is reached' in panel.inner_text()
    assert 'fixture-private-error' not in panel.inner_text()


def test_switching_symbols_cannot_display_another_symbols_result(page):
    _,panel=open_review(page)
    original=panel.get_by_role('combobox',name='JEV research symbol').input_value()
    other='DEMO' if original=='FICT' else 'FICT'
    def delayed(route):
        # Switch inputs while this request is in flight, before supplying its response.
        panel.get_by_role('combobox',name='JEV research symbol').select_option(other)
        route.fulfill(status=200,content_type='application/json',body=json.dumps(result()))
    page.route('**/api/jev-assess',delayed)
    panel.get_by_role('button',name='Run JEV coverage review · uses credits',exact=True).click()
    expect(panel.get_by_role('button',name='Run JEV coverage review · uses credits',exact=True)).to_be_enabled()
    assert panel.get_by_test_id('opportunity-jev-result').count()==0
    panel.get_by_role('combobox',name='JEV research symbol').select_option(original)
    expect(panel.get_by_test_id('opportunity-jev-result')).to_contain_text('JEV coverage review for '+original)


@pytest.mark.parametrize('width',[360,768,1440])
def test_jev_review_responsive_and_keyboard(page,width):
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    _,panel=open_review(page)
    page.route('**/api/jev-assess',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(result())))
    panel.get_by_role('button',name='Run JEV coverage review · uses credits',exact=True).click()
    expect(panel.get_by_test_id('opportunity-jev-result')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('scrollTo(0,0)');page.screenshot(path=str(root/f'opportunity-jev-{width}.png'),full_page=True,animations='disabled')
