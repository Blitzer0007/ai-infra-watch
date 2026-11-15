"""Fictional policy proposals: no delivery transport, settings writes or live data."""
import json
import os
from pathlib import Path
import pytest
from playwright.sync_api import expect
from test_alert_inbox import open_inbox, LOCAL


def open_preview(page):
    inbox=open_inbox(page,[LOCAL])
    toggle=inbox.get_by_text('Explore notification policy · fictional preview',exact=True)
    assert not inbox.get_by_test_id('notification-policy-preview').is_visible()
    toggle.focus();toggle.press('Enter')
    preview=inbox.get_by_test_id('notification-policy-preview')
    expect(preview).to_be_visible()
    return preview


def test_policy_scenarios_explain_proposals_without_requests_or_storage_writes(page):
    errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
    preview=open_preview(page)
    requests=[];page.on('request',lambda request:requests.append((request.method,request.url)))
    stored=page.evaluate('JSON.stringify({...localStorage})')
    outcomes={
        'new-review':'Would propose an immediate review', 'unchanged':'Would suppress this episode',
        'accepted':'Would suppress this episode', 'accepted-unreconciled':'Would suppress this episode',
        'pending':'Reconciliation needed','uncertain':'Reconciliation needed',
        'rejected':'Would suppress this episode','conflicting':'Reconciliation needed',
        'opted-out':'Would suppress this episode','ownership':'Proposal withheld',
        'closed-session':'Would defer this review','manual-run':'Would defer this review',
        'missing-ledger':'Reconciliation needed','wrong-scope':'Proposal withheld',
        'stale':'Proposal withheld','simulated':'Proposal withheld',
        'low-priority':'Would propose an immediate review','cooldown':'Would propose an immediate review',
    }
    for scenario,outcome in outcomes.items():
        preview.get_by_role('combobox',name='Fictional scenario',exact=True).select_option(scenario)
        expect(preview.get_by_test_id('policy-disposition')).to_have_text(outcome)
        assert 'No action was taken' in preview.inner_text()
    assert page.evaluate('JSON.stringify({...localStorage})')==stored
    assert requests==[]
    assert errors==[]


def test_digest_and_cooldown_proposals_respect_prior_claims_and_priority(page):
    preview=open_preview(page)
    scenario=preview.get_by_role('combobox',name='Fictional scenario',exact=True)
    batch=preview.get_by_role('checkbox')
    batch.check()
    scenario.select_option('low-priority')
    expect(preview.get_by_test_id('policy-disposition')).to_have_text('Would propose a digest item')
    scenario.select_option('new-review')
    expect(preview.get_by_test_id('policy-disposition')).to_have_text('Would propose an immediate review')
    scenario.select_option('cooldown')
    preview.get_by_role('combobox',name='Proposed cooldown',exact=True).select_option('60')
    expect(preview.get_by_test_id('policy-disposition')).to_have_text('Would defer this review')
    assert '50 minutes' in preview.inner_text()
    scenario.select_option('accepted-unreconciled')
    preview.get_by_role('combobox',name='Proposed cooldown',exact=True).select_option('0')
    expect(preview.get_by_test_id('policy-disposition')).to_have_text('Would suppress this episode')
    assert 'Do not resend automatically' in preview.inner_text()
    assert 'Do not automatically retry or replace this episode' in preview.inner_text()


def test_preview_is_isolated_from_real_inbox_records_and_resets_after_reload(page):
    preview=open_preview(page)
    before=page.evaluate('localStorage.getItem("aiw_alert_events_v1")')
    preview.get_by_role('combobox',name='Fictional scenario',exact=True).select_option('accepted')
    page.get_by_test_id('inbox-record').get_by_text('Delivery unknown',exact=True).wait_for()
    assert page.evaluate('localStorage.getItem("aiw_alert_events_v1")')==before
    assert LOCAL in json.loads(before)
    assert preview.get_by_role('button').count()==0
    page.reload()
    inbox=page.get_by_test_id('alert-inbox')
    inbox.get_by_text('Explore notification policy · fictional preview',exact=True).click()
    expect(inbox.get_by_test_id('policy-disposition')).to_have_text('Would propose an immediate review')


@pytest.mark.parametrize('width',[360,768,1440])
def test_policy_preview_keyboard_and_responsive_trace(page,width):
    page.set_viewport_size({'width':width,'height':1000 if width==1440 else 800})
    preview=open_preview(page)
    preview.get_by_role('combobox',name='Fictional scenario',exact=True).select_option('accepted-unreconciled')
    trace=preview.locator('summary')
    trace.focus();trace.press('Enter')
    assert trace.evaluate('(element)=>element.parentElement.open')
    assert 'Preview contract: reentry-policy-preview-v1' in preview.inner_text()
    assert 'not your current settings' in preview.inner_text()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    unnamed=preview.locator('select,input').evaluate_all('(elements)=>elements.filter(e=>!e.getAttribute("aria-label")&&!e.labels?.length).length')
    assert unnamed==0
    root=Path(os.getenv('QA_ARTIFACT_DIR','/tmp/aiw-uiux'));root.mkdir(parents=True,exist_ok=True)
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(root/f'notification-policy-{width}.png'),full_page=True,animations='disabled')
