from pathlib import Path
import json
import os
from test_ui import goto_app, mock_local_apis

ARTIFACTS = Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-release2'))


def fictional_portfolio(page, watchlist=('DEMO',)):
    page.add_init_script('localStorage.setItem("aiw_config_v1", JSON.stringify('+json.dumps({'watchlist':list(watchlist),'finnhubKey':'','alerts':[]})+'));')
    mock_local_apis(page)
    page.route('**/api/portfolio?includeLots=true', lambda route: route.fulfill(status=200,content_type='application/json',body=json.dumps({'holdings':[{'id':'fictional-holding','symbol':'FICT','quantity':1,'averageCost':100,'purchaseDate':'2026-01-01','notes':''}]})))


def test_opportunities_scan_filters_and_no_write_paths(page):
    writes = []
    page.on('request',lambda request:writes.append(request.url) if request.method in ('POST','PUT','PATCH','DELETE') else None)
    fictional_portfolio(page)
    goto_app(page)
    page.get_by_test_id('nav-opportunities').click()
    scanner = page.get_by_test_id('opportunity-scanner')
    scanner.get_by_text('No scan has run.',exact=False).wait_for()
    page.wait_for_load_state('networkidle')
    scan_requests = []
    page.on('request',lambda request:scan_requests.append(request.url))
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_test_id('opportunity-card').first.wait_for()
    assert scanner.get_by_test_id('opportunity-card').count() == 2
    assert scan_requests == []
    assert 'Needs reliable data' in scanner.inner_text()
    assert '0 validated signal families' in scanner.inner_text()
    scanner.get_by_text('Evidence and missing inputs for FICT',exact=True).click()
    assert 'accounting unverified' in scanner.inner_text()
    assert 'Comparable reported revenue growth' in scanner.inner_text()
    scanner.get_by_role('searchbox',name='Search research candidates').fill('DEMO')
    assert scanner.get_by_test_id('opportunity-card').count() == 1
    scanner.get_by_role('combobox',name='Research status').select_option('research-candidate')
    scanner.get_by_text('No research candidates match these filters.',exact=True).wait_for()
    assert writes == []


def test_opportunities_direct_route_mobile_and_snapshot_refresh(page):
    fictional_portfolio(page)
    page.goto('/opportunities',wait_until='domcontentloaded')
    scanner = page.get_by_test_id('opportunity-scanner')
    scan = scanner.get_by_role('button',name='Scan loaded snapshot',exact=True)
    scan.click()
    scanner.get_by_test_id('opportunity-card').first.wait_for()
    scan.click()
    assert scanner.get_by_test_id('opportunity-card').count() == 2
    page.set_viewport_size({'width':360,'height':800})
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    assert scanner.evaluate('(element)=>element.scrollWidth <= element.clientWidth')
    ARTIFACTS.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(ARTIFACTS/'release2-opportunities-mobile.png'))
    page.set_viewport_size({'width':1440,'height':1000})
    page.screenshot(path=str(ARTIFACTS/'release2-opportunities-desktop.png'))
    page.reload(wait_until='domcontentloaded')
    scanner.get_by_text('No scan has run.',exact=False).wait_for()


def test_watchlist_development_does_not_sync_configuration(page):
    writes = []
    page.on('request',lambda request:writes.append(request.url) if '/api/alert-config' in request.url and request.method == 'POST' else None)
    fictional_portfolio(page)
    goto_app(page)
    page.get_by_test_id('nav-watchlist').click()
    page.get_by_role('heading',name='Watchlist',exact=True).wait_for()
    page.get_by_test_id('nav-opportunities').click()
    page.get_by_test_id('opportunity-scanner').wait_for()
    assert writes == []


def test_unavailable_holdings_do_not_become_a_complete_zero_position_scan(page):
    errors = []
    page.on('pageerror',lambda error:errors.append(str(error)))
    fictional_portfolio(page)
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=503,content_type='application/json',body='{}'))
    goto_app(page)
    page.get_by_test_id('nav-opportunities').click()
    scanner = page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_text('Holdings could not be loaded.',exact=False).wait_for()
    assert 'Holdings unavailable' in scanner.inner_text()
    assert errors == []
    assert scanner.get_by_test_id('opportunity-card').count() == 1


def test_empty_research_universe_is_distinct_from_missing_data(page):
    fictional_portfolio(page,watchlist=())
    page.route('**/api/portfolio?includeLots=true',lambda route:route.fulfill(status=200,content_type='application/json',body='{"holdings":[]}'))
    goto_app(page)
    page.get_by_test_id('nav-opportunities').click()
    scanner = page.get_by_test_id('opportunity-scanner')
    scanner.get_by_role('button',name='Scan loaded snapshot',exact=True).click()
    scanner.get_by_text('No holdings or watchlist symbols are available in this snapshot.',exact=True).wait_for()
    assert scanner.get_by_test_id('opportunity-card').count() == 0
