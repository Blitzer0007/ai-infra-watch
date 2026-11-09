"""Offline council acceptance: bounded model choices, evidence and authority boundaries."""
import json
from types import SimpleNamespace
import httpx
import pytest
from app.agents.portfolio_council import PortfolioCouncil, FictionalCouncilModel, fictional_packet, parse_packet, decode
from app.agents.council_model import NvidiaCouncilModel
from app.jev.council import assess_council_summary, valid_summary

STAMP='2026-11-09T12:00:00Z'

def packet(verified=False):
    value=fictional_packet('test',STAMP).model_dump(mode='json')
    if verified:
        for row in value['evidence']:
            row.update(simulated=False,source_id='loaded')
    return parse_packet(json.dumps(value).encode())

class Script(FictionalCouncilModel):
    mode='nvidia'  # Mock model only. Never contacts a provider.
    def __init__(self,mutate=None):self.contexts=[];self.mutate=mutate
    def complete(self,role,messages,**kwargs):
        self.contexts.append((role,messages,kwargs))
        step=json.loads(super().complete(role,messages,**kwargs))
        if self.mutate:step=self.mutate(role,messages,step)
        return json.dumps(step)

def test_independent_openings_judge_context_bounded_tools_and_no_authority():
    model=Script();p=packet(True);before=p.model_dump_json()
    result=PortfolioCouncil(model).run(p)
    assert result['status']=='complete' and result['disposition']=='balanced'
    assert p.model_dump_json()==before
    openings=[json.loads(messages[1]['content']) for role,messages,_ in model.contexts if len(messages)==2]
    assert openings[0]==openings[1] and 'arguments' not in openings[1]
    assert set(openings[2]['arguments'])=={'bull','bear'}
    assert all('value' not in row for row in openings[0]['catalog'])
    assert result['usage']['model_calls']==6 and result['usage']['tool_calls']==3
    assert result['usage']['provider_requests']==0 and result['usage']['jev_calls']==0
    assert all(0<kw['timeout_seconds']<=6 and kw['max_output_tokens']==600 for _,_,kw in model.contexts)
    for key in ['source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages']:assert result[key] is False

def test_fixture_is_never_usable_and_missing_model_is_honest():
    result=PortfolioCouncil(FictionalCouncilModel()).run(packet())
    assert result['mode']=='fixture' and result['disposition']=='insufficient-evidence' and not result['quality']['usable_ids']
    assert PortfolioCouncil().run(packet())['status']=='unavailable'
    assert result['snapshot_id']==PortfolioCouncil().run(packet())['snapshot_id']
    assert PortfolioCouncil(FictionalCouncilModel()).run(packet(True))['disposition']=='insufficient-evidence'

@pytest.mark.parametrize('change',['unknown-citation','uninspected','wrong-implication','duplicate','new-number','judge-unknown','judge-uninspected','tool-loop','extra','private-error'])
def test_contract_failures_are_closed_and_redacted(change):
    def mutate(role,messages,step):
        if change=='private-error':raise ValueError('fictional-private-key')
        if role=='bull':
            if change=='uninspected' and step['action']=='inspect':step['evidence_ids']=['fixture:price']
            if step['action']=='conclude':
                if change=='unknown-citation':step['claims'][0]['evidence_id']='outside'
                if change=='uninspected':step['claims']=[{'evidence_id':'fixture:revenue_growth_pct','stance':'support','implication':'growth'}]
                if change=='wrong-implication':step['claims'][0]['implication']='cash-flow'
                if change=='duplicate':step['claims']*=2
                if change=='new-number':step['summary']='Expected return is 90 percent'
                if change=='extra':step['secret']='fictional-private-key'
                if change=='tool-loop':return {'action':'coverage','families':['risk']}
        if role=='judge' and step['action']=='judge':
            if change=='judge-unknown':step.update(preference='bull',winning_claim_ids=['bull:3'])
            if change=='judge-uninspected':step.update(preference='bull',winning_claim_ids=['bull:0'])
        return step
    result=PortfolioCouncil(Script(mutate)).run(packet(True))
    assert result['status'] in ['failed','partial'] and result['disposition']=='insufficient-evidence'
    assert result['usage']['model_calls']<=6 and 'fictional-private-key' not in json.dumps(result)

def test_directional_judge_must_inspect_winning_citation():
    def mutate(role,messages,step):
        if role=='judge':
            if len(messages)==2:return {'action':'inspect','evidence_ids':['fixture:revenue_growth_pct']}
            return {'action':'judge','preference':'bull','summary':'The inspected growth supports the conditional case.','winning_claim_ids':['bull:0']}
        return step
    assert PortfolioCouncil(Script(mutate)).run(packet(True))['disposition']=='provisional-bull'

@pytest.mark.parametrize('change',['stale','missing','unknown','period','conflict','future','estimate'])
def test_quality_gates_cannot_be_overridden(change):
    value=packet(True).model_dump(mode='json');row=value['evidence'][1]
    if change=='stale':row.update(observed_at='2020-01-01T00:00:00Z',published_at='2020-01-01T00:00:00Z')
    if change=='missing':row['retrieved_at']=None
    if change=='unknown':row['source_id']='unknown'
    if change=='period':row['period_start']=None
    if change=='estimate':row['basis']='estimate'
    if change=='future':row['published_at']='2027-01-01T00:00:00Z'
    if change=='conflict':value['evidence'].append({**row,'evidence_id':'conflict','value':99.})
    result=PortfolioCouncil(Script()).run(parse_packet(json.dumps(value).encode()))
    assert result['status']=='complete' and result['disposition']=='insufficient-evidence'
    assert result['quality']['missing_families']
    if change=='conflict':assert result['quality']['conflicting_ids']==['conflict','fixture:revenue_growth_pct']

