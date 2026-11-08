"""Read-only inbox against intercepted records; no real destination or database."""
import json
from datetime import datetime, timezone
import pytest
from test_ui import mock_local_apis

NOW=datetime(2026,11,8,12,0,tzinfo=timezone.utc)
LOCAL={'id':'fictional-local-event','type':'price','severity':'high','symbol':'FICT','title':'Fictional price target reached','message':'A fictional threshold was crossed.','timestamp':int(NOW.timestamp()*1000)-3600000,'deliveryState':'accepted','providerMessageId':'forged'}


def server_item(char='a',**overrides):
    return {'id':'server:'+char*43,'episodeId':'z'*43,'origin':'reentry-server','symbol':'FICT','observedAt':'2026-11-08T11:00:00Z','deliveryState':'accepted','providerMessageId':'42','reconciliationRequired':False,**overrides}


def payload(items,next_cursor=None):
    return {'ok':True,'source':'reentry-telegram-ledger','coverage':'partial','from':'2026-11-01T12:00:00Z','until':'2026-11-08T12:00:00Z','items':items,'nextCursor':next_cursor}


@pytest.fixture(autouse=True)
def no_errors(page):
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    yield
    assert errors==[]


def open_inbox(page,events=None):
    page.clock.set_fixed_time(NOW)
    if events is not None:page.add_init_script('localStorage.setItem("aiw_alert_events_v1",'+json.dumps(json.dumps(events))+');')
    mock_local_apis(page)
    page.goto('/alerts')
    page.get_by_role('heading',name='Alert inbox',level=1).wait_for()
    page.wait_for_load_state('networkidle')
    return page.get_by_test_id('alert-inbox')


def test_browser_detection_is_not_delivery_and_opening_inbox_never_loads_server(page):
    calls=[];page.on('request',lambda request:calls.append(request.url) if '/api/alert-inbox' in request.url else None)
    inbox=open_inbox(page,[LOCAL])
    record=inbox.get_by_test_id('inbox-record')
    assert record.count()==1
    record.get_by_text('Delivery unknown',exact=True).wait_for()
    record.locator('summary').click()
    assert 'No correlated server delivery proof' in record.inner_text()
    assert 'forged' not in inbox.inner_text()
    inbox.get_by_role('combobox',name='Delivery evidence',exact=True).select_option('accepted')
    assert record.count()==0
    inbox.get_by_role('searchbox',name='Search alerts').fill('FICT')
    assert calls==[]
    assert inbox.get_by_role('button',name='Resend',exact=False).count()==0


def test_local_read_state_does_not_modify_history_delivery_or_make_writes(page):
    writes=[];page.on('request',lambda request:writes.append(request.url) if request.method in ('POST','PUT','PATCH','DELETE') else None)
    inbox=open_inbox(page,[LOCAL])
    before=page.evaluate('localStorage.getItem("aiw_alert_events_v1")')
    inbox.get_by_role('combobox',name='Read here',exact=True).select_option('unread')
    inbox.get_by_role('button',name='Mark read here',exact=True).click()
    assert inbox.get_by_test_id('inbox-record').count()==0
    assert page.evaluate('localStorage.getItem("aiw_alert_events_v1")')==before
    inbox.get_by_role('combobox',name='Read here',exact=True).select_option('read')
    inbox.get_by_test_id('inbox-record').get_by_text('Delivery unknown',exact=True).wait_for()
    assert page.evaluate('JSON.parse(localStorage.getItem("aiw-alert-inbox-read-v1"))')==['local:fictional-local-event']
    assert writes==[]
    page.reload()
    page.get_by_role('button',name='Mark unread here',exact=True).wait_for()


