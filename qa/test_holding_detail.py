"""Ghostfolio-inspired holding drilldown, using fictional positions and intercepted APIs."""
import json
import os
from pathlib import Path
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

SYMBOLS=['NVDA','AMD','MU','MSFT','META','DGXX','NBIS']


@pytest.fixture(autouse=True)
def no_errors(page):
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    yield
    assert errors==[]


def open_holdings(page,path='/portfolio?portfolio_tab=holdings'):
    mock_local_apis(page)
    rows=[{'id':'fictional-'+symbol,'symbol':symbol,'quantity':1,'averageCost':100,'purchaseDate':'2026-01-01'} for symbol in SYMBOLS]
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':rows})))
    page.goto(path)
    page.get_by_test_id('holding-list').get_by_role('button',name='Open NVDA holding details',exact=True).wait_for()
    return page.get_by_test_id('portfolio-intelligence')


def test_list_defers_detail_reads_until_explicit_open_and_never_writes(page):
    calls=[];page.on('request',lambda request:calls.append((request.method,request.url)))
    portfolio=open_holdings(page);page.wait_for_load_state('networkidle')
    assert not [url for _,url in calls if 'action=history' in url or 'action=analyst' in url]
    trigger=portfolio.get_by_role('button',name='Open NVDA holding details',exact=True)
    trigger.click()
    dialog=page.get_by_role('dialog',name='NVDA holding details',exact=True)
    expect(dialog).to_be_visible();page.wait_for_load_state('networkidle')
    assert dialog.evaluate('(node)=>node.matches(":modal")')
    assert page.locator('body').evaluate('(node)=>node.style.overflow')=='hidden'
    assert any('action=history' in url for _,url in calls)
    assert 'portfolio_detail=NVDA' in page.url
    assert not [url for method,url in calls if method in ('POST','PUT','PATCH','DELETE')]
    assert not [url for _,url in calls if '/api/jev-assess' in url or '/api/agent-' in url]
    dialog.get_by_role('button',name='Back to holdings',exact=True).click()
    expect(dialog).to_have_count(0)
    expect(trigger).to_be_focused()


def test_close_preserves_filters_sort_scroll_and_return_focus(page):
    portfolio=open_holdings(page)
    portfolio.get_by_role('combobox',name='Sort your holdings',exact=True).select_option('Value')
    portfolio.get_by_role('combobox',name='Filter your holdings by status',exact=True).select_option('Needs attention')
    trigger=portfolio.get_by_role('button',name='Open NVDA holding details',exact=True)
    trigger.scroll_into_view_if_needed();before=page.evaluate('scrollY')
    trigger.click()
    page.get_by_role('dialog').get_by_role('button',name='Back to holdings',exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0);expect(trigger).to_be_focused()
    assert abs(page.evaluate('scrollY')-before)<3
    assert portfolio.get_by_role('combobox',name='Sort your holdings',exact=True).input_value()=='Value'
    assert portfolio.get_by_role('combobox',name='Filter your holdings by status',exact=True).input_value()=='Needs attention'
    assert 'portfolio_sort=Value' in page.url and 'portfolio_status=Needs+attention' in page.url
    portfolio.get_by_placeholder('Search ticker, company or theme').fill('AMD')
    portfolio.get_by_role('combobox',name='Filter your holdings by group',exact=True).select_option('AI Compute')
    portfolio.get_by_role('button',name='Open AMD holding details',exact=True).click()
    page.get_by_role('dialog').press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert portfolio.get_by_placeholder('Search ticker, company or theme').input_value()=='AMD'
    assert portfolio.get_by_role('combobox',name='Filter your holdings by group',exact=True).input_value()=='AI Compute'
    assert portfolio.get_by_test_id('holding-list').get_by_role('button').count()==1


