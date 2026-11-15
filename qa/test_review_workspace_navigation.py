"""Fictional review context and closed issuer routes; no production records or sends."""
import json
from urllib.parse import parse_qs,urlparse
import pytest
from playwright.sync_api import expect
from test_catalyst_calendar import prepare,load_snapshot,fixture_event
from test_alert_inbox import open_inbox,LOCAL,server_item,payload

@pytest.fixture(autouse=True)
def no_errors_or_writes(page):
    errors=[];writes=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.on('request',lambda r:writes.append(r.url) if r.method not in ('GET','HEAD') else None)
    yield
    assert errors==[] and writes==[]


def configured_fict(page):
    page.add_init_script('localStorage.setItem("aiw_config_v1",JSON.stringify({watchlist:["FICT"],finnhubKey:"",alerts:[]}))')


def assert_private_search_not_linked(page,href):
    query=parse_qs(urlparse(href).query)
    assert not any(key in query for key in ('query','calendar_q','inbox_q','cursor','episodeId','providerMessageId','title','message','token','notes'))
    assert 'private' not in href
    assert query['research_symbol']==['FICT'] and query['portfolio_tab']==['research']


def test_calendar_url_options_and_local_query_restore_with_back_forward(page):
    prepare(page,[])
    calendar=page.get_by_test_id('catalyst-calendar')
    calendar.get_by_role('searchbox',name='Search calendar',exact=True).fill('private search')
    calendar.get_by_role('button',name='90 days',exact=True).click()
    calendar.get_by_role('combobox',name='Event certainty',exact=True).select_option('cancelled')
    assert 'calendar_days=90' in page.url and 'calendar_certainty=cancelled' in page.url
    assert 'private' not in page.url
    page.go_back()
    expect(calendar.get_by_role('combobox',name='Event certainty',exact=True)).to_have_value('all')
    expect(calendar.get_by_role('searchbox',name='Search calendar',exact=True)).to_have_value('private search')
    page.go_forward()
    expect(calendar.get_by_role('combobox',name='Event certainty',exact=True)).to_have_value('cancelled')
    page.reload()
    expect(page.get_by_role('searchbox',name='Search calendar',exact=True)).to_have_value('private search')
    expect(page.get_by_role('button',name='90 days',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_test_id('catalyst-calendar')).to_contain_text('Calendar data is unavailable')


@pytest.mark.parametrize('width',[360,768,1440])
def test_calendar_company_round_trip_retains_loaded_snapshot_explanation_focus_and_filters(page,width):
    configured_fict(page);prepare(page,[fixture_event(title='Fictional private calendar search')]);calendar=load_snapshot(page)
    calendar.get_by_role('button',name='90 days',exact=True).click()
    calendar.get_by_role('combobox',name='Event certainty',exact=True).select_option('confirmed')
    calendar.get_by_role('combobox',name='Review timezone',exact=True).select_option('UTC')
    calendar.get_by_role('searchbox',name='Search calendar',exact=True).fill('private')
    card=calendar.get_by_test_id('catalyst-event');card.locator('summary').click()
    page.set_viewport_size({'width':width,'height':1000});link=card.get_by_role('link',name='Research FICT',exact=True)
    link.scroll_into_view_if_needed();before=page.evaluate('scrollY')
    assert_private_search_not_linked(page,link.get_attribute('href'))
    calls=[];page.on('request',lambda r:calls.append(r.url) if '/api/' in r.url else None)
    link.focus();link.press('Enter')
    workspace=page.get_by_test_id('company-research-workspace')
    expect(workspace.get_by_role('heading',name='Company research: FICT',exact=True)).to_be_visible()
    expect(workspace).to_contain_text('Watchlist company · no loaded position')
    assert not [url for url in calls if '/api/quote' in url or 'action=history' in url or '/api/earnings-alerts' in url or '/api/alert-inbox' in url]
    workspace.get_by_role('link',name='Return to Calendar',exact=True).click()
    calendar=page.get_by_test_id('catalyst-calendar')
    expect(calendar.get_by_role('searchbox',name='Search calendar',exact=True)).to_have_value('private')
    expect(calendar.get_by_role('button',name='90 days',exact=True)).to_have_attribute('aria-pressed','true')
    expect(calendar.get_by_role('combobox',name='Event certainty',exact=True)).to_have_value('confirmed')
    expect(calendar.get_by_role('combobox',name='Review timezone',exact=True)).to_have_value('UTC')
    expect(calendar.get_by_test_id('catalyst-event').locator('details')).to_have_attribute('open','')
    expect(calendar.get_by_role('link',name='Research FICT',exact=True)).to_be_focused()
    assert abs(page.evaluate('scrollY')-before)<3
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.go_back();expect(page.get_by_test_id('company-research-workspace')).to_be_visible()
    page.go_forward();expect(page.get_by_test_id('catalyst-calendar')).to_be_visible()
    assert not [url for url in calls if '/api/earnings-alerts' in url]


def test_inbox_server_cache_and_private_reading_context_return_without_another_get(page):
    configured_fict(page);inbox=open_inbox(page,[{**LOCAL,'message':'private search phrase'}]);calls=[]
    page.route('**/api/alert-inbox*',lambda r:(calls.append(r.request.url),r.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item(deliveryState='uncertain',providerMessageId=None,reconciliationRequired=True)])))))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    expect(inbox.get_by_test_id('inbox-record')).to_have_count(2)
    inbox.get_by_role('combobox',name='Delivery evidence',exact=True).select_option('unknown')
    inbox.get_by_role('combobox',name='Read here',exact=True).select_option('unread')
    inbox.get_by_role('searchbox',name='Search alerts',exact=True).fill('private')
    record=inbox.get_by_test_id('inbox-record');record.locator('summary').click()
    link=record.get_by_role('link',name='Research FICT',exact=True);assert_private_search_not_linked(page,link.get_attribute('href'));link.click()
    expect(page.get_by_test_id('company-research-workspace')).to_be_visible()
    page.go_back()
    inbox=page.get_by_test_id('alert-inbox')
    expect(inbox.get_by_role('searchbox',name='Search alerts',exact=True)).to_have_value('private')
    expect(inbox.get_by_role('combobox',name='Delivery evidence',exact=True)).to_have_value('unknown')
    expect(inbox.get_by_role('combobox',name='Read here',exact=True)).to_have_value('unread')
    expect(inbox.get_by_test_id('inbox-record').locator('details')).to_have_attribute('open','')
    expect(inbox.get_by_role('link',name='Research FICT',exact=True)).to_be_focused()
    expect(inbox).to_contain_text('Server history: 1 loaded re-entry delivery records')
    assert len(calls)==1
    inbox.get_by_role('searchbox',name='Search alerts',exact=True).fill('')
    inbox.get_by_role('combobox',name='Delivery evidence',exact=True).select_option('uncertain')
    expect(inbox.get_by_test_id('inbox-record')).to_contain_text('Uncertain')
    expect(inbox.get_by_test_id('inbox-record')).not_to_contain_text('Read here')
    assert len(calls)==1


