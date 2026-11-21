"""Browser → intercepted API → real handler/math over fictional original rows only."""
import json
import os
from pathlib import Path
import subprocess
import pytest
from playwright.sync_api import expect
from test_ui import goto_app, mock_local_apis

ROOT=Path(__file__).resolve().parents[1]

def replay(mode):
    return json.loads(subprocess.check_output(['node','qa/fixtures/decision-accounting.fictional.mjs',mode],
        cwd=ROOT,env={'PATH':os.environ['PATH']},text=True))

@pytest.mark.parametrize('mode,expected',[('valid','+$50.00'),('unknown-fee','—'),('partial','—'),
    ('simulated','—'),('tiny','+$1.000e-10'),('zero','+$0.00'),('loss','−$20.00')])
def test_decision_accounting_from_original_rows_to_visible_review(page,mode,expected):
    body=replay(mode)
    assert body['portfolio']['accountingReconciled'] is False
    assert body['portfolio']['cashFlowPnl'] is None
    assert body['benchmark']['SPY']['pnl'] is None
    if mode in ('partial','simulated'):
        assert body['portfolio']['currentValue'] is None
        assert body['portfolio']['concentrationTop3Pct'] is None
        assert body['portfolio']['scenarioShockTotal'] is None
        assert body['portfolio']['riskScenarios']==[]
    if mode=='unknown-fee':
        assert body['portfolio']['openCostBasis'] is None
        assert body['portfolio']['unrealizedPnl'] is None
    if mode=='loss':assert body['actionItems'][0]['impact']==-20
    errors=[];writes=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:writes.append(request.url) if request.method not in ('GET','HEAD') else None)
    mock_local_apis(page)
    page.route('**/api/decision-center**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(body)))
    goto_app(page)
    center=page.get_by_test_id('decision-impact-center')
    metric=center.get_by_text('Trading P&L',exact=True).locator('..')
    expect(metric).to_contain_text(expected)
    gate=center.get_by_test_id('pre-trade-gate')
    expect(gate).to_contain_text('Portfolio review is incomplete')
    expect(gate).to_contain_text('full-history reconciliation')
    center.get_by_text('Accounting coverage and inputs',exact=True).click()
    expect(center.get_by_test_id('decision-accounting-issues')).to_contain_text('Full account history and corporate actions remain unverified')
    if mode=='unknown-fee':expect(center.get_by_test_id('decision-accounting-issues')).to_contain_text('fee is unknown')
    if mode!='loss':expect(center).to_contain_text('No usable review prompts returned')
    page.set_viewport_size({'width':360,'height':800})
    assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    assert errors==[] and writes==[]


def test_missing_coverage_percentage_keeps_decision_center_available(page):
    body = replay('partial')
    body['portfolio']['quoteCoverage']['coveragePct'] = None
    mock_local_apis(page)
    page.route('**/api/decision-center**', lambda route: route.fulfill(status=200, json=body))
    goto_app(page)
    expect(page.get_by_test_id('pre-trade-gate')).to_contain_text('Coverage unavailable')


def test_forecast_service_failure_preserves_portfolio_and_rule_review(page):
    body = replay('evidence-outage')
    assert body['ok'] and body['portfolio']['holdings'] == 1 and body['forecast'] is None
    mock_local_apis(page)
    page.route('**/api/decision-center**', lambda route: route.fulfill(status=200, json=body))
    goto_app(page)
    center = page.get_by_test_id('decision-impact-center')
    expect(center).to_contain_text('Forecast history could not be verified')
    expect(center.get_by_text('Trading P&L',exact=True).locator('..')).to_contain_text('+$50.00')


@pytest.mark.parametrize('mode', ['ledger-outage', 'earnings-malformed'])
def test_partial_service_failures_keep_holdings_readable(page, mode):
    body = replay(mode)
    assert body['ok'] and body['portfolio']['holdings'] == 1
    assert body['portfolio']['currentValue'] == 150
    if mode == 'ledger-outage':
        assert body['portfolio']['totalTradingPnl'] is None
        assert any(issue['code'] == 'RECORDS_UNAVAILABLE' for issue in body['portfolio']['accountingIssues'])
    else:
        assert body['earningsStatus'] == 'unavailable'
    mock_local_apis(page)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/api/decision-center**', lambda route: route.fulfill(status=200, json=body))
    goto_app(page)
    expect(page.get_by_test_id('decision-impact-center')).to_be_visible()
    expect(page.get_by_test_id('pre-trade-gate')).to_be_visible()
    assert errors == []
