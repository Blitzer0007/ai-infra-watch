"""Milestone 5: scheduler fleet review uses only already-loaded authorized observations."""
import json
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

@pytest.mark.parametrize('width', [360, 768, 1440])
def test_scheduler_fleet_distinguishes_failure_skips_and_missing_receipts_without_writes(page, width):
    mock_local_apis(page)
    body = {'ok': True, 'jobs': [
        {'id': 'ok', 'name': 'Fictional successful', 'status': 'completed', 'conclusion': 'success',
         'lastSuccessAt': '2026-11-18T12:00:00Z', 'recentFailureCount': 0, 'recentSkippedCount': 0},
        {'id': 'missing', 'name': 'Fictional unobserved', 'status': 'completed', 'conclusion': 'success'},
        {'id': 'failed', 'name': 'Fictional failure', 'status': 'completed', 'conclusion': 'failure',
         'recentFailureCount': 1},
        {'id': 'disabled', 'name': 'Fictional gated', 'status': 'disabled', 'conclusion': 'skipped'},
    ]}
    page.route('**/api/job-health*', lambda route: route.fulfill(
        status=200, content_type='application/json', body=json.dumps(body)))
    writes = []
    errors = []
    page.on('request', lambda req: writes.append((req.method, req.url)) if req.method not in ('GET','HEAD') else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_viewport_size({'width': width, 'height': 1000})
    page.goto('/health')
    summary = page.get_by_test_id('scheduler-fleet-summary')
    expect(summary).to_contain_text('Fleet: attention')
    expect(summary).to_contain_text('Recorded success: 1')
    expect(summary).to_contain_text('Attention: 1')
    expect(summary).to_contain_text('Skipped / disabled: 1')
    expect(summary).to_contain_text('Unknown: 1')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.wait_for_load_state('networkidle')
    assert writes == [] and errors == []

def test_empty_authorized_scheduler_response_remains_unknown_not_healthy(page):
    mock_local_apis(page)
    page.route('**/api/job-health*', lambda route: route.fulfill(
        status=200, content_type='application/json', body='{"ok":true,"jobs":[]}'))
    page.goto('/health')
    summary = page.get_by_test_id('scheduler-fleet-summary')
    expect(summary).to_contain_text('Fleet: unknown')
    expect(page.get_by_test_id('scheduled-job-health')).to_contain_text(
        'No scheduler observations returned; health remains unknown.')

@pytest.mark.parametrize('width', [360, 768, 1440])
def test_market_age_rate_limit_and_unknown_quota_are_read_only(page, width):
    mock_local_apis(page)
    payload = {'ok': True, 'retrievedAt':'2026-11-18T12:00:00Z', 'rows': [
        {'symbol':'FICT',
         'quote':{'available':True, 'ageSeconds':901, 'providerAttempts':[{'provider':'source-a','errorCode':'rate_limited'}]},
         'history':{'available':True,'ageDays':6,'adjustedCloseAvailable':False,'providerAttempts':[]}},
        {'symbol':'TEST',
         'quote':{'available':True,'ageSeconds':None},
         'history':{'available':False,'errorCode':'no_data'}}
    ]}
    page.route('**/api/market?route=market-data-health*', lambda route: route.fulfill(
        status=200, content_type='application/json', body=json.dumps(payload)))
    page.set_viewport_size({'width':width,'height':960})
    writes=[];errors=[]
    page.on('request', lambda req: writes.append((req.method, req.url)) if req.method not in ('GET','HEAD') else None)
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.goto('/health')
    summary=page.get_by_test_id('market-observation-review')
    expect(summary).to_contain_text('Source lag & quota observations · attention')
    expect(summary).to_contain_text('Sampled: 2')
    expect(summary).to_contain_text('Quote aged >15m: 1')
    expect(summary).to_contain_text('Rate-limited attempts: 1')
    expect(summary).to_contain_text('Remaining provider quota: unknown')
    page.wait_for_load_state('networkidle')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert writes == [] and errors == []

def test_market_health_unavailable_is_unknown_not_zero_evidence(page):
    mock_local_apis(page)
    page.route('**/api/market?route=market-data-health*',lambda route: route.fulfill(
        status=502, content_type='application/json', body='{"error":"provider unavailable"}'))
    page.goto('/health')
    summary=page.get_by_test_id('market-observation-review')
    expect(summary).to_contain_text('Source lag & quota observations · unknown')
    expect(summary).to_contain_text('Remaining provider quota: unknown')

def test_provenance_ready_label_never_certifies_accuracy_or_exposes_paths(page):
    mock_local_apis(page)
    fixture={'ok':True,'jobs':[],'historicalArchive':{
        'inventoryWindow':{'returnedRows':1,'totalIndexedRows':20,'capped':True},
        'historicalGate':{'status':'READY'},
        'recentArtifacts':[{'provider':'ohlc','retrievedAt':'2026-11-18T12:00:00Z',
            'sourceAsOf':'2026-11-19T12:00:00Z','sha256':'a'*64,
            'objectPath':'private/sensitive-object-path'}],
        'providers':[]
    }}
    page.route('**/api/job-health*',lambda route: route.fulfill(
        status=200,content_type='application/json',body=json.dumps(fixture)))
    page.goto('/health')
    review=page.get_by_test_id('historical-provenance-review')
    expect(review).to_contain_text('Independent historical accuracy eligibility: blocked')
    expect(review).to_contain_text('conflicting metadata')
    expect(review).to_contain_text('Source after capture: 1')
    expect(review).to_contain_text('Publisher receipts: not verified')
    expect(review).to_contain_text('Prospective holdout: not verified')
    assert 'sensitive-object-path' not in review.inner_text()


@pytest.mark.parametrize('width',[360,768,1440])
def test_sampled_prices_show_actual_quote_checks_and_last_close_scope(page,width):
    import subprocess
    import os
    from pathlib import Path
    root=Path(__file__).resolve().parents[1]
    payload=json.loads(subprocess.check_output(['node','qa/fixtures/quote-health.fictional.mjs'],
        cwd=root,env={'PATH':os.environ['PATH']},text=True))
    mock_local_apis(page)
    reads=[];writes=[];errors=[]
    def reply(route):
        reads.append(route.request.url)
        route.fulfill(status=200,json=payload)
    page.route('**/api/market?route=market-data-health*',reply)
    page.on('request',lambda request:writes.append(request.url) if request.method not in ('GET','HEAD') else None)
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.set_viewport_size({'width':width,'height':1000})
    page.goto('/health')
    samples=page.get_by_test_id('market-provider-health')
    bad=samples.get_by_test_id('market-sample-row').filter(has_text='BADT')
    expect(bad.get_by_text('WITHHELD',exact=True)).to_be_visible()
    expect(bad.get_by_test_id('sample-quote-admission')).to_contain_text('Only USD quotes are supported')
    good=samples.get_by_test_id('market-sample-row').filter(has_text='FICT')
    expect(good.get_by_test_id('sample-quote-admission')).to_contain_text('Passed for conditional valuation')
    close=samples.get_by_test_id('market-sample-row').filter(has_text='OLDCL')
    expect(close.get_by_text('LAST CLOSE',exact=True)).to_be_visible()
    legacy=samples.get_by_test_id('market-sample-row').filter(has_text='LEGACY')
    expect(legacy.get_by_test_id('sample-quote-admission')).to_contain_text('Unknown')
    expect(legacy.get_by_text('PRIMARY',exact=True)).to_have_count(0)
    expect(samples.get_by_test_id('market-observation-review')).to_contain_text('Quote checks withheld: 1')
    expect(samples.get_by_test_id('market-observation-review')).to_contain_text('Quote checks unknown: 1')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    # React StrictMode replays mount effects in the development QA bundle.
    # Both supported builds remain bounded to the initial effect reads.
    page.wait_for_load_state('networkidle')
    assert len(reads) in (1,2) and writes==[] and errors==[]


def test_empty_market_sample_finishes_loading_with_unknown_coverage(page):
    mock_local_apis(page)
    page.route('**/api/market?route=market-data-health*',lambda route:route.fulfill(status=200,json={'ok':True,'rows':[]}))
    page.goto('/health')
    samples=page.get_by_test_id('market-provider-health')
    expect(samples).to_contain_text('No sampled provider rows were returned. Coverage is unknown.')
    expect(samples).not_to_contain_text('Loading market provider health')