def test_inbox_history_window_back_and_reload_require_manual_server_reads(page):
    inbox=open_inbox(page,[]);calls=[]
    page.route('**/api/alert-inbox*',lambda r:(calls.append(r.request.url),r.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item()])))))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    expect(inbox.get_by_test_id('inbox-record')).to_have_count(1)
    inbox.get_by_role('combobox',name='History window',exact=True).select_option('30')
    expect(inbox).to_contain_text('Server history: not loaded')
    page.go_back()
    expect(inbox.get_by_role('combobox',name='History window',exact=True)).to_have_value('7')
    expect(inbox).to_contain_text('Server history: not loaded')
    page.reload();expect(page.get_by_test_id('alert-inbox')).to_contain_text('Server history: not loaded')
    assert len(calls)==1


def test_direct_unconfigured_research_never_substitutes_a_company_or_loads_a_feed(page):
    from test_ui import mock_local_apis
    mock_local_apis(page);calls=[];page.on('request',lambda r:calls.append(r.url))
    page.goto('/portfolio?portfolio_tab=research&research_symbol=ZZZZ&research_from=calendar&calendar_days=180&calendar_zone=UTC&returnTo=https://evil.invalid&query=private')
    workspace=page.get_by_test_id('company-research-workspace')
    expect(workspace.get_by_role('alert')).to_contain_text('No substitute company')
    back=workspace.get_by_role('link',name='Return to Calendar',exact=True)
    assert back.get_attribute('href')=='/calendar?calendar_days=180&calendar_certainty=all&calendar_zone=UTC'
    back.click();expect(page.get_by_test_id('catalyst-calendar')).to_contain_text('Calendar data is unavailable')
    assert not [url for url in calls if '/api/earnings-alerts' in url or 'action=history' in url or '/api/alert-inbox' in url]


