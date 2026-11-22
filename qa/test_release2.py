from pathlib import Path
import json
import os
import pytest
from test_ui import goto_app, mock_local_apis

ARTIFACTS = Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-release2'))


def test_actual_opportunity_summary_is_accepted_by_python_assessment_endpoint_without_live_provider(monkeypatch):
    import importlib.util
    import sys
    import subprocess
    from fastapi.testclient import TestClient
    root = Path(__file__).resolve().parents[1]
    program = """import {opportunityJevState} from './src/utils/opportunityJevReview.ts';
      console.log(JSON.stringify(opportunityJevState({symbol:'FICT',status:'needs-data',ruleVersion:'reported-growth-cash-flow-v1-experimental',dataEligibility:'insufficient',asOf:null,missingInputs:['Private note'],evidence:[],supportingReasons:[],conflictingReasons:[]})));"""
    state = json.loads(subprocess.check_output(['node','--import','tsx','--input-type=module','-e',program],cwd=root,env={'PATH':os.environ['PATH']},text=True))
    spec = importlib.util.spec_from_file_location('fictional_opportunity_endpoint', root/'api/jev-assess.py')
    module = importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules, spec.name, module)
    spec.loader.exec_module(module)
    from app.jev.assess import assess
    from app.jev.client import JevEvaluation, JevAnswer
    captured = []
    class FakeClient:
        def evaluate(self, **kwargs):
            captured.append(kwargs)
            return JevEvaluation(answers={'next_check':JevAnswer(type='choice',choice='gather_evidence'), 'context':JevAnswer(type='choice',choice='insufficient')},model='fictional-model')
    monkeypatch.setenv('AIW_ACCESS_TOKEN','fictional-opportunity-session')
    monkeypatch.setattr(module, 'assess', lambda kind, state: assess(kind,state,client=FakeClient()))
    client=TestClient(module.app)
    headers={'Authorization':'Bearer fictional-opportunity-session'}
    response=client.post('/api/jev-assess',headers=headers,json={'kind':'opportunities','state':state})
    assert response.status_code == 200 and response.json()['ok'] is True
    assert response.json()['answers']['context']['choice'] == 'insufficient'
    assert len(captured)==1 and set(captured[0]['questions'])=={'next_check','context'}
    assert json.loads(captured[0]['state'])==state and 'Private note' not in captured[0]['state']
    for invalid in [{**state,'holdings':[{'quantity':999}]}, {**state,'missingInputCount':True}, {**state,'asOf':'2026-02-30T00:00:00Z'}, {**state,'status':'excluded'}]:
        assert client.post('/api/jev-assess',headers=headers,json={'kind':'opportunities','state':invalid}).status_code==422
    assert client.post('/api/jev-assess',json={'kind':'opportunities','state':state}).status_code==401
    assert len(captured)==1


@pytest.mark.parametrize('status,body,expected', [
    (400,{'detail':{'error':'unknown assessment kind'}},'same release'),
    (200,{'ok':False,'enabled':False,'error_code':'disabled'},'did not call TypeSafe'),
    (503,{'error':'fictional-private-response'},'Credits may have been used'),
])
def test_opportunity_jev_failure_is_actionable_and_does_not_retry(page,status,body,expected):
    from playwright.sync_api import expect
    fictional_portfolio(page)
    calls=[]
    def reply(route):
        calls.append(route.request.post_data_json)
        route.fulfill(status=status,json=body)
    page.route('**/api/jev-assess',reply)
    page.goto('/opportunities')
    page.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    panel=page.get_by_test_id('opportunity-jev-review')
    panel.locator('summary').click()
    panel.get_by_role('button',name='Run JEV coverage review · uses credits',exact=True).click()
    expect(panel.get_by_role('alert')).to_contain_text(expected)
    assert len(calls)==1 and calls[0]['kind']=='opportunities'
    assert 'fictional-private-response' not in panel.inner_text()
    assert not any(field in calls[0]['state'] for field in ['quantity','holdings','notes','costs'])


def test_jev_endpoint_never_returns_raw_provider_failure_text(monkeypatch):
    import importlib.util
    import sys
    from fastapi.testclient import TestClient
    root=Path(__file__).resolve().parents[1]
    spec=importlib.util.spec_from_file_location('fictional_jev_error_endpoint',root/'api/jev-assess.py')
    module=importlib.util.module_from_spec(spec)
    monkeypatch.setitem(sys.modules,spec.name,module)
    spec.loader.exec_module(module)
    from app.jev.client import JevEvaluation
    monkeypatch.setenv('AIW_ACCESS_TOKEN','fictional-opportunity-session')
    monkeypatch.setattr(module.settings,'JEV_ENABLED',True)
    monkeypatch.setattr(module.settings,'JEV_API_KEY','fictional-provider-key')
    monkeypatch.setattr(module,'assess',lambda *_:JevEvaluation(error='fictional-private-upstream-error'))
    response=TestClient(module.app).post('/api/jev-assess',headers={'Authorization':'Bearer fictional-opportunity-session'},json={'kind':'platform','state':{}})
    assert response.json()['error_code']=='provider_unavailable'
    assert 'fictional-private-upstream-error' not in response.text and 'fictional-provider-key' not in response.text


