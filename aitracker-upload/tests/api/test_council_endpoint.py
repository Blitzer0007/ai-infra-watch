"""Real private FastAPI route; provider/planner/database paths remain mocked or forbidden."""
import importlib.util
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.agents import council_http
from app.agents.portfolio_council import fictional_packet

ROOT=Path(__file__).resolve().parents[3]
REQUEST={'mode':'demo','run_id':'test','assessed_at':'2026-11-09T12:00:00Z'}
HEADERS={'Authorization':'Bearer fictional-backend','Content-Type':'application/json'}

@pytest.fixture
def client(monkeypatch):
    spec=importlib.util.spec_from_file_location('council_test_api',ROOT/'api/agent-python.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    monkeypatch.setattr(module.settings,'AGENT_API_TOKEN','fictional-backend');monkeypatch.setenv('COUNCIL_DEV_ENABLED','true')
    for key in ['VERCEL','VERCEL_ENV','NODE_ENV','COUNCIL_LIVE_DEV_ENABLED','COUNCIL_JEV_DEV_ENABLED']:monkeypatch.delenv(key,raising=False)
    monkeypatch.setattr(module,'get_toolbox',lambda:pytest.fail('discovery forbidden'))
    monkeypatch.setattr(module,'AutonomousMCPAgent',lambda *_a,**_k:pytest.fail('general planner forbidden'))
    return TestClient(module.app)

def test_demo_auth_method_limits_and_redaction(client):
    path='/api/agent-python?task=council'
    assert client.post(path,content=b'bad').status_code==401
    assert client.get(path,headers=HEADERS).status_code==405
    assert client.post(path,content=b'{}',headers={**HEADERS,'Content-Type':'text/plain'}).status_code==415
    assert client.post(path,content=b'x'*32769,headers=HEADERS).status_code==413
    for raw in [b'{"mode":"demo","mode":"loaded"}',b'\xff',json.dumps({**REQUEST,'api_key':'fictional-private-key'}).encode()]:
        response=client.post(path,content=raw,headers=HEADERS)
        assert response.status_code==400 and 'fictional-private-key' not in response.text
    response=client.post(path,json=REQUEST,headers=HEADERS)
    assert response.status_code==200 and response.headers['cache-control']=='no-store'
    assert response.json()['mode']=='fixture' and response.json()['usage']['provider_requests']==0

@pytest.mark.parametrize(('key','value'),[('COUNCIL_DEV_ENABLED','false'),('VERCEL','1'),('NODE_ENV','production'),('VERCEL_ENV','production')])
def test_production_cannot_run_council(client,monkeypatch,key,value):
    monkeypatch.setenv(key,value)
    assert client.post('/api/agent-python?task=council',json=REQUEST,headers=HEADERS).status_code==404

def test_loaded_model_disabled_and_single_concurrency_slot(client):
    response=client.post('/api/agent-python?task=council',json={'mode':'loaded','packet':fictional_packet('test',REQUEST['assessed_at']).model_dump(mode='json')},headers=HEADERS)
    assert response.status_code==503
    assert council_http._slot.acquire(blocking=False)
    try:assert client.post('/api/agent-python?task=council',json=REQUEST,headers=HEADERS).status_code==429
    finally:council_http._slot.release()
