"""Browser → intercepted API → real handler/math over fictional original rows only."""
import json
import os
from pathlib import Path
import subprocess
import pytest
from playwright.sync_api import expect
from test_ui import goto_app, mock_local_apis

ROOT=Path(__file__).resolve().parents[1]


@pytest.mark.parametrize('mode,expected_issue', [('unknown-fee', 'FEE_UNKNOWN'), ('ledger-outage', 'RECORDS_UNAVAILABLE')])
def test_accounting_diagnostic_report_uses_loaded_issue_codes_without_financial_rows(page, mode, expected_issue):
    body = replay(mode)
    body['portfolio']['accountingIssues'].append({'code': 'untrusted-private-token', 'symbol': 'PRIVATEHOLDING', 'message': 'private-record-id'})
    mock_local_apis(page)
    page.route('**/api/decision-center**', lambda route: route.fulfill(status=200, json=body))
    requests, writes = [], []
    page.on('request', lambda request: requests.append(request.url))
    page.on('request', lambda request: writes.append(request.url) if request.method not in ('GET','HEAD','OPTIONS') else None)
    goto_app(page)
    center = page.get_by_test_id('decision-impact-center')
    center.get_by_text('Accounting coverage and inputs', exact=True).click()
    page.wait_for_load_state('networkidle')
    before = len(requests)
    panel = center.get_by_label('Accounting diagnostics', exact=True)
    panel.locator('summary').click()
    panel.get_by_role('button', name='Prepare accounting diagnostics', exact=True).click()
    text = panel.get_by_role('textbox', name='Accounting diagnostics preview', exact=True).input_value()
    report = json.loads(text)
    assert report['issues'][expected_issue] >= 1 and report['issues']['unknown'] == 1
    assert report['reportedAccountingReconciled'] is False and report['grantsDecisionEligibility'] is False
    assert report['historyCoverage'] == 'unverified'
    for private in ['untrusted-private-token', 'PRIVATEHOLDING', 'private-record-id', 'currentValue', 'totalTradingPnl', 'recordId']:
        assert private not in text
    assert len(requests) == before and writes == []

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
        if mode == 'partial':
            issue = next(row for row in body['portfolio']['accountingIssues'] if row['code'] == 'QUOTE_WITHHELD')
            assert 'Yahoo service error' in issue['message']
            assert 'Finnhub not configured' in issue['message']
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


@pytest.mark.parametrize('mode', ['partial', 'earnings-malformed'])
def test_missing_coverage_does_not_look_like_a_clean_day(page, mode):
    body = replay(mode)
    mock_local_apis(page)
    page.route('**/api/decision-center**', lambda route: route.fulfill(status=200, json=body))
    goto_app(page)
    center = page.get_by_test_id('decision-impact-center')
    if mode == 'partial':
        expect(center.get_by_text('Action now',exact=True).locator('..')).to_contain_text('Unknown')
        expect(center).to_contain_text('Review coverage needs attention')
    else:
        expect(center.get_by_text('Next 7 days',exact=True).locator('..')).to_contain_text('Unknown')
    expect(center).not_to_contain_text('Nothing urgent detected')
    center.get_by_role('button',name='Check data sources',exact=True).click()
    expect(page.get_by_test_id('workspace-title')).to_have_text('Data Health')


@pytest.mark.parametrize('body', [{'ok': True}, {'ok': True,'rules':{'total':1},'portfolio':{'holdings':1},'actionItems':None}, {'ok':True,'rules':{'total':1},'portfolio':{'holdings':1},'actionItems':[None]}])
def test_incomplete_success_response_is_an_error_state_without_crashing(page,body):
    mock_local_apis(page)
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.route('**/api/decision-center**',lambda route:route.fulfill(status=200,json=body))
    goto_app(page)
    expect(page.get_by_test_id('decision-impact-center')).to_contain_text('Decision response is incomplete')
    assert errors==[]