def fictional_portfolio(page, watchlist=('DEMO',)):
    page.add_init_script('localStorage.setItem("aiw_config_v1", JSON.stringify('+json.dumps({'watchlist':list(watchlist),'finnhubKey':'','alerts':[]})+'));')
    mock_local_apis(page)
    page.route('**/api/portfolio?includeLots=true', lambda route: route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':[{'id':'fictional-holding','symbol':'FICT','quantity':1,'averageCost':100,'purchaseDate':'2026-01-01','notes':''}]})))


def test_opportunities_scan_filters_and_no_write_paths(page):
    writes = []
    page.on('request',lambda request:writes.append(request.url) if request.method in ('POST','PUT','PATCH','DELETE') else None)
    fictional_portfolio(page)
    goto_app(page)
    page.get_by_test_id('nav-opportunities').click()
    scanner = page.get_by_test_id('opportunity-scanner')
    scanner.get_by_text('No scan has run.',exact=False).wait_for()
    page.wait_for_load_state('networkidle')
    scan_requests = []
    page.on('request',lambda request:scan_requests.append(request.url))
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_test_id('opportunity-card').first.wait_for()
    assert scanner.get_by_test_id('opportunity-card').count() == 2
    assert scan_requests == []
    assert 'Needs reliable data' in scanner.inner_text()
    assert '0 validated signal families' in scanner.inner_text()
    scanner.get_by_text('Evidence and missing inputs for FICT',exact=True).click()
    assert 'accounting unverified' in scanner.inner_text()
    assert 'Comparable reported revenue growth' in scanner.inner_text()
    scanner.get_by_role('searchbox',name='Search research candidates').fill('DEMO')
    assert scanner.get_by_test_id('opportunity-card').count() == 1
    scanner.get_by_role('combobox',name='Research status').select_option('research-candidate')
    scanner.get_by_text('No research candidates match these filters.',exact=True).wait_for()
    assert writes == []


def test_opportunities_direct_route_mobile_and_snapshot_refresh(page):
    fictional_portfolio(page)
    page.goto('/opportunities',wait_until='domcontentloaded')
    scanner = page.get_by_test_id('opportunity-scanner')
    scan = scanner.get_by_role('button',name='Scan loaded snapshot',exact=True)
    scan.click()
    scanner.get_by_test_id('opportunity-card').first.wait_for()
    scan.click()
    assert scanner.get_by_test_id('opportunity-card').count() == 2
    page.set_viewport_size({'width':360,'height':800})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert scanner.evaluate('(element)=>element.scrollWidth <= element.clientWidth')
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(ARTIFACTS/'release2-opportunities-mobile.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path=str(ARTIFACTS/'release2-opportunities-desktop.png'))
    page.reload(wait_until='domcontentloaded')
    scanner.get_by_text('No scan has run.',exact=False).wait_for()


def test_watchlist_development_does_not_sync_configuration(page):
    writes = []
    page.on('request',lambda request:writes.append(request.url) if '/api/alert-config' in request.url and request.method == 'POST' else None)
    fictional_portfolio(page)
    goto_app(page)
    page.get_by_test_id('nav-watchlist').click()
    page.get_by_role('heading',name='Watchlist',exact=True).wait_for()
    page.get_by_test_id('nav-opportunities').click()
    page.get_by_test_id('opportunity-scanner').wait_for()
    assert writes == []


def test_unavailable_holdings_do_not_become_a_complete_zero_position_scan(page):
    errors = []
    page.on('pageerror',lambda error:errors.append(str(error)))
    fictional_portfolio(page)
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=503,content_type='application/json',body='{}'))
    goto_app(page)
    # Settle the simulated failed portfolio request before clicking a React navigation control.
    # Keep the real sidebar-navigation assertion; do not bypass it with a direct URL.
    page.wait_for_load_state('networkidle')
    page.get_by_test_id('nav-opportunities').click()
    scanner = page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_text('Holdings could not be loaded.',exact=False).wait_for()
    assert 'Holdings unavailable' in scanner.inner_text()
    assert errors == []
    assert scanner.get_by_test_id('opportunity-card').count() == 1


def test_empty_research_universe_is_distinct_from_missing_data(page):
    fictional_portfolio(page,watchlist=())
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=200,content_type='application/json',body='{"holdings":[]}'))
    goto_app(page)
    page.get_by_test_id('nav-opportunities').click()
    scanner = page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_text('No holdings or watchlist symbols are available in this snapshot.',exact=True).wait_for()
    assert scanner.get_by_test_id('opportunity-card').count() == 0