def test_manual_server_read_is_scoped_separate_and_acceptance_is_not_a_read_receipt(page):
    inbox=open_inbox(page,[LOCAL]);calls=[]
    def ledger(route):
        calls.append((route.request.method,route.request.url))
        route.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item(),server_item('b',deliveryState='uncertain',providerMessageId='43',reconciliationRequired=True)])))
    page.route('**/api/alert-inbox*',ledger)
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    page.wait_for_function('document.querySelectorAll("[data-testid=inbox-record]").length===3')
    assert len(calls)==1 and calls[0][0]=='GET' and '?days=7' in calls[0][1]
    assert inbox.get_by_test_id('inbox-record').get_by_text('Provider accepted',exact=True).count()==2
    assert inbox.get_by_test_id('inbox-record').get_by_text('Delivery unknown',exact=True).count()==1
    server_record=inbox.get_by_test_id('inbox-record').filter(has_text='Server delivery record').first
    server_record.locator('summary').click()
    assert 'not a read receipt' in server_record.inner_text()
    assert 'It has not been matched to a browser detection' in server_record.inner_text()


@pytest.mark.parametrize('status',[200,503])
def test_empty_and_unavailable_server_history_are_distinct(page,status):
    inbox=open_inbox(page,[])
    page.route('**/api/alert-inbox*',lambda route:route.fulfill(status=status,content_type='application/json',body=json.dumps(payload([]))))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    if status==200:inbox.get_by_text('Server history: 0 loaded re-entry delivery records.',exact=True).wait_for()
    else:inbox.get_by_role('alert').wait_for()
    assert 'Other alert classes are not covered.' in inbox.inner_text()


def test_pagination_window_reset_and_search_use_only_explicit_gets(page):
    inbox=open_inbox(page,[]);calls=[]
    def ledger(route):
        calls.append(route.request.url)
        result=payload([server_item('b')]) if 'cursor=' in route.request.url else payload([server_item()], 'fictional-cursor')
        route.fulfill(status=200,content_type='application/json',body=json.dumps(result))
    page.route('**/api/alert-inbox*',ledger)
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    inbox.get_by_role('button',name='Load next server page',exact=True).click()
    page.wait_for_function('document.querySelectorAll("[data-testid=inbox-record]").length===2')
    inbox.get_by_role('searchbox',name='Search alerts').fill('no match')
    assert inbox.get_by_test_id('inbox-record').count()==0
    assert len(calls)==2
    inbox.get_by_role('combobox',name='History window',exact=True).select_option('30')
    inbox.get_by_text('Server history: not loaded.',exact=True).wait_for()
    assert len(calls)==2


def test_corrupt_browser_history_is_unavailable_not_empty(page):
    page.add_init_script('localStorage.setItem("aiw_alert_events_v1","{invalid")')
    inbox=open_inbox(page)
    inbox.get_by_text('Browser history: unavailable.',exact=True).wait_for()
    assert 'not an empty-history result' in inbox.inner_text()


@pytest.mark.parametrize('width',[360,768,1440])
def test_loaded_inbox_responsive_keyboard_and_redaction(page,width):
    from pathlib import Path
    import os
    inbox=open_inbox(page,[LOCAL])
    page.route('**/api/alert-inbox*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item(chat_id='fixture-private-destination',token='fixture-private-token'),server_item('b',deliveryState='uncertain',providerMessageId=None,reconciliationRequired=True)]))))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    page.wait_for_function('document.querySelectorAll("[data-testid=inbox-record]").length===3')
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    summary=inbox.get_by_test_id('inbox-record').first.locator('summary')
    summary.focus();summary.press('Enter')
    assert summary.evaluate('(element)=>element.parentElement.open')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert 'fixture-private' not in inbox.inner_text()
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-inbox'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('scrollTo(0,0)');page.screenshot(path=str(root/f'alert-inbox-{width}.png'),full_page=True,animations='disabled')


def test_conflicting_message_reference_does_not_claim_provider_acceptance(page):
    inbox=open_inbox(page,[])
    page.route('**/api/alert-inbox*',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(payload([server_item(deliveryState='rejected',providerMessageId='42')]))))
    inbox.get_by_role('button',name='Load server delivery history',exact=True).click()
    record=inbox.get_by_test_id('inbox-record')
    record.get_by_text('Delivery unknown',exact=True).wait_for()
    record.locator('summary').click()
    assert 'acceptance remains unconfirmed' in record.inner_text()
    assert 'This is acceptance evidence' not in record.inner_text()
