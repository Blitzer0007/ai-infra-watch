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
