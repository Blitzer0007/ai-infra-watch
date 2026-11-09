"""Browser → actual private JS relay → Python council → cited UI; zero external calls."""
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
from test_release2 import fictional_portfolio
from safety import is_loopback_url

ROOT=Path(__file__).resolve().parents[1]
ARTIFACTS=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-council'))

@pytest.fixture(scope='module')
def council_gateway(tmp_path_factory):
    log=tmp_path_factory.mktemp('council-loopback')/'backend.log'
    sock=socket.socket();sock.bind(('127.0.0.1',0));sock.listen(128);port=sock.getsockname()[1]
    env={'PATH':os.environ.get('PATH',''),'PYTHONPATH':str(ROOT/'aitracker-upload'),'COUNCIL_DEV_ENABLED':'true','COUNCIL_JEV_DEV_ENABLED':'true','AI_INFRA_AGENT_TOKEN':'fictional-council-backend','EVAL_STUB':'true','LLM_PROVIDER':'stub'}
    with log.open('w') as output:
        backend=subprocess.Popen([sys.executable,'-m','uvicorn','council_backend:app','--app-dir',str(ROOT/'qa'),'--fd',str(sock.fileno()),'--no-access-log'],env=env,pass_fds=(sock.fileno(),),stdout=output,stderr=output)
        gateway=None
        try:
            with httpx.Client(trust_env=False) as client:
                for _ in range(80):
                    try:
                        if client.get(f'http://127.0.0.1:{port}/api/agent-python?task=council',headers={'Authorization':'Bearer fictional-council-backend'},timeout=.3).status_code==405:break
                    except httpx.HTTPError:pass
                    if backend.poll() is not None:raise AssertionError(log.read_text())
                    time.sleep(.1)
                else:raise AssertionError('Council backend not ready')
            with socket.socket() as reserve:reserve.bind(('127.0.0.1',0));frontend_port=reserve.getsockname()[1]
            gateway_env={**env,'AIW_ACCESS_TOKEN':'fictional-council-session','AI_INFRA_AGENT_URL':f'http://127.0.0.1:{port}','VITE_QA_MODE':'true'}
            gateway=subprocess.Popen(['node',str(ROOT/'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',str(frontend_port),'--strictPort'],cwd=ROOT,env=gateway_env,stdout=output,stderr=output)
            address=f'http://127.0.0.1:{frontend_port}';assert is_loopback_url(address)
            with httpx.Client(trust_env=False) as client:
                for _ in range(80):
                    try:
                        if client.get(address,timeout=.3).status_code==200:break
                    except httpx.HTTPError:pass
                    if gateway.poll() is not None:raise AssertionError(log.read_text())
                    time.sleep(.1)
                else:raise AssertionError('Council gateway not ready')
            yield address
        finally:
            for process in [gateway,backend]:
                if process is None:continue
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
            sock.close()

def setup(page,address,financial=None):
    fictional_portfolio(page)
    page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fictional-council-session")')
    stamp=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()-2))
    quotes={'MSFT':{'symbol':'MSFT','returnedSymbol':'MSFT','provider':'yahoo','sourceMode':'live','price':100,'changePct':0,'currency':'USD','marketTime':stamp,'retrievedAt':stamp,'notes':'fictional-private-notes','quantity':1000}}
    page.route('**/api/live-data*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'stockPrices':quotes,'news':[],'contracts':[],'congressTrades':[],'macroRisks':[],'timestamp':int(time.time()*1000)})))
    if financial is not None:
        page.route('**/api/company-scale?action=peer-fundamentals*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'results':[{'symbol':'MSFT','metrics':{},'councilSource':financial}]})))
    requests=[];errors=[]
    page.on('request',lambda req:requests.append(req) if '/api/' in req.url and req.method!='GET' else None)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/api/agent-ask?task=council',lambda route:route.continue_())
    page.goto(address+'/jev-lab');page.wait_for_load_state('networkidle')
    panel=page.get_by_test_id('portfolio-council')
    panel.locator('summary').first.focus();panel.locator('summary').first.press('Enter')
    return panel,requests,errors

def test_fictional_demo_actual_transport_keyboard_and_responsive_layout(page,council_gateway):
    panel,calls,errors=setup(page,council_gateway);assert calls==[]
    panel.get_by_role('button',name='Run fictional council demo',exact=True).dblclick()
    result=panel.get_by_test_id('council-result')
    expect(result).to_contain_text('FICT · Fictional demonstration')
    expect(result).to_contain_text('insufficient evidence')
    expect(panel.get_by_role('button',name='Check coverage with TypeSafe',exact=True)).to_be_disabled()
    assert len(calls)==1 and calls[0].post_data_json['mode']=='demo'
    assert set(calls[0].post_data_json)=={'mode','run_id','assessed_at'}
    panel.get_by_text('Evidence provenance and run trace',exact=True).click()
    expect(result).to_contain_text('Provider requests: 0')
    expect(result).to_contain_text('No decision eligibility was granted')
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    for width in [360,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        assert panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        panel.screenshot(path=str(ARTIFACTS/f'portfolio-council-{width}.png'))
    assert errors==[]

def test_loaded_metadata_unknowns_stay_unknown_and_typesafe_is_separate_explicit_call(page,council_gateway):
    panel,calls,errors=setup(page,council_gateway)
    expect(panel.get_by_role('button',name='Analyze loaded evidence',exact=True)).to_be_disabled()
    panel.get_by_role('button',name='Inspect loaded sources',exact=True).click()
    expect(panel.get_by_test_id('council-source-receipt')).to_contain_text('Inspection makes no request')
    assert calls==[]
    panel.get_by_role('button',name='Analyze loaded evidence',exact=True).click()
    result=panel.get_by_test_id('council-result');expect(result).to_contain_text('MSFT · Loaded evidence review')
    expect(result).to_contain_text('insufficient evidence')
    assert len(calls)==1
    payload=calls[0].post_data_json
    assert payload['mode']=='loaded' and payload['packet']['evidence'][1]['value']==0
    assert payload['packet']['evidence'][0]['published_at'] is None
    assert 'fictional-private' not in json.dumps(payload)
    panel.get_by_role('button',name='Check coverage with TypeSafe',exact=True).click()
    expect(panel).to_contain_text('TypeSafe coverage: needs data')
    assert len(calls)==2 and calls[1].post_data_json['mode']=='jev'
    assert 'evidence' not in calls[1].post_data_json['state'] and 'summary' not in calls[1].post_data_json['state']
    expect(panel.get_by_role('button',name='Check coverage with TypeSafe',exact=True)).to_be_disabled()
    panel.get_by_role('combobox',name='Council research horizon',exact=True).select_option('6')
    expect(result).to_have_count(0)
    assert len(calls)==2 and errors==[]

def test_failures_redacted_no_automatic_retry_session_limit_survives_selection(page,council_gateway):
    panel,calls,_=setup(page,council_gateway)
    page.route('**/api/agent-ask?task=council',lambda route:route.fulfill(status=503,body='{"error":"fictional-private-upstream"}',content_type='application/json'))
    for index in range(5):
        panel.get_by_role('button',name='Run fictional council demo',exact=True).click()
        expect(panel.get_by_role('alert')).to_contain_text('No automatic retry occurred')
        assert len(calls)==index+1
    panel.get_by_role('combobox',name='Council research horizon',exact=True).select_option('12')
    expect(panel.get_by_role('button',name='Run fictional council demo',exact=True)).to_be_disabled()
    assert 'fictional-private-upstream' not in panel.inner_text()

def test_production_build_omits_council(page):
    address=os.getenv('QA_LOGIN_BASE_URL')
    if not address:pytest.skip('Requires non-QA production build loopback preview')
    assert is_loopback_url(address)
    fictional_portfolio(page);page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fictional-council-session")')
    page.goto(address+'/jev-lab');page.wait_for_load_state('networkidle')
    expect(page.get_by_test_id('portfolio-council')).to_have_count(0)

def test_source_receipt_retains_filing_days_and_formulas_and_freezes_model_snapshot_across_feed_refresh(page,council_gateway):
    source=json.loads((ROOT/'qa/fixtures/council-source-receipt.fictional.json').read_text())
    panel,calls,errors=setup(page,council_gateway,source)
    panel.get_by_role('button',name='Inspect loaded sources',exact=True).click()
    receipt=panel.get_by_test_id('council-source-receipt')
    expect(receipt).to_contain_text('6 observations')
    expect(receipt).to_contain_text('free cash flow usd: -5 USD')
    expect(receipt).to_contain_text('liabilities equity: 2 ratio')
    expect(receipt).to_contain_text('Filed 2026-02-20 (date only)')
    assert calls==[]
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    for width in [360,768,1440]:
        page.set_viewport_size({'width':width,'height':1000})
        assert panel.evaluate('(e)=>e.scrollWidth<=e.clientWidth')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        receipt.screenshot(path=str(ARTIFACTS/f'portfolio-council-sources-fictional-{width}.png'))
    stamp=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(time.time()-1))
    page.route('**/api/live-data*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'stockPrices':{'MSFT':{'symbol':'MSFT','returnedSymbol':'MSFT','provider':'yahoo','sourceMode':'live','price':200,'changePct':0,'currency':'USD','marketTime':stamp,'retrievedAt':stamp}},'news':[],'contracts':[],'congressTrades':[],'macroRisks':[],'timestamp':int(time.time()*1000)})))
    page.get_by_role('button',name='REFRESH FEED',exact=True).click()
    expect(page.get_by_role('button',name='REFRESH FEED',exact=True)).to_be_enabled()
    panel.get_by_role('button',name='Analyze loaded evidence',exact=True).click()
    expect(panel.get_by_test_id('council-result')).to_contain_text('insufficient evidence')
    assert len(calls)==1
    evidence=calls[0].post_data_json['packet']['evidence']
    assert next(e for e in evidence if e['metric']=='price')['value']==100
    financial=next(e for e in evidence if e['metric']=='revenue_growth_pct')
    assert financial['observed_at'] is None and financial['published_at'] is None and financial['period_start']=='2025-01-01'
    assert 'accession' not in json.dumps(calls[0].post_data_json) and 'filed_on' not in json.dumps(calls[0].post_data_json)
    panel.get_by_role('button',name='Inspect loaded sources',exact=True).click()
    expect(panel.get_by_test_id('council-result')).to_have_count(0)
    panel.get_by_role('button',name='Analyze loaded evidence',exact=True).click()
    expect(panel.get_by_test_id('council-result')).to_be_visible()
    assert next(e for e in calls[1].post_data_json['packet']['evidence'] if e['metric']=='price')['value']==200
    assert len(calls)==2 and errors==[]

def test_loaded_calendar_date_only_is_inspectable_without_inventing_a_countdown_or_fetching_from_lab(page,council_gateway):
    panel,calls,errors=setup(page,council_gateway)
    payload={'ok':True,'upcoming':[{'id':'fictional-date-only','symbol':'MSFT','date':'2026-11-12','title':'Fictional event','source':'Fictional issuer','confirmation':'estimated'}]}
    page.route('**/api/earnings-alerts*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(payload)))
    with page.expect_response(lambda response:'/api/earnings-alerts?' in response.url and 'history=' not in response.url):
        page.get_by_test_id('nav-watchlist').click()
    page.get_by_role('heading',name='Watchlist',exact=True).wait_for()
    page.wait_for_load_state('networkidle')
    page.get_by_test_id('nav-jev-lab').click();page.wait_for_load_state('networkidle')
    panel=page.get_by_test_id('portfolio-council')
    if not panel.evaluate('(e)=>e.open'):panel.locator('summary').first.click()
    manual=[];page.on('request',lambda r:manual.append(r.url) if '/api/' in r.url else None)
    panel.get_by_role('button',name='Inspect loaded sources',exact=True).click()
    expect(panel.get_by_test_id('council-source-receipt')).to_contain_text('EVENT TIME PRECISION MISSING')
    panel.get_by_role('button',name='Analyze loaded evidence',exact=True).click()
    expect(panel.get_by_test_id('council-result')).to_be_visible()
    assert len(calls)==1 and all(e['family']!='catalyst' for e in calls[0].post_data_json['packet']['evidence'])
    assert len(manual)==1 and 'task=council' in manual[0] and errors==[]
