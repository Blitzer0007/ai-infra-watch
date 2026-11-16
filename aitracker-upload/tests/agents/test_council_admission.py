"""Conditional declarations, not issuer authentication or predictive validation. Zero I/O."""
import copy
from datetime import timedelta
import hashlib
import json
from pathlib import Path
import pytest
from app.agents.council_admission import evaluate, parse_request, publication_window
from app.agents.portfolio_council import PortfolioCouncil, FictionalCouncilModel, instant

ROOT=Path(__file__).resolve().parents[3]
def fixture():return json.loads((ROOT/'qa/fixtures/council-admission.fictional.json').read_text())
def request():return copy.deepcopy(fixture()['request'])
def raw(v):return json.dumps(v,separators=(',',':'),allow_nan=False).encode()
def record(result,key):return next(r for r in result['records'] if r['evidence_id']==key)
def source(v,key='sec:revenue_growth_pct'):return next(o for o in v['sources']['sec']['observations'] if o['evidence']['evidence_id']==key)
def row(v,key):return next(e for e in v['packet']['evidence'] if e['evidence_id']==key)
def assert_authority_false(v):
    for key in ['source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages']:assert v[key] is False

def test_cross_language_fixture_uses_real_python_engine_and_unchanged_original_evidence():
    f=fixture();encoded=f['request_raw'].encode();before=encoded[:]
    a=evaluate(encoded);assert a==f['admission'] and a['status']=='conditional' and len(a['quality']['usable_ids'])==7
    assert a['request_sha256']==hashlib.sha256(encoded).hexdigest();assert_authority_false(a)
    result=PortfolioCouncil(FictionalCouncilModel(),clock=lambda:0).run_admitted(encoded)
    assert result==f['result'] and result['status']=='complete' and result['disposition']=='insufficient-evidence'
    assert encoded==before and result['evidence']==f['request']['packet']['evidence']
    assert result['evidence'][2]['published_at'] is None and result['evidence'][2]['observed_at'] is None
    assert result['evidence'][2]['basis']=='unknown';assert_authority_false(result)

@pytest.mark.parametrize('filed,earliest,latest',[
    ('2026-02-20','2026-02-19T10:00:00+00:00','2026-02-21T12:00:00+00:00'),
    ('2024-02-29','2024-02-28T10:00:00+00:00','2024-03-01T12:00:00+00:00'),
    ('2026-12-31','2026-12-30T10:00:00+00:00','2027-01-01T12:00:00+00:00'),
])
def test_date_only_range_is_fifty_hours_with_leap_and_year_boundaries(filed,earliest,latest):
    w=publication_window(filed);assert w['earliest']==earliest and w['latest_exclusive']==latest
    assert instant(latest)-instant(earliest)==timedelta(hours=50)

@pytest.mark.parametrize('cutoff,eligible',[
    ('2026-11-10T11:59:59.999999Z',False),('2026-11-10T12:00:00Z',True),('2026-11-10T12:00:00.000001Z',True),
])
def test_same_day_publication_uncertainty_stays_closed_until_upper_bound(cutoff,eligible):
    v=request();v['packet']['assessed_at']=cutoff;v['sources']['sec']['retrieved_at']=cutoff
    v['sources']['catalyst']=None;v['packet']['evidence']=[e for e in v['packet']['evidence'] if e['family']!='catalyst']
    for o in v['sources']['sec']['observations']:
        o['evidence']['retrieved_at']=cutoff;row(v,o['evidence']['evidence_id'])['retrieved_at']=cutoff
        for f in o['inputs']:f['filed_on']='2026-11-09'
    r=record(evaluate(raw(v)),'sec:revenue_growth_pct');assert r['eligible'] is eligible
    assert ('PUBLICATION_WINDOW_UNCLOSED' in r['reason_codes']) is (not eligible)

def test_early_retrieval_does_not_prove_a_date_only_publication_instant():
    v=request()
    for o in v['sources']['sec']['observations']:
        for f in o['inputs']:f['filed_on']='2026-11-09'
    assert 'PUBLICATION_WINDOW_UNCLOSED' in record(evaluate(raw(v)),'sec:free_cash_flow_usd')['reason_codes']

