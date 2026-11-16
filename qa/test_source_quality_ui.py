"""Browser → actual JS relay → actual Python role, all on loopback with fictional data."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import httpx
from playwright.sync_api import expect
import pytest
from safety import is_loopback_url
from test_release2 import fictional_portfolio

ROOT=Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def source_gateway(tmp_path_factory):
    log=tmp_path_factory.mktemp('source-quality-transport')/'backend.log'
    sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(128);port=sock.getsockname()[1]
    env={'PATH':os.environ.get('PATH',''),'PYTHONPATH':str(ROOT/'aitracker-upload'),'SOURCE_QUALITY_DEV_ENABLED':'true',
         'AI_INFRA_AGENT_TOKEN':'fictional-source-backend','EVAL_STUB':'true','LLM_PROVIDER':'stub'}
    with log.open('w') as output:
        backend=subprocess.Popen([sys.executable,'-m','uvicorn','source_quality_backend:app','--app-dir',str(ROOT/'qa'),'--fd',str(sock.fileno()),'--no-access-log'],env=env,pass_fds=(sock.fileno(),),stdout=output,stderr=output)
        gateway=None
        try:
            with httpx.Client(trust_env=False) as client:
                for _ in range(50):
                    try:
                        response=client.get(f'http://127.0.0.1:{port}/api/agent-python?task=source-quality',headers={'Authorization':'Bearer fictional-source-backend'},timeout=.3)
                        if response.status_code==405:break
                    except httpx.HTTPError:pass
                    if backend.poll() is not None:raise AssertionError(log.read_text())
                    time.sleep(.1)
                else:raise AssertionError('Loopback source backend did not become ready')
            gateway_env={**env,'AIW_ACCESS_TOKEN':'fictional-source-session','AI_INFRA_AGENT_URL':f'http://127.0.0.1:{port}','VITE_QA_MODE':'true'}
            with socket.socket() as reserve:
                reserve.bind(('127.0.0.1',0));frontend_port=reserve.getsockname()[1]
            gateway=subprocess.Popen(['node',str(ROOT/'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',str(frontend_port),'--strictPort'],cwd=ROOT,env=gateway_env,stdout=output,stderr=output)
            address=f'http://127.0.0.1:{frontend_port}'
            assert is_loopback_url(address)
            with httpx.Client(trust_env=False) as client:
                for _ in range(50):
                    try:
                        if client.get(address,timeout=.3).status_code==200:break
                    except httpx.HTTPError:pass
                    if gateway.poll() is not None:raise AssertionError(log.read_text())
                    time.sleep(.1)
                else:raise AssertionError('Source development UI did not become ready')
            yield address
        finally:
            for process in [gateway,backend]:
                if process is None:continue
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
            sock.close()


def setup(page,source_gateway,quotes=None):
    fictional_portfolio(page)
    page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fictional-source-session")')
    now=time.time()
    stamp=lambda seconds:time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(seconds))
    quote={'symbol':'FICT','returnedSymbol':'FICT','provider':'yahoo','sourceMode':'live','price':100,'changePct':0,'currency':'USD','marketTime':stamp(now-2),'retrievedAt':stamp(now-1),'adjustedBasis':'raw','isMarketSessionOpen':True}
    loaded=quotes if quotes is not None else {'FICT':quote,'DEMO':{'price':100,'provider':'qa','simulated':True}}
    page.route('**/api/live-data*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'stockPrices':loaded,'news':[],'contracts':[],'congressTrades':[],'macroRisks':[],'timestamp':int(now*1000)})))
    calls=[]
    page.on('request',lambda req:calls.append(req) if '/api/agent-ask?task=source-quality' in req.url else None)
    def relay(route):route.continue_()
    page.route('**/api/agent-ask?task=source-quality',relay)
    page.goto(source_gateway+'/opportunities')
    page.wait_for_load_state('networkidle')
    scanner=page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    panel=scanner.get_by_test_id('source-quality-review')
    panel.locator('summary').first.focus();panel.locator('summary').first.press('Enter')
    return scanner,panel,calls,relay,loaded


def test_explicit_review_uses_actual_authenticated_agent_and_reuses_result(page,source_gateway):
    scanner,panel,calls,_,_=setup(page,source_gateway)
    assert calls==[]
    panel.get_by_role('button',name='Run source-quality review',exact=True).dblclick()
    expect(panel.get_by_test_id('source-quality-result')).to_contain_text('Configured metadata checks passed')
    assert len(calls)==1 and calls[0].method=='POST'
    payload=calls[0].post_data_json
    assert set(payload)=={'run_id','assessed_at','symbols','observations'} and payload['symbols']==['FICT']
    assert payload['observations'][0]['change_pct']==0
    assert calls[0].headers['authorization']=='Bearer fictional-source-session'
    assert not {'quantity','notes','thesis','averageCost','portfolioContext','api_key'}.intersection(payload)
    expect(panel.get_by_role('button',name='Source review loaded',exact=True)).to_be_disabled()
    assert 'No decision eligibility was granted' in panel.inner_text()
    assert 'Needs reliable data' in scanner.inner_text()
    panel.get_by_role('combobox',name='Source-quality symbol').select_option('DEMO')
    panel.get_by_role('button',name='Run source-quality review',exact=True).click()
    expect(panel.get_by_test_id('source-quality-result')).to_contain_text('Needs source data')
    expect(panel.get_by_test_id('source-quality-result')).to_contain_text('simulated')
    panel.get_by_role('combobox',name='Source-quality symbol').select_option('FICT')
    expect(panel.get_by_test_id('source-quality-result')).to_contain_text('Configured metadata checks passed')
    assert len(calls)==2
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    assert panel.get_by_test_id('source-quality-result').count()==0
    assert len(calls)==2


def test_failures_have_no_automatic_retry_and_attempts_survive_rescans(page,source_gateway):
    scanner,panel,calls,_,_=setup(page,source_gateway)
    def fail(route):
        route.fulfill(status=503,content_type='application/json',body='{"error":"fictional-private-error"}')
    page.route('**/api/agent-ask?task=source-quality',fail)
    for index in range(5):
        panel.get_by_role('button',name='Run source-quality review' if index==0 else 'Retry source review',exact=True).click()
        expect(panel.get_by_role('alert')).to_contain_text('No automatic retry occurred')
        assert len(calls)==index+1
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    expect(panel.get_by_role('button',name='Run source-quality review',exact=True)).to_be_disabled()
    assert 'review limit is reached' in panel.inner_text() and 'fictional-private-error' not in panel.inner_text()


def test_review_keeps_frozen_quotes_after_feed_refresh_and_omits_private_fields(page,source_gateway):
    scanner,panel,calls,_,loaded=setup(page,source_gateway)
    initial_time=loaded['FICT']['marketTime']
    loaded['FICT'].update(price=200,quantity=1000,notes='fictional-private-note',apiKey='fictional-private-key')
    page.get_by_role('button',name='REFRESH FEED',exact=True).click()
    expect(page.get_by_role('button',name='REFRESH FEED',exact=True)).to_be_enabled()
    manual_requests=[]
    page.on('request',lambda req:manual_requests.append(req.url) if '/api/' in req.url else None)
    panel.get_by_role('button',name='Run source-quality review',exact=True).click()
    expect(panel.get_by_test_id('source-quality-result')).to_be_visible()
    assert calls[0].post_data_json['observations'][0]['price']==100
    assert calls[0].post_data_json['observations'][0]['market_time']==initial_time
    assert len(manual_requests)==1 and 'task=source-quality' in manual_requests[0]
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    panel.get_by_role('button',name='Run source-quality review',exact=True).click()
    expect(panel.get_by_test_id('source-quality-result')).to_be_visible()
    assert calls[1].post_data_json['observations'][0]['price']==200
    assert 'fictional-private' not in json.dumps(calls[1].post_data_json)


def test_compatible_price_discrepancy_is_explained_without_decision_upgrade(page,source_gateway):
    stamp=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()-2))
    primary={'symbol':'FICT','returnedSymbol':'FICT','provider':'yahoo','sourceMode':'live','price':100,'changePct':0,'currency':'USD','marketTime':stamp,'retrievedAt':stamp,'adjustedBasis':'raw','isMarketSessionOpen':True}
    primary['independentObservations']=[{**primary,'provider':'finnhub','price':110}]
    _,panel,calls,_,_=setup(page,source_gateway,quotes={'FICT':primary})
    panel.get_by_role('button',name='Run source-quality review',exact=True).click()
    expect(panel.get_by_test_id('source-quality-result')).to_contain_text('Source discrepancy needs review')
    expect(panel.get_by_test_id('source-quality-result')).to_contain_text('Price discrepancy: 10%')
    assert len(calls)==1 and len(calls[0].post_data_json['observations'])==2
    assert 'No decision eligibility was granted' in panel.inner_text()


def test_production_build_has_no_development_review(page):
    base=os.getenv('QA_LOGIN_BASE_URL')
    if not base:pytest.skip('Requires loopback non-QA preview')
    assert is_loopback_url(base)
    fictional_portfolio(page)
    page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fictional-source-session")')
    page.route('**/api/auth',lambda route:route.fulfill(status=200,content_type='application/json',body='{"ok":true}'))
    page.goto(base+'/opportunities')
    scanner=page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_test_id('opportunity-card').first.wait_for()
    assert scanner.get_by_test_id('source-quality-review').count()==0


def test_wrong_or_late_results_cannot_claim_another_input(page,source_gateway):
    scanner,panel,calls,_,_=setup(page,source_gateway)
    def wrong(route):
        with httpx.Client(trust_env=False) as client:
            response=client.post(source_gateway+'/api/agent-ask?task=source-quality',content=route.request.post_data,headers={'Content-Type':'application/json','Authorization':'Bearer fictional-source-session'})
        result=response.json();result['run_id']='wrong-run'
        route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
    page.route('**/api/agent-ask?task=source-quality',wrong)
    panel.get_by_role('button',name='Run source-quality review',exact=True).click()
    expect(panel.get_by_role('alert')).to_be_visible()
    assert panel.get_by_test_id('source-quality-result').count()==0
    def delayed(route):
        panel.get_by_role('combobox',name='Source-quality symbol').select_option('DEMO')
        route.fulfill(status=200,content_type='application/json',body='{}')
    page.route('**/api/agent-ask?task=source-quality',delayed)
    panel.get_by_role('button',name='Retry source review',exact=True).click()
    expect(panel.get_by_role('button',name='Run source-quality review',exact=True)).to_be_enabled()
    assert panel.get_by_test_id('source-quality-result').count()==0


@pytest.mark.parametrize('width',[360,768,1440])
def test_source_review_keyboard_responsive_and_evidence_capture(page,source_gateway,width):
    page.set_viewport_size({'width':width,'height':900})
    _,panel,_,_,_=setup(page,source_gateway)
    panel.get_by_role('button',name='Run source-quality review',exact=True).focus()
    panel.get_by_role('button',name='Run source-quality review',exact=True).press('Enter')
    expect(panel.get_by_test_id('source-quality-result')).to_be_visible()
    panel.get_by_text('Frozen quote inputs for FICT',exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'));root.mkdir(exist_ok=True,parents=True)
    page.evaluate('document.activeElement?.blur(); scrollTo(0,0)')
    page.screenshot(path=str(root/f'source-quality-{width}.png'),full_page=True,animations='disabled')
