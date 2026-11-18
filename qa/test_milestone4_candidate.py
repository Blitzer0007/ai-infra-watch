"""Milestone 4: read-only forecast lifecycle and honest missing-data coverage."""
import json
from pathlib import Path
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

FIXTURE=json.loads((Path(__file__).parent/'fixtures'/'milestone4-evaluation.fictional.json').read_text())

@pytest.mark.parametrize('width',[360,768,1440])
def test_health_explains_due_pending_invalid_and_scores_without_writes(page,width):
    errors=[];writes=[];extra=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda req:writes.append((req.method,req.url)) if req.method not in ('GET','HEAD') else None)
    mock_local_apis(page)
    page.route('**/api/forecast-validation*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(FIXTURE)))
    page.set_viewport_size({'width':width,'height':950})
    page.goto('/health')
    report=page.get_by_test_id('forecast-evaluation-lifecycle')
    expect(report).to_be_visible()
    expect(report).to_contain_text('Pending · not due')
    expect(report).to_contain_text('Due for review')
    expect(report).to_contain_text('Pending · unknown date')
    expect(report).to_contain_text('Verified reported')
    expect(report).to_contain_text('Scorable, non-overlapping')
    expect(report.get_by_test_id('evaluation-scoring-denominators')).to_contain_text('1 non-overlapping rows')
    expect(report.get_by_test_id('evaluation-scoring-denominators')).to_contain_text('Wide 80%: 0/0 (—)')
    expect(report.get_by_test_id('evaluation-window-coverage')).to_contain_text('Historical completeness not independently established')
    expect(report).to_contain_text('issuer/publisher authentication was not performed')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.wait_for_load_state('networkidle')
    page.on('request',lambda req:extra.append(req.url))
    report.locator('summary').click()
    expect(report).to_contain_text('missing or invalid outcome: 1')
    assert extra==[] and writes==[] and errors==[]

def test_unavailable_lifecycle_is_not_presented_as_zero_pending_or_verified(page):
    mock_local_apis(page)
    body={**FIXTURE,'evaluationProtocolStatus':'unavailable','evaluationProtocol':None}
    page.route('**/api/forecast-validation*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(body)))
    page.goto('/health')
    report=page.get_by_test_id('forecast-evaluation-lifecycle')
    expect(report).to_contain_text('lifecycle · unavailable')
    expect(report).to_contain_text('does not mean there are zero pending forecasts')
    expect(report.get_by_text('Due for review',exact=True)).to_have_count(0)
