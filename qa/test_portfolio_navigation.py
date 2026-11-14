"""Task-oriented portfolio navigation with fixture-backed financial regressions."""
from pathlib import Path
import os
import pytest
from test_ui import mock_local_apis


@pytest.fixture(autouse=True)
def no_errors(page):
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    yield
    assert errors==[]


def open_portfolio(page,path='/portfolio'):
    mock_local_apis(page);page.goto(path)
    page.get_by_test_id('portfolio-command-center').get_by_test_id('position-decision-card').first.wait_for() if 'portfolio_tab=' not in path else page.get_by_test_id('portfolio-section-heading').wait_for()
    return page.get_by_test_id('portfolio-intelligence')


def test_daily_review_has_early_navigation_without_editors_or_advanced_fetches(page):
    calls=[];page.on('request',lambda request:calls.append(request.url))
    portfolio=open_portfolio(page)
    page.wait_for_load_state('networkidle')
    nav=portfolio.get_by_test_id('portfolio-navigation').bounding_box();center=portfolio.get_by_test_id('portfolio-command-center').bounding_box()
    assert nav['y']<center['y']
    assert portfolio.get_by_test_id('portfolio-add-holding').count()==0
    assert portfolio.get_by_placeholder('Search ticker, company or theme').count()==0
    assert portfolio.get_by_text('Portfolio Risk & Market Pressure',exact=True).count()==0
    assert not [url for url in calls if 'action=history' in url or 'action=analyst' in url or 'symbol=INR' in url]
    assert portfolio.get_by_test_id('position-decision-card').count()>0


def test_every_workspace_is_reachable_and_preserves_legacy_query_state(page):
    portfolio=open_portfolio(page)
    select=portfolio.get_by_role('combobox',name='Portfolio section',exact=True)
    for value,label in [('holdings','My Holdings'),('performance','Performance'),('evidence','Evidence'),('research','Portfolio Research'),('events','Events'),('rotation','Money Flow'),('network','Connections'),('watchlist','Watchlist'),('overview','Daily Review')]:
        select.select_option(value)
        page.wait_for_function('(label)=>document.querySelector("[data-testid=portfolio-section-heading]").textContent===label',arg=label)
        assert 'portfolio_tab='+value in page.url
        assert portfolio.get_by_test_id('portfolio-section-heading').evaluate('(element)=>document.activeElement===element')
    assert 'portfolio_symbol=NVDA' in page.url


def test_section_back_navigation_and_progressive_holdings_management(page):
    portfolio=open_portfolio(page)
    select=portfolio.get_by_role('combobox',name='Portfolio section',exact=True)
    select.select_option('holdings')
    portfolio.get_by_placeholder('Search ticker, company or theme').fill('NVDA')
    assert not portfolio.get_by_test_id('portfolio-management').evaluate('(element)=>element.open')
    assert portfolio.get_by_test_id('portfolio-add-holding').is_hidden()
    portfolio.get_by_text('Manage positions and purchases',exact=True).click()
    portfolio.get_by_test_id('portfolio-add-holding').wait_for(state='visible')
    portfolio.get_by_test_id('portfolio-add-holding').click()
    portfolio.get_by_test_id('portfolio-field-ticker').fill('DEMO')
    select.select_option('performance')
    page.go_back()
    page.wait_for_function('document.querySelector("[data-testid=portfolio-section-heading]").textContent==="My Holdings"')
    assert portfolio.get_by_placeholder('Search ticker, company or theme').input_value()=='NVDA'
    assert select.input_value()=='holdings'
    assert portfolio.get_by_test_id('portfolio-field-ticker').input_value()=='DEMO'


@pytest.mark.parametrize('width',[360,768,1440])
def test_section_jump_remains_available_and_no_controls_overflow(page,width):
    portfolio=open_portfolio(page)
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    select=portfolio.get_by_role('combobox',name='Portfolio section',exact=True)
    assert select.is_visible()
    page.evaluate('scrollTo(0,document.body.scrollHeight)')
    box=select.bounding_box()
    assert 0<=box['y']<800
    select.select_option('holdings')
    page.wait_for_function('document.querySelector("[data-testid=portfolio-section-heading]").textContent==="My Holdings"')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert portfolio.get_by_test_id('portfolio-section-heading').bounding_box()['y']>=select.bounding_box()['y']
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-portfolio'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(root/f'portfolio-focused-holdings-{width}.png'),full_page=True,animations='disabled')
    select.select_option('overview');page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(root/f'portfolio-focused-review-{width}.png'),full_page=True,animations='disabled')


def test_selected_holding_is_preserved_between_detail_workspaces(page):
    import json
    mock_local_apis(page)
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':[{'id':'qa-nvda','symbol':'NVDA','quantity':1,'averageCost':150,'purchaseDate':'2026-01-01'},{'id':'qa-amd','symbol':'AMD','quantity':1,'averageCost':100,'purchaseDate':'2026-01-01'}]})))
    page.goto('/portfolio?portfolio_tab=holdings')
    picker=page.get_by_role('combobox',name='Selected holding',exact=True)
    picker.locator('option[value="AMD"]').wait_for(state='attached')
    picker.select_option('AMD')
    assert 'portfolio_symbol=AMD' in page.url
    page.get_by_role('combobox',name='Portfolio section',exact=True).select_option('evidence')
    page.wait_for_function('document.querySelector("[data-testid=portfolio-section-heading]").textContent==="Evidence"')
    assert picker.input_value()=='AMD'
    page.get_by_role('combobox',name='Portfolio section',exact=True).select_option('network')
    page.wait_for_function('document.querySelector("[data-testid=portfolio-section-heading]").textContent==="Connections"')
    assert picker.input_value()=='AMD'