@pytest.mark.parametrize('raw',[b'{"a":1,"a":2}',b'{"a":NaN}',b'\xff',b'[]'*20000])
def test_strict_json_rejects_ambiguous_or_unbounded_inputs(raw):
    with pytest.raises((ValueError,UnicodeError)):decode(raw)

@pytest.mark.parametrize('ticks',[[0,41],[10,9],[0,0,41]])
def test_clock_deadline_and_rollback_fail_closed(ticks):
    clock=iter(ticks);result=PortfolioCouncil(Script(),clock=lambda:next(clock)).run(packet(True))
    assert result['status']=='partial' and result['termination_reason']=='budget'

def test_invalid_json_model_response_is_not_a_prose_fallback():
    model=SimpleNamespace(mode='nvidia',complete=lambda *_a,**_k:'Buy now!')
    assert PortfolioCouncil(model).run(packet())['status']=='failed'

@pytest.fixture
def enabled(monkeypatch):
    for key in ['VERCEL','NODE_ENV','VERCEL_ENV']:monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('COUNCIL_DEV_ENABLED','true');monkeypatch.setenv('COUNCIL_LIVE_DEV_ENABLED','true')

@pytest.mark.parametrize('status',[200,302,429,500])
def test_nvidia_adapter_one_attempt_fixed_endpoint_and_redaction(enabled,status):
    requests=[]
    def route(request):
        requests.append(request)
        return httpx.Response(status,json={'choices':[{'message':{'content':'{}'}}],'private':'fictional-provider-body'},headers={'Location':'https://other.invalid'})
    model=NvidiaCouncilModel('fictional-key','openai/gpt-oss-20b',transport=httpx.MockTransport(route))
    if status==200:assert model.complete('bull',[],timeout_seconds=1,max_output_tokens=999)=='{}'
    else:
        with pytest.raises(ValueError,match='^Council model request unavailable$'):model.complete('bull',[],timeout_seconds=1,max_output_tokens=999)
    assert len(requests)==model.http_attempts==1
    assert str(requests[0].url)=='https://integrate.api.nvidia.com/v1/chat/completions'
    assert json.loads(requests[0].content)['max_tokens']==600

def test_nvidia_rejects_disabled_mode_free_suffix_and_oversized_response(enabled,monkeypatch):
    with pytest.raises(ValueError):NvidiaCouncilModel('fictional','openai/gpt-oss-20b:free')
    model=NvidiaCouncilModel('fictional','openai/gpt-oss-20b',transport=httpx.MockTransport(lambda _:httpx.Response(200,content=b'x'*32769)))
    with pytest.raises(ValueError):model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    monkeypatch.setenv('VERCEL','1')
    with pytest.raises(ValueError):model.complete('bull',[],timeout_seconds=1,max_output_tokens=600)
    assert model.http_attempts==1

@pytest.mark.parametrize('budget',[0,-1,float('nan'),True])
def test_nvidia_invalid_budget_never_attempts_http(enabled,budget):
    model=NvidiaCouncilModel('fictional','openai/gpt-oss-20b',transport=httpx.MockTransport(lambda _:pytest.fail('HTTP forbidden')))
    with pytest.raises(ValueError):model.complete('bull',[],timeout_seconds=budget,max_output_tokens=600)
    assert model.http_attempts==0

def summary():
    return {'contract_version':'council-coverage-v1','mode':'nvidia','observed_count':4,'usable_count':4,'missing_families':[],'conflict_count':0,'bull_claim_count':1,'bear_claim_count':1,'role_count':3,'judge_abstained':False}

def test_typesafe_disabled_invalid_summary_and_typed_overrides(enabled,monkeypatch):
    from app.jev.client import JevEvaluation,JevAnswer
    calls=[]
    class Client:
        def evaluate(self,**kwargs):
            calls.append(kwargs)
            return JevEvaluation(answers={'coverage':JevAnswer(type='choice',choice='reviewable'),'next_check':JevAnswer(type='choice',choice='wait_for_outcome')},input_tokens=123)
    assert not assess_council_summary(summary(),'test',Client())['available'] and calls==[]
    monkeypatch.setenv('COUNCIL_JEV_DEV_ENABLED','true')
    assert not valid_summary({**summary(),'missing_families':[{}]})
    assert not assess_council_summary({**summary(),'secret':'private'},'test',Client())['available'] and calls==[]
    result=assess_council_summary({**summary(),'missing_families':['risk']},'test',Client())
    assert result['coverage']=='needs_data' and result['next_check']=='verify_sources' and not result['grants_decision_eligibility']
    result=assess_council_summary({**summary(),'conflict_count':2},'test',Client())
    assert result['next_check']=='inspect_disagreement' and result['input_tokens']==123
    assert set(json.loads(calls[0]['state']))==set(summary()) and len(calls[0]['questions'])==2
    bad=SimpleNamespace(evaluate=lambda **_:JevEvaluation(answers={'coverage':JevAnswer(type='score',choice='reviewable')}))
    assert assess_council_summary(summary(),'test',bad)['error_code']=='assessment-unavailable'
