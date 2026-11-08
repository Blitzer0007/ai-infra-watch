"""Loaded earnings snapshot → normalized calendar → date/source UI, with no live IO."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
import pytest
from test_ui import mock_local_apis

NOW = datetime(2026, 11, 8, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def no_browser_errors(page):
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    yield
    assert errors==[]


def fixture_event(**overrides):
    event = {'id':'qa-report','symbol':'FICT','date':'2026-11-12','days_until':4,'title':'Fictional issuer results','kind':'earnings','source':'Fictional issuer','sourceUrl':'https://example.com/investors/results','confirmation':'confirmed','confirmationBasis':'issuer','publishedAt':'2026-11-01T12:00:00Z','retrievedAt':'2026-11-08T10:00:00Z'}
    return event | overrides


def prepare(page, rows, *, status=200):
    page.clock.set_fixed_time(NOW)
    mock_local_apis(page)
    payload = {'ok':status==200,'source':'Fictional feed','as_of':'2026-11-08T12:00:00Z','lookahead_days':14,'upcoming':rows}
    page.route('**/api/earnings-alerts*',lambda route:route.fulfill(status=status,content_type='application/json',body=json.dumps(payload)))
    page.goto('/calendar')
    page.get_by_role('heading',name='Catalyst calendar',level=1).wait_for()


def load_snapshot(page):
    with page.expect_response(lambda response:'/api/earnings-alerts?' in response.url and 'history=' not in response.url):
        page.get_by_role('button',name='Open Watchlist earnings feed').click()
    page.get_by_test_id('nav-calendar').click()
    calendar=page.get_by_test_id('catalyst-calendar')
    calendar.get_by_role('heading',level=1,name='Catalyst calendar').wait_for()
    page.wait_for_load_state('networkidle')
    return calendar


def test_direct_calendar_is_unavailable_and_does_not_load_an_earnings_feed(page):
    calls=[]
    page.on('request',lambda request:calls.append(request.url) if '/api/earnings-alerts' in request.url else None)
    prepare(page,[])
    calendar=page.get_by_test_id('catalyst-calendar')
    calendar.get_by_text('Calendar data is unavailable.',exact=False).wait_for()
    calendar.get_by_role('button',name='180 days',exact=True).click()
    page.wait_for_load_state('networkidle')
    assert calls==[]
    assert calendar.get_by_test_id('catalyst-event').count()==0


def test_loaded_legacy_estimates_and_calendar_controls_make_no_requests_or_writes(page):
    writes=[]
    page.on('request',lambda request:writes.append(request.url) if request.method in ('POST','PUT','PATCH','DELETE') else None)
    prepare(page,[{'id':'legacy','symbol':'FICT','date':'2026-11-12','days_until':4,'hour':'amc','title':'Fictional estimated results'}])
    calendar=load_snapshot(page)
    card=calendar.get_by_test_id('catalyst-event')
    card.get_by_text('Estimated',exact=True).wait_for()
    calls=[]
    page.on('request',lambda request:calls.append(request.url))
    calendar.get_by_role('button',name='90 days',exact=True).click()
    calendar.get_by_role('combobox',name='Event certainty').select_option('confirmed')
    assert card.count()==0
    calendar.get_by_text('No loaded events match',exact=False).wait_for()
    calendar.get_by_role('button',name='Clear filters').click()
    card.get_by_text('Estimated',exact=True).wait_for()
    card.locator('summary').click()
    assert 'Issuer confirmation has not been supplied.' in card.inner_text()
    assert 'A public event source link is unavailable.' in card.inner_text()
    assert card.get_by_role('link').count()==0
    assert calls==[]
    assert writes==[]
    assert 'Source-confirmed coverage: unknown' in calendar.inner_text()
    calendar.get_by_text('Coverage and feed details',exact=True).click()
    assert '14 days' in calendar.inner_text()


def test_corrections_cancellations_and_range_history(page):
    prepare(page,[fixture_event(),fixture_event(id='qa-corrected',date='2026-12-20',days_until=42,title='Fictional rescheduled results',supersedesId='qa-report',publishedAt='2026-11-06T12:00:00Z'),fixture_event(id='qa-cancelled',date='2026-12-20',days_until=42,title='Fictional cancelled results',confirmation='cancelled',supersedesId='qa-corrected',publishedAt='2026-11-07T12:00:00Z')])
    calendar=load_snapshot(page)
    assert calendar.get_by_test_id('catalyst-event').count()==0
    calendar.get_by_role('button',name='90 days',exact=True).click()
    card=calendar.get_by_test_id('catalyst-event')
    card.get_by_text('Cancelled',exact=True).wait_for()
    assert card.count()==1
    card.locator('summary').click()
    card.get_by_text('Earlier reported versions',exact=True).wait_for()
    assert card.get_by_text('Superseded',exact=False).count()==2
    assert card.get_by_role('link').count()==3
    calendar.get_by_role('searchbox',name='Search calendar').fill('no-match')
    assert card.count()==0
    calendar.get_by_role('button',name='Clear filters').click()
    assert card.count()==1


def test_exact_times_change_zone_while_date_only_days_are_preserved(page):
    prepare(page,[fixture_event(id='date-only'),fixture_event(id='instant',date='2026-11-12T00:30:00Z',timeZone='UTC',title='Fictional exact-time event')])
    calendar=load_snapshot(page)
    zone=calendar.get_by_role('combobox',name='Review timezone')
    zone.select_option('America/New_York')
    assert 'Nov 12, 2026' in calendar.get_by_test_id('catalyst-event').filter(has_text='Fictional issuer results').locator('time').inner_text()
    exact=calendar.get_by_test_id('catalyst-event').filter(has_text='Fictional exact-time event').locator('time')
    assert '11/11/2026' in exact.inner_text()
    zone.select_option('Asia/Kolkata')
    assert '11/12/2026' in exact.inner_text()
    assert page.evaluate('localStorage.getItem("aiw-review-timezone")')=='Asia/Kolkata'
    page.get_by_test_id('nav-portfolio').click()
    page.get_by_role('heading',name='Portfolio Intelligence',level=1,exact=True).wait_for()
    page.get_by_role('combobox',name='Review timezone').wait_for()
    assert page.get_by_role('combobox',name='Review timezone').input_value()=='Asia/Kolkata'


@pytest.mark.parametrize('status',[200,503])
def test_empty_and_failed_feeds_remain_distinct(page,status):
    prepare(page,[],status=status)
    calendar=load_snapshot(page)
    expected='No loaded events match' if status==200 else 'Calendar data is unavailable'
    calendar.get_by_text(expected,exact=False).wait_for()
    assert 'Source-confirmed coverage: unknown' in calendar.inner_text()


def test_calendar_keyboard_and_responsive_cards(page):
    prepare(page,[fixture_event(),fixture_event(id='estimate',symbol='DEMO',confirmation='estimated',title='Fictional estimated event')])
    calendar=load_snapshot(page)
    button=calendar.get_by_role('button',name='180 days',exact=True)
    button.focus();button.press('Enter')
    assert button.get_attribute('aria-pressed')=='true'
    summary=calendar.get_by_test_id('catalyst-event').first.locator('summary')
    summary.focus();summary.press('Enter')
    assert summary.evaluate('(element)=>element.parentElement.open')
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-release2'))
    root.mkdir(parents=True,exist_ok=True)
    for width in (1440,768,360):
        page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert calendar.evaluate('(element)=>element.scrollWidth<=element.clientWidth')
        page.evaluate('scrollTo(0,0)')
        page.screenshot(path=str(root/f'release2-calendar-{width}.png'),full_page=True,animations='disabled')


def test_stale_snapshot_and_failed_reload_are_not_healthy_empty_data(page):
    prepare(page,[fixture_event()])
    calendar=load_snapshot(page)
    assert calendar.get_by_test_id('catalyst-event').count()==1
    page.clock.set_fixed_time(datetime(2026,11,10,12,0,tzinfo=timezone.utc))
    calendar.get_by_role('button',name='90 days',exact=True).click()
    calendar.get_by_text('This snapshot is more than 24 hours old.',exact=False).wait_for()
    page.route('**/api/earnings-alerts*',lambda route:route.fulfill(status=503,content_type='application/json',body='{"ok":false,"upcoming":[]}'))
    calendar=load_snapshot(page)
    calendar.get_by_text('Calendar data is unavailable.',exact=False).wait_for()
    assert calendar.get_by_test_id('catalyst-event').count()==0
    assert 'No loaded events match' not in calendar.inner_text()


def test_simulated_calendar_rows_never_appear_as_confirmed_events(page):
    prepare(page,[fixture_event(simulated=True)])
    calendar=load_snapshot(page)
    calendar.get_by_text('Calendar data is unavailable.',exact=False).wait_for()
    assert calendar.get_by_test_id('catalyst-event').count()==0
    assert 'Simulated calendar records' in calendar.inner_text()
