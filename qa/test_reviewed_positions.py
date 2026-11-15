"""Fictional per-position ledger scenarios, all routes intercepted; no live records or writes."""
import pytest
from playwright.sync_api import expect
from test_accounting_consumers import setup, no_writes_or_errors
from test_portfolio_valuation import row, metric


def details(page,symbol='NVDA'):
    page.get_by_role('combobox',name='Portfolio section',exact=True).select_option('holdings')
    row(page,symbol).click()
    dialog=page.get_by_role('dialog',name=f'{symbol} holding details',exact=True)
    dialog.get_by_text('Company, valuation and analyst detail',exact=True).click()
    return dialog


def test_original_ledger_cost_wins_over_stored_snapshot_in_rows_and_scenarios(page):
    control=setup(page)
    # Deliberately disagree with the valid original loaded trade cost ($100).
    control['holdings'][0]['averageCost']=999
    page.reload()
    dialog=details(page)
    expect(metric(dialog,'Average cost')).to_contain_text('$100.00')
    expect(metric(dialog,'Invested cost')).to_contain_text('$100.00')
    expect(metric(dialog,'P&L')).to_contain_text('$0.00')
    expect(dialog.get_by_test_id('position-accounting-status')).to_contain_text('full history and corporate actions remain unverified')
    table=dialog.get_by_role('table').filter(has=page.get_by_role('button',name='Sort by Reference',exact=True))
    scenario=table.get_by_role('row').filter(has_text='+10% from current')
    expect(scenario).to_contain_text('$110.00');expect(scenario).to_contain_text('+$10.00')
    dialog.get_by_label('Custom target price',exact=True).fill('80')
    expect(table.get_by_role('row').filter(has_text='Custom target')).to_contain_text('−$20.00')
    dialog.press('Escape')
    expect(metric(row(page,'NVDA'),'Avg cost')).to_contain_text('$100.00')
    expect(metric(row(page,'NVDA'),'P&L')).to_contain_text('+0.00%')
    row(page,'NVDA').click()
    page.get_by_role('dialog').get_by_role('button',name='Open Performance workspace',exact=True).click()
    expect(page.get_by_test_id('portfolio-section-heading')).to_have_text('Performance')
    page.go_back()
    expect(page.get_by_role('dialog',name='NVDA holding details',exact=True)).to_be_visible()


@pytest.mark.parametrize('mode',['unknown-fee','unknown-currency','quantity-gap','legacy','empty','trade-failed'])
def test_unsupported_ledger_withholds_rows_and_scenarios_but_keeps_quote_values(page,mode):
    setup(page,mode)
    dialog=details(page)
    expect(metric(dialog,'Invested cost')).to_contain_text('—')
    expect(metric(dialog,'Average cost')).to_contain_text('—')
    expect(metric(dialog,'P&L')).to_contain_text('—')
    expect(metric(dialog,'Current value')).to_contain_text('$100.00')
    expect(dialog.get_by_test_id('position-accounting-status')).to_contain_text('withheld')
    expect(dialog).to_contain_text('Scenarios unavailable')
    dialog.get_by_label('Custom target price',exact=True).fill('999')
    expect(dialog.get_by_role('button',name='Sort by Reference',exact=True)).to_have_count(0)
    dialog.press('Escape')
    expect(metric(row(page,'NVDA'),'P&L')).to_contain_text('—')
    expect(row(page,'NVDA')).to_contain_text('Portfolio share 33.3%')
    page.get_by_role('combobox',name='Filter your holdings by status',exact=True).select_option('Below your buy price')
    expect(page.get_by_test_id('holding-list').get_by_role('button')).to_have_count(0)


def test_tiny_conditional_position_cost_does_not_round_to_zero(page):
    setup(page,'tiny');dialog=details(page)
    expect(metric(dialog,'Invested cost')).to_contain_text('$1.0000e-10')
    expect(metric(dialog,'Average cost')).to_contain_text('$1.0000e-10')
    dialog.get_by_label('Custom target price',exact=True).fill('0.000000001')
    scenario=dialog.get_by_role('row').filter(has_text='Custom target')
    expect(scenario).to_contain_text('$1.0000e-9')
    expect(scenario).to_contain_text('+$9.0000e-10')


def test_unsupported_history_abstains_and_avoids_extra_max_history_reads(page):
    calls=[];page.on('request',lambda request:calls.append(request.url))
    setup(page)
    expect(page.get_by_test_id('historical-return-status')).to_contain_text('Historical returns unavailable')
    expect(page.get_by_test_id('historical-peer-status')).to_contain_text('No peer return or portfolio replacement result is calculated')
    dialog=details(page)
    expect(dialog.get_by_test_id('historical-target-status')).to_contain_text('Historical exit targets are withheld')
    expect(dialog.get_by_test_id('historical-peer-status')).to_contain_text('Unavailable')
    expect(dialog.get_by_role('row').filter(has_text='52-week high')).to_have_count(0)
    expect(dialog.get_by_role('row').filter(has_text='Historical high')).to_have_count(0)
    page.wait_for_load_state('networkidle')
    assert not [url for url in calls if 'action=history' in url and 'range=max' in url]
    # Descriptive 1Y price history remains available separately.
    assert any('action=history' in url and 'range=1y' in url for url in calls)
