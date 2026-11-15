"""Fictional, intercepted accounting UI flows. Never save, send or activate."""
import json
import os
from pathlib import Path
import pytest
from playwright.sync_api import expect
from test_portfolio_valuation import setup as valuation_setup


@pytest.fixture(autouse=True)
def no_writes_or_errors(page):
    errors=[];writes=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda request:writes.append(request.url) if request.method not in ('GET','HEAD') else None)
    yield
    assert errors==[] and writes==[]


def setup(page,mode='valid'):
    control=valuation_setup(page)
    for row in control['holdings']:
        row['accountingInputs']={'contractVersion':'stored-holding-inputs-v1','symbol':row['symbol'],'quantity':1}
    trades=[{'id':'fictional-'+symbol,'symbol':symbol,'dataQuality':'ok','quantity':777,'amount':777,'brokerage':777,'currency':'EUR','tradeDate':'2026-01-02','transactionType':'SELL','sourceRow':999,
             'accountingInputs':{'contractVersion':'stored-ledger-inputs-v1','symbol':symbol,'transactionType':'BUY','quantity':1,'amount':100,'brokerage':0,'currency':'USD','tradeDate':'2026-01-02','executedAt':None,'quantityDerived':False,'priceDerived':False}} for symbol in ('NVDA','AMD')]
    flows=[{'id':'fictional-deposit','amount':777,'currency':'EUR','fxToUsd':777,'flowType':'withdrawal','eventDate':'2026-01-02','notes':'private text',
            'accountingInputs':{'contractVersion':'stored-cash-flow-inputs-v1','eventDate':'2026-01-02','flowType':'deposit','amount':500,'currency':'USD','fxToUsd':1}}]
    if mode=='unknown-fee':trades[0]['accountingInputs']['brokerage']=None
    if mode=='unknown-currency':trades[0]['accountingInputs']['currency']=None
    if mode=='quantity-gap':trades[0]['accountingInputs']['quantity']=1.00000001
    if mode=='legacy':trades[0].pop('accountingInputs')
    if mode=='flow-currency-gap':flows[0]['accountingInputs']['currency']=None
    if mode=='tiny':
        for row in trades:row['accountingInputs']['amount']=1e-10
    if mode=='empty':trades=[]
    page.route('**/api/portfolio?includeTransactions=true',lambda route:route.fulfill(status=503 if mode=='trade-failed' else 200,content_type='application/json',body=json.dumps({'transactions':trades})))
    page.route('**/api/portfolio?includeCashFlows=true',lambda route:route.fulfill(status=503 if mode=='flow-failed' else 200,content_type='application/json',body=json.dumps({'cashFlows':flows})))
    page.goto('/portfolio?portfolio_tab=performance')
    return control


def metric(container,name):return container.get_by_text(name,exact=True).locator('..')


def test_original_inputs_override_normalized_trade_and_flow_defaults(page):
    setup(page)
    summary=page.locator('#portfolio-investment-summary');account=page.get_by_test_id('portfolio-cash-flows')
    expect(metric(summary,'Open cost basis')).to_contain_text('$200')
    expect(metric(summary,'Realized P&L')).to_contain_text('+$0')
    expect(metric(summary,'Total trading P&L')).to_contain_text('+$100')
    expect(summary).to_contain_text('full history unverified')
    expect(metric(account,'Cash balance')).to_contain_text('$300.00')
    expect(metric(account,'Account value')).to_contain_text('$600.00')
    expect(metric(account,'Total account P&L')).to_contain_text('$100.00')
    expect(account).to_contain_text('full history unverified')
    expect(account).to_contain_text('deposit · 2026-01-02')
    expect(account).to_contain_text('USD 500 · FX 1 USD/unit')
    assert 'EUR 777' not in account.inner_text()
    assert 'reconciled records' not in account.inner_text()


@pytest.mark.parametrize('mode',['unknown-fee','unknown-currency','quantity-gap','legacy','empty','trade-failed'])
def test_missing_original_trade_evidence_cannot_fall_back_to_stored_holding_cost(page,mode):
    setup(page,mode)
    summary=page.locator('#portfolio-investment-summary')
    for name in ('Open cost basis','Realized P&L','Unrealized P&L','Total trading P&L'):expect(metric(summary,name)).to_contain_text('—')
    expect(summary).to_contain_text('Original ledger inputs need review')
    account=page.get_by_test_id('portfolio-cash-flows')
    for name in ('Cash balance','Account value','Total account P&L'):expect(metric(account,name)).to_contain_text('—')
    # Current quote valuation is independent of whether original trade inputs exist.
    expect(metric(summary,'Holdings value')).to_contain_text('$300')


@pytest.mark.parametrize('mode',['flow-currency-gap','flow-failed'])
def test_cashflow_failures_do_not_become_usd_zero_or_withhold_valid_trade_diagnostics(page,mode):
    setup(page,mode)
    expect(metric(page.locator('#portfolio-investment-summary'),'Total trading P&L')).to_contain_text('+$100')
    account=page.get_by_test_id('portfolio-cash-flows')
    expect(metric(account,'Account value')).to_contain_text('—')
    expect(metric(account,'Total account P&L')).to_contain_text('—')


def test_tiny_nonzero_remaining_cost_is_not_rendered_as_zero(page):
    setup(page,'tiny')
    expect(metric(page.locator('#portfolio-investment-summary'),'Open cost basis')).to_contain_text('2.0000e-10 USD')


@pytest.mark.parametrize('width',[360,768,1440])
def test_conditional_accounting_screen_is_responsive_and_read_only(page,width):
    page.set_viewport_size({'width':width,'height':1000});setup(page)
    expect(page.get_by_test_id('portfolio-cash-flows')).to_contain_text('Loaded-record calculation')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-accounting'));root.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(root/f'conditional-accounting-{width}.png'),full_page=True,animations='disabled')
