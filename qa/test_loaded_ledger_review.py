"""Explicit loaded-record diagnostics; every API and input is fictional."""
import json
import os
from pathlib import Path

from playwright.sync_api import expect
import pytest
from test_ui import mock_local_apis
from test_release2 import fictional_portfolio


def inputs(symbol='FICT', **changes):
    return {'contractVersion':'stored-ledger-inputs-v1','symbol':symbol,'transactionType':'BUY','quantity':1,'amount':100,'brokerage':0,'currency':'USD','tradeDate':'2026-01-01','executedAt':None,'quantityDerived':False,'priceDerived':False,**changes}


def transaction(record_id='fictional-buy', **changes):
    original=inputs(**changes)
    return {'id':record_id,'symbol':'FICT','dataQuality':'ok','accountingInputs':original,
            'transactionType':original['transactionType'],'quantity':original['quantity'],
            'amount':original['amount'],'brokerage':original['brokerage'],'currency':original['currency'],
            'tradeDate':original['tradeDate'],'sourceRow':1 if record_id=='fictional-buy' else 2,
            'quantityDerived':False,'priceDerived':False,'notes':'private trade notes'}


def setup(page, mode='match', quantity=1):
    mock_local_apis(page)
    fictional_portfolio(page)
    rows=[{'id':'fictional-holding','symbol':'FICT','quantity':quantity,'accountingInputs':{'contractVersion':'stored-holding-inputs-v1','symbol':'FICT','quantity':quantity},'averageCost':999,'notes':'private holding notes'}]
    trades=[transaction()]
    if mode=='gap':trades[0]['accountingInputs']['brokerage']=None;trades[0]['brokerage']=None
    if mode=='mismatch':trades[0]['accountingInputs']['quantity']=2;trades[0]['quantity']=2
    if mode=='empty':trades=[]
    if mode=='legacy':trades[0].pop('accountingInputs')
    if mode=='closed':
        rows=[]
        trades.append(transaction('fictional-sale',transactionType='SELL',amount=120,tradeDate='2026-02-01'))
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':rows})))
    page.route('**/api/portfolio?includeTransactions=true',lambda route:route.fulfill(status=503 if mode=='failed' else 200,content_type='application/json',body=json.dumps({'transactions':trades})))
    page.goto('/portfolio?portfolio_tab=evidence')
    panel=page.get_by_test_id('loaded-ledger-review')
    panel.locator('summary').first.focus();panel.locator('summary').first.press('Enter')
    page.wait_for_load_state('networkidle')
    return panel


@pytest.fixture(autouse=True)
def no_errors(page):
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    yield
    assert errors==[]


def test_manual_review_has_no_new_request_or_write_and_uses_ledger_cost(page):
    panel=setup(page)
    assert panel.get_by_test_id('loaded-ledger-result').count()==0
    calls=[];page.on('request',lambda request:calls.append(request))
    panel.get_by_role('button',name='Review loaded records',exact=True).focus()
    panel.get_by_role('button',name='Review loaded records',exact=True).press('Enter')
    result=panel.get_by_test_id('loaded-ledger-result')
    expect(result).to_contain_text('Loaded trade quantities match')
    expect(result).to_contain_text('$100')
    assert '$999' not in result.inner_text() and 'private' not in result.inner_text()
    expect(result).to_contain_text('Full-history and corporate-action coverage are unverified')
    expect(panel.get_by_role('button',name='Loaded records reviewed',exact=True)).to_be_disabled()
    page.wait_for_timeout(150)
    assert calls==[]


@pytest.mark.parametrize('mode,message',[('gap','fee is unknown'),('mismatch','do not match'),('empty','No transaction records'),('legacy','legacy defaults'),('failed','not an empty trade history')])
def test_missing_ledger_evidence_is_explicit_and_never_restores_totals(page,mode,message):
    panel=setup(page,mode)
    if mode=='failed':expect(panel.get_by_role('alert')).to_contain_text(message)
    panel.get_by_role('button',name='Review loaded records',exact=True).click()
    result=panel.get_by_test_id('loaded-ledger-result')
    if mode!='failed':expect(result).to_contain_text(message)
    assert 'Remaining recorded cost' not in result.inner_text()
    assert 'Loaded trade quantities match' not in result.inner_text()


def test_closed_position_history_is_not_discarded_with_empty_holdings(page):
    panel=setup(page,'closed')
    panel.get_by_role('button',name='Review loaded records',exact=True).click()
    result=panel.get_by_test_id('loaded-ledger-result')
    expect(result).to_contain_text('Loaded trade quantities match')
    expect(result).to_contain_text('$20')
    result.get_by_text('Per-symbol record matches',exact=True).click()
    expect(result).to_contain_text('0 held / 0 recorded shares')


@pytest.mark.parametrize('width',[360,768,1440])
def test_ledger_review_responsive_evidence(page,width):
    page.set_viewport_size({'width':width,'height':900})
    panel=setup(page)
    panel.get_by_role('button',name='Review loaded records',exact=True).click()
    expect(panel.get_by_test_id('loaded-ledger-result')).to_be_visible()
    panel.get_by_text('Per-symbol record matches',exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('document.activeElement?.blur();scrollTo(0,0)')
    page.screenshot(path=str(root/f'loaded-ledger-{width}.png'),full_page=True,animations='disabled')