@pytest.mark.parametrize('change',['value','tag','accession','period','private','boolean','cik','fatal','unused'])
def test_invalid_or_unbound_lineage_is_rejected_before_model_work(change):
    v=request();o=source(v)
    if change=='value':o['inputs'][0]['value']=999
    if change=='tag':o['inputs'][0]['tag']='Private narrative'
    if change=='accession':o['inputs'][1]['accession']='0000000001-25-000001'
    if change=='period':o['inputs'][1]['period_start']='2024-02-01'
    if change=='private':o['inputs'][0]['notes']='fictional-private'
    if change=='boolean':o['evidence']['value']=True
    if change=='cik':v['sources']['sec']['symbol']='NVDA'
    if change=='fatal':v['sources']['sec']['issues'].append('ISSUER_MISMATCH')
    if change=='unused':v['packet']['evidence']=[e for e in v['packet']['evidence'] if e['evidence_id']!='sec:revenue_growth_pct']
    with pytest.raises(ValueError):evaluate(raw(v))

@pytest.mark.parametrize('change',['simulated','unknown-source','unknown-basis','stale','future','retrieval-before-observation'])
def test_market_uses_actual_observation_without_borrowing_publication_time(change):
    v=request();e=row(v,'loaded:price')
    if change=='simulated':e['simulated']=True
    if change=='unknown-source':e['source_id']='unknown'
    if change=='unknown-basis':e['basis']='unknown'
    if change=='stale':e['observed_at']='2026-11-09T11:00:00Z'
    if change=='future':e['observed_at']='2026-11-09T12:00:00.000001Z'
    if change=='retrieval-before-observation':e['retrieved_at']='2026-11-09T11:00:00Z'
    result=evaluate(raw(v));assert not record(result,'loaded:price')['eligible']
    assert row(v,'loaded:price')['published_at'] is None and row(v,'loaded:price')['value']==100

def test_missing_lineage_cannot_be_replaced_by_claimed_reported_basis():
    v=request();v['sources']['sec']=None
    for e in v['packet']['evidence']:
        if e['family'] in ('financial','risk'):e['basis']='reported'
    result=evaluate(raw(v));assert result['status']=='needs-data'
    assert all(not r['eligible'] for r in result['records'] if r['kind'].startswith('sec-'))

@pytest.mark.parametrize('change',['countdown','publication','estimated','unconfirmed','past','beyond-year'])
def test_catalyst_has_recomputed_exact_countdown_and_confirmation_gates(change):
    v=request();c=v['sources']['catalyst'];e=row(v,c['evidence_id'])
    if change=='countdown':e['value']+=1
    if change=='publication':c['published_at']='2026-11-09T12:00:00.000001Z';e['published_at']=c['published_at']
    if change=='estimated':c['confirmation']='estimated';e['basis']='estimate'
    if change=='unconfirmed':c['confirmation_basis']=None
    if change in ('past','beyond-year'):
        c['event_at']='2026-11-08T12:00:00Z' if change=='past' else '2027-12-01T12:00:00Z'
        e['value']=(instant(c['event_at'])-instant(v['packet']['assessed_at']))//timedelta(microseconds=1)/86400000000
    if change=='countdown':
        with pytest.raises(ValueError):evaluate(raw(v))
    else:assert not record(evaluate(raw(v)),c['evidence_id'])['eligible']

def test_numeric_zero_and_negative_cash_flow_are_not_missing_or_imputed():
    v=request();a=evaluate(raw(v));assert record(a,'loaded:daily_change_pct')['eligible']
    assert row(v,'loaded:daily_change_pct')['value']==0 and row(v,'sec:free_cash_flow_usd')['value']==-5

def test_consistently_forged_declarations_do_not_authenticate_sources():
    v=request()
    for o in v['sources']['sec']['observations']:
        for f in o['inputs']:
            if f['tag']=='Revenues' and f['period_end']=='2025-12-31':f['value']=130
    source(v)['evidence']['value']=30;row(v,'sec:revenue_growth_pct')['value']=30
    source(v,'sec:operating_margin_pct')['evidence']['value']=24/130*100;row(v,'sec:operating_margin_pct')['value']=24/130*100
    a=evaluate(raw(v));assert record(a,'sec:revenue_growth_pct')['eligible'];assert_authority_false(a)

