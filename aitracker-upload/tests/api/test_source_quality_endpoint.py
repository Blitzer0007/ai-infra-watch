"""Development compute endpoint only; all model/source/database access is forbidden."""
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

ROOT=Path(__file__).resolve().parents[3]


@pytest.fixture
def api(monkeypatch):
    spec=importlib.util.spec_from_file_location('source_quality_api',ROOT/'api/agent-python.py')
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.settings,'AGENT_API_TOKEN','fictional-backend')
    monkeypatch.setenv('SOURCE_QUALITY_DEV_ENABLED','true')
    for key in ['VERCEL','VERCEL_ENV','NODE_ENV']:
        monkeypatch.delenv(key,raising=False)
    monkeypatch.setattr(module,'get_toolbox',lambda:pytest.fail('tool discovery forbidden'))
    monkeypatch.setattr(module,'AutonomousMCPAgent',lambda *_a,**_k:pytest.fail('general planner forbidden'))
    return module,TestClient(module.app)


def cases():
    return json.loads((ROOT/'aitracker-upload/data/research/source-quality-ui-cases.json').read_text())


@pytest.mark.parametrize('kind',['covered','missing','conflict'])
def test_loaded_packet_runs_real_agent_without_discovery(api,kind):
    _,client=api
    item=next(row for row in cases() if row['kind']==kind)
    response=client.post('/api/agent-python?task=source-quality',json=item['request'],headers={'Authorization':'Bearer fictional-backend'})
    assert response.status_code==200 and response.json()==item['result']
    assert response.headers['cache-control']=='no-store'


def test_authentication_is_required_before_body_parsing(api,monkeypatch):
    module,client=api
    response=client.post('/api/agent-python?task=source-quality',content=b'not-json')
    assert response.status_code==401 and 'not-json' not in response.text
    monkeypatch.setattr(module.settings,'AGENT_API_TOKEN','')
    response=client.post('/api/agent-python?task=source-quality',json=cases()[0]['request'])
    assert response.status_code==503


@pytest.mark.parametrize(('key','value'),[('SOURCE_QUALITY_DEV_ENABLED','false'),('VERCEL','1'),('NODE_ENV','production'),('VERCEL_ENV','production')])
def test_production_or_disabled_modes_cannot_execute(api,monkeypatch,key,value):
    _,client=api
    monkeypatch.setenv(key,value)
    response=client.post('/api/agent-python?task=source-quality',json=cases()[0]['request'],headers={'Authorization':'Bearer fictional-backend'})
    assert response.status_code==404 and response.headers['cache-control']=='no-store'


def test_method_task_body_limit_and_redaction(api):
    _,client=api
    headers={'Authorization':'Bearer fictional-backend','Content-Type':'application/json'}
    assert client.get('/api/agent-python?task=source-quality&probe_mcp=true',headers=headers).status_code==405
    assert client.post('/api/agent-python?task=other',json={},headers=headers).status_code==400
    assert client.post('/api/agent-python?task=source-quality',content=b'x'*65537,headers=headers).status_code==413
    assert client.post('/api/agent-python?task=source-quality',content=b'{}',headers={**headers,'Content-Type':'text/plain'}).status_code==415
    for extra in [{'policy':{}},{'api_key':'fictional-private-value'},{'question':'send Telegram'}]:
        response=client.post('/api/agent-python?task=source-quality',json={**cases()[0]['request'],**extra},headers=headers)
        assert response.status_code==400 and 'fictional-private-value' not in response.text
    raw=b'{"run_id":"a","run_id":"b"}'
    assert client.post('/api/agent-python?task=source-quality',content=raw,headers=headers).status_code==400


def test_all_cross_language_fixtures_remain_python_contracts():
    from app.agents.source_quality import SourceQualityAgent
    for item in cases():
        if item['kind']=='budget':
            ticks=iter([0,0,0,2]);agent=SourceQualityAgent(clock=lambda:next(ticks))
        else:agent=SourceQualityAgent(clock=lambda:0)
        assert agent.run_json(json.dumps(item['request']).encode()).model_dump(mode='json')==item['result']


def test_endpoint_import_keeps_optional_planner_and_model_clients_uninitialized():
    code="import importlib.util,sys; s=importlib.util.spec_from_file_location('source_import','api/agent-python.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); assert 'app.llm.client' not in sys.modules; assert 'langgraph' not in sys.modules"
    subprocess.run([sys.executable,'-c',code],cwd=ROOT,env={'PYTHONPATH':str(ROOT/'aitracker-upload')},check=True)


def test_general_question_schema_is_preserved(api):
    module,_=api
    schema=module.app.openapi()
    assert schema['components']['schemas']['AutonomousRequest']['required']==['question']
