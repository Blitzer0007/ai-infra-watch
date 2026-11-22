"""Fictional transports only; no credentials, live models or investment claims."""
import json
import httpx
import pytest
from app.agents.council_model import OpenRouterFreeCouncilModel, RoleRoutedCouncilModel, configured_role_model
from app.agents.council_model import NvidiaCouncilModel
from app.agents.council_model import NVIDIA_FIRST_MODELS
from app.jev.council import valid_summary
from app.agents.council_http import loaded_model
from app.agents.portfolio_council import PortfolioCouncil, FictionalCouncilModel, fictional_packet

@pytest.fixture
def enabled(monkeypatch):
    for name in ('VERCEL','VERCEL_ENV','NODE_ENV'):
        monkeypatch.delenv(name,raising=False)
    for name in ('COUNCIL_DEV_ENABLED','COUNCIL_LIVE_DEV_ENABLED','COUNCIL_MULTI_MODEL_DEV_ENABLED'):
        monkeypatch.setenv(name,'true')

MODELS={'bull':'nvidia/fictional-bull:free','bear':'baidu/fictional-bear:free','judge':'example/fictional-judge:free'}

def routes(calls=None):
    calls=[] if calls is None else calls
    result={}
    for role,model_id in MODELS.items():
        def handler(request,role=role,model_id=model_id):
            calls.append((role,request))
            messages=json.loads(request.content)['messages']
            content=FictionalCouncilModel().complete(role,messages,timeout_seconds=1,max_output_tokens=600)
            return httpx.Response(200,json={'model':model_id,'choices':[{'message':{'content':content}}], 'usage':{'prompt_tokens':123,'completion_tokens':40,'cost':0}})
        result[role]=OpenRouterFreeCouncilModel('fictional-dev-key',model_id,transport=httpx.MockTransport(handler))
    return result

def test_three_roles_use_exact_distinct_models_with_one_shared_budget(enabled):
    calls=[];model=RoleRoutedCouncilModel(routes(calls))
    result=PortfolioCouncil(model).run(fictional_packet('roles','2026-11-09T12:00:00Z'))
    assert result['mode']=='multi-model' and result['status']=='complete'
    assert result['disposition']=='insufficient-evidence' and result['grants_decision_eligibility'] is False
    assert len(calls)==model.http_attempts==6
    assert {role:len([x for x in calls if x[0]==role]) for role in MODELS}=={'bull':2,'bear':2,'judge':2}
    for role,request in calls:
        payload=json.loads(request.content)
        assert str(request.url)=='https://openrouter.ai/api/v1/chat/completions'
        assert payload['model']==MODELS[role] and payload['provider']=={'allow_fallbacks':False,'data_collection':'deny','max_price':{'prompt':0,'completion':0,'request':0}}
        assert 'models' not in payload and payload['max_tokens']<=600
    assert all(r['reported_cost_usd']==0 and r['input_tokens']==123 and r['latency_ms']>=0 for r in model.receipts)
    assert 'fictional-dev-key' not in json.dumps(model.manifest)+json.dumps(model.receipts)
    with pytest.raises(ValueError):model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    assert len(calls)==6

@pytest.mark.parametrize('name',['openrouter/free','openai/paid-model','openai/paid-model:latest','https://other.invalid/model','model:free','openai/model:free\n'])
def test_random_paid_or_malformed_model_routes_are_rejected_before_transport(enabled,name):
    with pytest.raises(ValueError):OpenRouterFreeCouncilModel('fictional-key',name,transport=httpx.MockTransport(lambda _:pytest.fail('No HTTP')))

def test_duplicate_models_and_partial_role_configuration_cannot_silently_use_a_single_model(enabled):
    r=routes();r['bear']=r['bull']
    with pytest.raises(ValueError):RoleRoutedCouncilModel(r)
    with pytest.raises(ValueError):RoleRoutedCouncilModel({'bull':routes()['bull']})
    assert configured_role_model({}) is None

