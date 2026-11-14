"""Invented holdings/source declarations; all APIs intercepted, no real financial observations."""
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

NOW = datetime(2026, 11, 13, 18, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def no_errors_or_writes(page):
    errors = []; writes = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: writes.append(request.url) if request.method not in ('GET', 'HEAD') else None)
    yield
    assert errors == [] and writes == []


def setup(page, missing=(), edits=None):
    page.clock.install(time=NOW)
    mock_local_apis(page)
    control = {'missing': set(missing), 'edits': edits or {}, 'calls': 0}
    holdings = [{'id': 'fictional-'+s, 'symbol': s, 'quantity': 1, 'averageCost': 100, 'currency': 'USD', 'purchaseDate': '2026-01-02', 'targetAllocationPct': 30, 'maxAllocationPct': 40} for s in ['NVDA', 'AMD']]
    control['holdings'] = holdings
    trades = [{'id': 'fictional-trade-'+s, 'symbol': s, 'transactionType': 'BUY', 'quantity': 1, 'amount': 100, 'brokerage': 0, 'currency': 'USD', 'tradeDate': '2026-01-02', 'sourceRow': i+1} for i, s in enumerate(['NVDA', 'AMD'])]
    def portfolio(route):
        query = parse_qs(urlparse(route.request.url).query)
        if 'includeTransactions' in query: payload = {'transactions': trades}
        elif 'includeCashFlows' in query: payload = {'cashFlows': [{'id': 'fictional-deposit', 'eventDate': '2026-01-02', 'flowType': 'deposit', 'amount': 200, 'currency': 'USD', 'fxToUsd': 1, 'notes': ''}]}
        elif 'holdingId' in query: payload = {'lots': []}
        else: payload = {'holdings': holdings}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(payload))
    page.route('**/api/portfolio?**', portfolio)
    page.route('**/api/live-data**', lambda route: route.fulfill(status=200, content_type='application/json', body='{"stockPrices":{},"news":[],"contracts":[],"macroRisks":[]}'))
    def quote(route):
        symbol = parse_qs(urlparse(route.request.url).query).get('symbol', [''])[0]
        if symbol not in ('NVDA', 'AMD') or symbol in control['missing']:
            route.fulfill(status=503, content_type='application/json', body='{"error":"fictional unavailable"}'); return
        control['calls'] += 1
        packet = {'symbol': symbol, 'returnedSymbol': symbol, 'price': 100 if symbol == 'NVDA' else 200, 'changePct': 0, 'provider': 'declared-source', 'sourceMode': 'live', 'currency': 'USD', 'adjustedBasis': 'raw', 'marketTimePrecision': 'instant', 'marketTime': NOW.isoformat(), 'retrievedAt': NOW.isoformat(), 'isMarketSessionOpen': True, **control['edits'].get(symbol, {})}
        route.fulfill(status=200, content_type='application/json', body=json.dumps(packet))
    page.route('**/api/quote**', quote)
    return control


def row(page, symbol):
    return page.get_by_test_id('holding-list').get_by_role('button', name=f'Open {symbol} holding details', exact=True)


def metric(container, label):
    return container.get_by_text(label, exact=True).locator('..')


def test_unavailable_price_preserves_cost_but_withholds_value_pnl_and_allocation(page):
    setup(page, missing=('NVDA', 'AMD'))
    page.goto('/portfolio?portfolio_tab=holdings')
    coverage = page.get_by_test_id('portfolio-valuation-coverage')
    expect(coverage).to_contain_text('0/2 holding values supported · unavailable')
    nvda = row(page, 'NVDA')
    expect(metric(nvda, 'Current value')).to_contain_text('—')
    expect(metric(nvda, 'P&L')).to_contain_text('—')
    expect(nvda).to_contain_text('Portfolio share unavailable')
    nvda.click()
    dialog = page.get_by_role('dialog', name='NVDA holding details', exact=True)
    dialog.get_by_text('Company, valuation and analyst detail', exact=True).click()
    expect(metric(dialog, 'Invested cost')).to_contain_text('$100.00')
    expect(metric(dialog, 'Current value')).to_contain_text('—')
    expect(metric(dialog, 'P&L')).to_contain_text('—')
    expect(dialog).to_contain_text('Current portfolio weight is unavailable; allocation review is withheld')


