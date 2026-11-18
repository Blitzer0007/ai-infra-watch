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