def test_failed_inbox_refresh_and_local_acknowledgement_survive_company_return(page):
    configured_fict(page);inbox=open_inbox(page,[LOCAL]);calls=[];fail={'value':False}
    def ledger(route):
        calls.append(route.request.url)
        route.fulfill(status=503 if fail['value'] else 200,content_type='application/json',body=json.dumps(payload([server_item(deliveryState='uncertain',providerMessageId=None,reconciliationRequired=True)])))
    page.route('**/api/alert-inbox*',ledger)
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    expect(inbox.get_by_test_id('inbox-record')).to_have_count(2)
    record=inbox.get_by_test_id('inbox-record').filter(has_text='Server delivery record')
    record.get_by_role('button',name='Mark read here',exact=True).click()
    fail['value']=True;inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    expect(inbox.get_by_role('alert')).to_contain_text('Previously loaded records')
    record.get_by_role('link',name='Research FICT',exact=True).click()
    page.get_by_role('link',name='Return to Alert inbox',exact=True).click()
    inbox=page.get_by_test_id('alert-inbox')
    expect(inbox.get_by_role('alert')).to_contain_text('Previously loaded records')
    expect(inbox.get_by_test_id('inbox-record').filter(has_text='Server delivery record')).to_contain_text('Read here')
    expect(inbox.get_by_test_id('inbox-record').filter(has_text='Server delivery record')).to_contain_text('Uncertain')
    assert len(calls)==2


def test_leaving_inbox_during_manual_read_does_not_replay_it_on_return(page):
    configured_fict(page);inbox=open_inbox(page,[LOCAL]);pending=[]
    page.route('**/api/alert-inbox*',lambda route:pending.append(route))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    expect(inbox.get_by_role('button',name='Loading server history…',exact=True)).to_be_disabled()
    inbox.get_by_role('link',name='Research FICT',exact=True).click()
    expect(page.get_by_test_id('company-research-workspace')).to_be_visible()
    for route in pending:route.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item()])))
    page.go_back();inbox=page.get_by_test_id('alert-inbox')
    expect(inbox.get_by_role('button',name='Load server delivery history',exact=True)).to_be_enabled()
    expect(inbox).to_contain_text('Server history: not loaded')
    assert len(pending)==1