def test_repeated_original_fact_references_cannot_disagree_between_ratios():
    v=request();o=source(v);o['inputs'][0]['value']=130;o['evidence']['value']=30;row(v,'sec:revenue_growth_pct')['value']=30
    with pytest.raises(ValueError,match='Conflicting original fact'):evaluate(raw(v))

def test_model_contexts_receive_bound_admission_but_no_original_filing_receipts():
    class Model(FictionalCouncilModel):
        def complete(self,role,messages,**kwargs):
            context=json.loads(messages[1]['content']);assert 'source_admission' in context
            assert not any(key in '\n'.join(m['content'] for m in messages) for key in ['"accession"','"inputs"','"cik"'])
            return super().complete(role,messages,**kwargs)
    r=PortfolioCouncil(Model()).run_admitted(fixture()['request_raw'].encode());assert r['status']=='complete'

def test_cited_conditional_preference_remains_provisional_without_action_authority():
    class Model:
        mode='nvidia';http_attempts=0
        def complete(self,role,messages,**_kwargs):
            evidence='sec:liabilities_equity' if role in ('bear','judge') else 'sec:revenue_growth_pct'
            if len(messages)==2:return json.dumps({'action':'inspect','evidence_ids':[evidence]})
            if role=='judge':return json.dumps({'action':'judge','preference':'bear','summary':'Leverage challenges resilience under the supplied assumptions.','winning_claim_ids':['bear:0']})
            return json.dumps({'action':'conclude','summary':'The case remains conditional.','claims':[{'evidence_id':evidence,'stance':'support','implication':'growth' if role=='bull' else 'leverage-risk'}],'limitations':['Original source authenticity remains unverified.']})
    value=fixture();r=PortfolioCouncil(Model()).run_admitted(value['request_raw'].encode())
    assert r['disposition']=='provisional-bear' and r['admission']['status']=='conditional';assert_authority_false(r)
    from app.agents.portfolio_council import parse_packet
    legacy=PortfolioCouncil(Model()).run(parse_packet(raw(value['request']['packet'])))
    assert legacy['disposition']=='insufficient-evidence'

@pytest.mark.parametrize('field,value',[('form','10-K/A'),('filed_on','2026-02-21')])
def test_one_accession_cannot_have_conflicting_original_filing_metadata(field,value):
    v=request();o=source(v,'sec:free_cash_flow_usd')
    for f in o['inputs']:f[field]=value
    with pytest.raises(ValueError,match='Conflicting filing metadata'):evaluate(raw(v))

@pytest.mark.parametrize('observed,eligible',[('2026-11-09T11:45:00Z',True),('2026-11-09T11:44:59.999999Z',False)])
def test_market_freshness_boundary_preserves_microseconds(observed,eligible):
    v=request();row(v,'loaded:price')['observed_at']=observed
    assert record(evaluate(raw(v)),'loaded:price')['eligible'] is eligible

def test_empty_loaded_evidence_is_missing_coverage_not_a_successful_zero_research_result():
    v=request();v['packet']['evidence']=[];v['sources']={'sec':None,'catalyst':None}
    a=evaluate(raw(v));assert a['status']=='needs-data' and a['records']==[]
    assert a['quality']['missing_families']==['market','financial','catalyst','risk']

def test_conflicts_withhold_admission_even_when_another_metric_covers_the_same_family():
    v=request();v['packet']['evidence'].append({**row(v,'loaded:price'),'evidence_id':'other-price','source_id':'finnhub','value':101})
    a=evaluate(raw(v));assert a['quality']['missing_families']==[] and a['status']=='needs-data'
    assert a['quality']['conflicting_ids']==['loaded:price','other-price']
    assert not record(a,'loaded:price')['eligible'] and record(a,'loaded:daily_change_pct')['eligible']

@pytest.mark.parametrize('encoded',[b'{"mode":"a","mode":"b"}',b'\xff',b'x'*32769,b'{"x":NaN}'])
def test_ambiguous_or_oversized_json_never_reaches_a_model(encoded):
    with pytest.raises((ValueError,UnicodeError)):parse_request(encoded)