@pytest.mark.parametrize('failure',['redirect','rate','identity','charged','oversize'])
def test_failures_do_not_retry_switch_models_or_return_provider_bodies(enabled,failure):
    calls=[]
    def handler(req):
        calls.append(req)
        if failure=='redirect':return httpx.Response(302,headers={'location':'https://other.invalid'},json={'private':'private-provider-body'})
        if failure=='rate':return httpx.Response(429,json={'private':'private-provider-body'})
        if failure=='oversize':return httpx.Response(200,content=b'x'*32769)
        return httpx.Response(200,json={'model':'other/model:free' if failure=='identity' else MODELS['bull'],'choices':[{'message':{'content':'{}'}}],'usage':{'cost':1 if failure=='charged' else 0}})
    model=OpenRouterFreeCouncilModel('fictional-key',MODELS['bull'],transport=httpx.MockTransport(handler))
    with pytest.raises(ValueError,match='^Council model request unavailable$'):model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    assert len(calls)==1 and len(model.receipts)==1 and model.receipts[0]['status']=='unavailable'
    assert 'private-provider-body' not in json.dumps(model.receipts)

def test_server_config_is_explicit_and_production_disable_is_rechecked(enabled,monkeypatch):
    monkeypatch.setenv('COUNCIL_OPENROUTER_API_KEY','fictional-role-key')
    for role,model in MODELS.items():
        monkeypatch.setenv('COUNCIL_'+role.upper()+'_PROVIDER','openrouter-free')
        monkeypatch.setenv('COUNCIL_'+role.upper()+'_MODEL',model)
    model=loaded_model();assert isinstance(model,RoleRoutedCouncilModel)
    assert {role:v['model'] for role,v in model.manifest.items()}==MODELS
    monkeypatch.delenv('COUNCIL_BEAR_MODEL');assert loaded_model() is None
    monkeypatch.setenv('COUNCIL_BEAR_MODEL',MODELS['bear'])
    monkeypatch.setenv('VERCEL','1');assert loaded_model() is None
    with pytest.raises(ValueError):model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    assert model.http_attempts==0

def test_missing_usage_is_unknown_rather_than_a_claim_of_zero_cost(enabled):
    model=OpenRouterFreeCouncilModel('fictional-key',MODELS['bull'],transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'model':MODELS['bull'],'choices':[{'message':{'content':'{}'}}]})))
    model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    assert model.receipts[0]['reported_cost_usd'] is None and model.receipts[0]['input_tokens'] is None

def test_nvidia_reported_identity_mismatch_fails_and_multi_model_jev_remains_counts_only(enabled):
    model=NvidiaCouncilModel('fictional-key','openai/fictional',transport=httpx.MockTransport(lambda _:httpx.Response(200,json={'model':'different/model','choices':[{'message':{'content':'{}'}}]})))
    with pytest.raises(ValueError):model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    state={'contract_version':'council-coverage-v1','mode':'multi-model','observed_count':4,'usable_count':0,'missing_families':['risk'],'conflict_count':0,'bull_claim_count':0,'bear_claim_count':0,'role_count':3,'judge_abstained':True}
    assert valid_summary(state)
    assert not valid_summary({**state,'model_key':'private'})

def test_owner_selected_nvidia_profile_has_three_explicit_models_and_no_partial_override(enabled):
    config={'COUNCIL_LIVE_DEV_ENABLED':'true','COUNCIL_MULTI_MODEL_DEV_ENABLED':'true','COUNCIL_MODEL_PROFILE':'nvidia-first-v1','COUNCIL_NVIDIA_API_KEY':'fictional-nvidia-dev-key'}
    model=configured_role_model(config)
    assert model is not None and model.http_attempts==0
    assert {role:v['model'] for role,v in model.manifest.items()}==NVIDIA_FIRST_MODELS
    assert all(v['provider']=='nvidia' for v in model.manifest.values())
    assert configured_role_model({**config,'COUNCIL_BULL_MODEL':'different/model'}) is None
    assert configured_role_model({**config,'COUNCIL_MODEL_PROFILE':'unknown-profile'}) is None
    assert configured_role_model({**config,'COUNCIL_NVIDIA_API_KEY':''}) is None