@pytest.mark.parametrize('width', [360, 768, 1440])
def test_partial_portfolio_has_no_subset_weights_and_observed_zero_pnl_stays_zero(page, width):
    setup(page, missing=('AMD',))
    page.set_viewport_size({'width': width, 'height': 1000})
    page.goto('/portfolio?portfolio_tab=holdings')
    coverage = page.get_by_test_id('portfolio-valuation-coverage')
    expect(coverage).to_contain_text('1/2 holding values supported · partial')
    expect(metric(row(page, 'NVDA'), 'P&L')).to_contain_text('+0.00%')
    expect(metric(row(page, 'NVDA'), 'Current value')).to_contain_text('$100.00')
    expect(metric(row(page, 'AMD'), 'P&L')).to_contain_text('—')
    expect(row(page, 'NVDA')).to_contain_text('Portfolio share unavailable')
    expect(row(page, 'AMD')).to_contain_text('Portfolio share unavailable')
    summary = coverage.locator('summary'); summary.focus(); summary.press('Enter')
    expect(coverage).to_contain_text('AMD:')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    root = Path(os.getenv('QA_ARTIFACT_DIR', '/tmp/aiw-valuation')); root.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(root/f'portfolio-valuation-{width}.png'), full_page=True, animations='disabled')


def test_recovery_restores_actual_value_weights_and_loss_of_coverage_clears_them(page):
    control = setup(page, missing=('AMD',))
    page.goto('/portfolio?portfolio_tab=holdings')
    coverage = page.get_by_test_id('portfolio-valuation-coverage')
    expect(coverage).to_contain_text('1/2 holding values supported · partial')
    page.wait_for_load_state('networkidle')
    control['missing'].clear(); page.clock.fast_forward(61000)
    expect(coverage).to_contain_text('2/2 holding values supported · complete')
    expect(row(page, 'NVDA')).to_contain_text('Portfolio share 33.3%')
    expect(row(page, 'AMD')).to_contain_text('Portfolio share 66.7%')
    control['edits']['NVDA'] = {'stale': True}; page.clock.fast_forward(61000)
    expect(coverage).to_contain_text('1/2 holding values supported · partial')
    expect(metric(row(page, 'NVDA'), 'P&L')).to_contain_text('—')
    expect(row(page, 'AMD')).to_contain_text('Portfolio share unavailable')
    page.get_by_role('combobox', name='Portfolio section', exact=True).select_option('performance')
    expect(page.get_by_test_id('portfolio-stress-score')).to_have_text('Unavailable')
    attribution = page.get_by_test_id('portfolio-attribution')
    expect(attribution.get_by_test_id('attribution-row').filter(has_text='NVDA')).to_contain_text('Unavailable')
    expect(attribution.get_by_test_id('attribution-row').filter(has_text='AMD')).to_contain_text('+$100.00')


@pytest.mark.parametrize('edits', [{'simulated': True}, {'returnedSymbol': 'OTHER'}, {'currency': 'EUR'}])
def test_loaded_unsupported_quotes_never_become_current_portfolio_values(page, edits):
    setup(page, edits={'NVDA': edits})
    page.goto('/portfolio?portfolio_tab=holdings')
    expect(page.get_by_test_id('portfolio-valuation-coverage')).to_contain_text('1/2 holding values supported · partial')
    expect(metric(row(page, 'NVDA'), 'Current value')).to_contain_text('—')
    expect(metric(row(page, 'NVDA'), 'P&L')).to_contain_text('—')
    assert 'NaN' not in page.get_by_test_id('portfolio-intelligence').inner_text()


def test_cashflow_account_value_withholds_when_quote_quality_is_lost(page):
    control = setup(page)
    page.goto('/portfolio?portfolio_tab=performance')
    account = page.get_by_text('Account value', exact=True).locator('..')
    expect(account).to_contain_text('$300.00')
    page.wait_for_load_state('networkidle')
    control['edits']['NVDA'] = {'simulated': True}; page.clock.fast_forward(61000)
    expect(account).to_contain_text('—')


@pytest.mark.parametrize('field,default', [('quantity', 0), ('averageCost', 0), ('currency', 'USD')])
def test_original_storage_gap_cannot_be_hidden_by_a_legacy_numeric_default(page, field, default):
    control = setup(page)
    record = control['holdings'][0]
    record['valuationInputs'] = {'contractVersion': 'stored-holding-valuation-v1', 'symbol': 'NVDA', 'quantity': 1, 'averageCost': 100, 'currency': 'USD', field: None}
    record[field] = default
    page.goto('/portfolio?portfolio_tab=holdings')
    nvda = row(page, 'NVDA')
    expect(metric(nvda, 'P&L')).to_contain_text('—')
    expect(metric(nvda, 'Avg cost')).to_contain_text('—')
    if field == 'quantity':
        expect(metric(nvda, 'Current value')).to_contain_text('—')
        expect(nvda).to_contain_text('Portfolio share unavailable')