def test_browser_back_forward_and_reload_preserve_the_detail_identity(page):
    open_holdings(page)
    page.get_by_role('button',name='Open AMD holding details',exact=True).click()
    expect(page.get_by_role('dialog',name='AMD holding details',exact=True)).to_be_visible()
    page.go_back();expect(page.get_by_role('dialog')).to_have_count(0)
    page.go_forward();expect(page.get_by_role('dialog',name='AMD holding details',exact=True)).to_be_visible()
    page.reload();expect(page.get_by_role('dialog',name='AMD holding details',exact=True)).to_be_visible()
    page.get_by_role('dialog').get_by_role('button',name='Back to holdings',exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert '/portfolio?' in page.url and 'portfolio_tab=holdings' in page.url and 'portfolio_detail=' not in page.url


def test_direct_missing_holding_does_not_substitute_or_fetch_another_position(page):
    calls=[];page.on('request',lambda request:calls.append(request.url))
    open_holdings(page,'/portfolio?portfolio_tab=holdings&portfolio_detail=ZZZZ')
    dialog=page.get_by_role('dialog',name='ZZZZ holding details',exact=True)
    expect(dialog.get_by_role('alert')).to_contain_text('No substitute position is shown')
    page.wait_for_load_state('networkidle')
    assert not [url for url in calls if 'action=history' in url or 'action=analyst' in url]
    dialog.get_by_role('button',name='Back to holdings',exact=True).click()
    expect(dialog).to_have_count(0)


def test_opening_detail_keeps_unsaved_management_drafts(page):
    portfolio=open_holdings(page)
    portfolio.get_by_text('Manage positions and purchases',exact=True).click()
    portfolio.get_by_test_id('portfolio-add-holding').click()
    portfolio.get_by_test_id('portfolio-field-ticker').fill('DEMO')
    portfolio.get_by_role('button',name='Open NVDA holding details',exact=True).click()
    page.get_by_role('dialog').press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    assert portfolio.get_by_test_id('portfolio-field-ticker').input_value()=='DEMO'


def test_detail_can_open_evidence_and_browser_back_returns_to_the_same_detail(page):
    open_holdings(page)
    page.get_by_role('button',name='Open AMD holding details',exact=True).click()
    page.get_by_role('dialog').get_by_role('button',name='Open Evidence workspace',exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_test_id('portfolio-section-heading')).to_have_text('Evidence')
    page.go_back();expect(page.get_by_role('dialog',name='AMD holding details',exact=True)).to_be_visible()
    page.get_by_role('dialog').press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_role('button',name='Open AMD holding details',exact=True)).to_be_focused()


def test_history_unavailable_is_explicit_and_does_not_break_return_navigation(page):
    open_holdings(page)
    page.route('**/api/company-scale*',lambda route:route.fulfill(status=503,content_type='application/json',body='{}') if 'action=history' in route.request.url else route.fallback())
    page.get_by_role('button',name='Open NVDA holding details',exact=True).click()
    dialog=page.get_by_role('dialog')
    expect(dialog.get_by_text('NVDA: historical data unavailable',exact=True)).to_be_visible()
    dialog.press('Escape');expect(dialog).to_have_count(0)


def test_failed_holdings_query_is_unavailable_not_a_substitute_position(page):
    mock_local_apis(page)
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=503,content_type='application/json',body='{}'))
    page.goto('/portfolio?portfolio_tab=holdings&portfolio_detail=NVDA')
    dialog=page.get_by_role('dialog',name='NVDA holding details',exact=True)
    expect(dialog.get_by_role('alert')).to_contain_text('Holdings are unavailable')
    assert dialog.get_by_role('button',name='Open Evidence workspace',exact=True).count()==0
    dialog.press('Escape');expect(dialog).to_have_count(0)


def test_deep_link_waits_for_the_requested_holding_without_flashing_another(page):
    mock_local_apis(page);pending=[];released=False
    rows=[{'id':'fictional-'+symbol,'symbol':symbol,'quantity':1,'averageCost':100,'purchaseDate':'2026-01-01'} for symbol in ['NVDA','AMD']]
    def load(route):
        if released:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':rows}))
        else:pending.append(route)
    page.route('**/api/portfolio?includeLots=true',load)
    page.goto('/portfolio?portfolio_tab=holdings&portfolio_detail=AMD',wait_until='domcontentloaded')
    dialog=page.get_by_role('dialog',name='AMD holding details',exact=True)
    expect(dialog.get_by_role('status')).to_have_text('Loading this holding…')
    assert dialog.get_by_role('heading',name='NVDA',exact=True).count()==0
    released=True
    for route in pending:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':rows}))
    expect(dialog.get_by_role('heading',name='AMD',exact=True)).to_be_visible()


@pytest.mark.parametrize('width',[360,768,1440])
def test_detail_keyboard_modal_and_responsive_layout(page,width):
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    open_holdings(page)
    page.get_by_role('button',name='Open NVDA holding details',exact=True).click()
    dialog=page.get_by_role('dialog',name='NVDA holding details',exact=True)
    expect(dialog.get_by_role('button',name='Back to holdings',exact=True)).to_be_focused()
    for _ in range(16):
        page.keyboard.press('Tab')
        assert dialog.evaluate('(node)=>node.contains(document.activeElement)')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert dialog.evaluate('(node)=>node.scrollWidth<=node.clientWidth')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'));root.mkdir(parents=True,exist_ok=True)
    dialog.evaluate('(node)=>node.scrollTop=0')
    page.screenshot(path=str(root/f'holding-detail-{width}.png'),animations='disabled')
    page.keyboard.press('Escape');expect(dialog).to_have_count(0)
    assert page.locator('body').evaluate('(node)=>node.style.overflow')!='hidden'