def test_invalid_duplicate_view_fields_are_canonicalized_without_copying_other_inputs(page):
    from test_ui import mock_local_apis
    mock_local_apis(page)
    page.goto('/alerts?inbox_days=999&inbox_state=accepted&inbox_state=uncertain&inbox_read=delivered&query=private&cursor=private')
    expect(page.get_by_role('combobox',name='History window',exact=True)).to_have_value('7')
    expect(page.get_by_role('combobox',name='Delivery evidence',exact=True)).to_have_value('all')
    expect(page.get_by_role('combobox',name='Read here',exact=True)).to_have_value('all')
    assert parse_qs(urlparse(page.url).query)=={'inbox_days':['7'],'inbox_state':['all'],'inbox_read':['all']}
    page.goto('/calendar?calendar_days=999&calendar_certainty=confirmed&calendar_certainty=cancelled&calendar_zone=Invalid&notes=private')
    expect(page.get_by_role('button',name='30 days',exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.get_by_role('combobox',name='Event certainty',exact=True)).to_have_value('all')
    expect(page.get_by_role('combobox',name='Review timezone',exact=True)).to_have_value('local')
    assert 'private' not in page.url


def test_research_quote_guard_resumes_when_opening_holdings_and_preserves_same_page_navigation(page):
    from test_portfolio_valuation import setup as valuation_setup
    control=valuation_setup(page);page.clock.resume()
    page.goto('/portfolio?portfolio_tab=research&research_symbol=NVDA')
    expect(page.get_by_test_id('company-research-workspace')).to_be_visible();page.wait_for_load_state('networkidle')
    baseline=control['calls']
    # Selecting the current main destination must not change the section or start its quote loop.
    page.get_by_test_id('nav-portfolio').click();page.wait_for_load_state('networkidle')
    expect(page.get_by_test_id('portfolio-section-heading')).to_have_text('Portfolio Research')
    assert control['calls']==baseline and 'portfolio_tab=research' in page.url
    with page.expect_response(lambda r:'/api/quote?symbol=NVDA&refresh=true' in r.url):
        page.get_by_role('combobox',name='Portfolio section',exact=True).select_option('holdings')
    page.wait_for_load_state('networkidle')
    assert control['calls']>baseline
    expect(page.get_by_test_id('portfolio-valuation-coverage')).to_contain_text('2/2 holding values supported')
    page.get_by_role('combobox',name='Portfolio section',exact=True).select_option('research')
    page.wait_for_load_state('networkidle');baseline=control['calls']
    with page.expect_response(lambda r:'/api/quote?symbol=NVDA&refresh=true' in r.url):
        page.go_back()
    page.wait_for_load_state('networkidle')
    expect(page.get_by_test_id('portfolio-section-heading')).to_have_text('My Holdings')
    assert control['calls']>baseline

@pytest.mark.parametrize('width',[360,768,1440])
def test_exact_calendar_record_context_and_reload_gap(page,width):
    configured_fict(page)
    prepare(page,[fixture_event(id='first',title='First fictional issuer event'),
                  fixture_event(id='second',title='Second fictional issuer event',date='2026-11-14',confirmation='estimated',confirmationBasis=None)])
    calendar=load_snapshot(page)
    page.set_viewport_size({'width':width,'height':950})
    assert calendar.get_by_test_id('catalyst-event').count()==2
    calendar.get_by_test_id('catalyst-event').filter(has_text='Second fictional issuer event').get_by_role('link',name='Research FICT',exact=True).click()
    context=page.get_by_test_id('research-origin-context')
    expect(context).to_contain_text('Second fictional issuer event')
    expect(context).not_to_contain_text('First fictional issuer event')
    expect(context).to_contain_text('Date only; no event time supplied')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert 'Second fictional' not in page.url
    page.get_by_role('link',name='Return to Calendar',exact=True).click()
    calendar=page.get_by_test_id('catalyst-calendar')
    calendar.get_by_test_id('catalyst-event').filter(has_text='First fictional issuer event').get_by_role('link',name='Research FICT',exact=True).click()
    expect(context).to_contain_text('First fictional issuer event')
    expect(context).not_to_contain_text('Second fictional issuer event')
    page.reload()
    expect(page.get_by_test_id('research-origin-context')).to_contain_text('exact opened event context is unavailable')


def test_exact_inbox_record_context_separates_browser_and_server(page):
    configured_fict(page)
    inbox=open_inbox(page,[LOCAL]);reads=[]
    page.route('**/api/alert-inbox*',lambda route:(reads.append(route.request.url),route.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item()])))))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    inbox.get_by_test_id('inbox-record').filter(has_text='Browser detection').get_by_role('link',name='Research FICT',exact=True).click()
    context=page.get_by_test_id('research-origin-context')
    expect(context).to_contain_text('Local browser detection')
    expect(context).to_contain_text('No provider acceptance receipt')
    assert 'fictional-local-event' not in page.url
    page.get_by_role('link',name='Return to Alert inbox',exact=True).click()
    inbox=page.get_by_test_id('alert-inbox')
    inbox.get_by_test_id('inbox-record').filter(has_text='Server delivery record').get_by_role('link',name='Research FICT',exact=True).click()
    expect(context).to_contain_text('Server re-entry delivery record')
    expect(context).to_contain_text('not a read receipt')
    expect(context).to_contain_text('Original trigger and message text are absent')
    assert len(reads)==1
    page.go_back();expect(page.get_by_test_id('alert-inbox')).to_be_visible()
    page.go_forward();expect(page.get_by_test_id('research-origin-context')).to_contain_text('Server re-entry delivery record')


def test_reloaded_original_alert_context_is_not_reconstructed(page):
    configured_fict(page)
    inbox=open_inbox(page,[LOCAL])
    inbox.get_by_test_id('inbox-record').get_by_role('link',name='Research FICT',exact=True).click()
    expect(page.get_by_test_id('research-origin-context')).to_contain_text('Local browser detection')
    page.reload()
    expect(page.get_by_test_id('research-origin-context')).to_contain_text('exact opened alert context is unavailable')
    page.goto('/portfolio?portfolio_tab=research&research_symbol=FICT&research_from=calendar')
    expect(page.get_by_test_id('research-origin-context')).to_contain_text('exact opened event context is unavailable')
