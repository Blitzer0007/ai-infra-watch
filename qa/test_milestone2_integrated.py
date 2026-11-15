"""Milestone 2 cross-workspace acceptance: fictional fixtures and intercepted I/O only."""
import json
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis
from test_review_workspace_navigation import configured_fict
from test_catalyst_calendar import prepare, load_snapshot, fixture_event
from test_alert_inbox import open_inbox, LOCAL, server_item, payload


@pytest.fixture(autouse=True)
def no_browser_errors_or_writes(page):
    errors, writes = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: writes.append((req.method, req.url))
            if req.method not in ('GET', 'HEAD') else None)
    yield
    assert errors == []
    assert writes == []  # Includes no portfolio saves, scans, Telegram or schema writes.


@pytest.mark.parametrize('width', [360, 768, 1440])
def test_open_portfolio_editor_stays_unsubmitted_across_sections_and_back(page, width):
    mock_local_apis(page)
    page.set_viewport_size({'width': width, 'height': 950})
    page.goto('/portfolio?portfolio_tab=holdings')
    root = page.get_by_test_id('portfolio-intelligence')
    select = root.get_by_role('combobox', name='Portfolio section', exact=True)
    editor = root.get_by_test_id('portfolio-management')
    expect(editor).to_be_visible()
    editor.locator('summary').click()
    root.get_by_test_id('portfolio-add-holding').click()
    root.get_by_test_id('portfolio-field-ticker').fill('FICT')
    root.get_by_test_id('portfolio-field-notes').fill('Fictional pending draft')
    expect(root).to_contain_text('This is an unsaved editing session')
    select.select_option('evidence')
    expect(root.get_by_test_id('portfolio-draft-retained')).to_contain_text('Switching sections did not save or discard')
    assert root.get_by_test_id('portfolio-field-ticker').is_hidden()
    select.select_option('performance')
    expect(root.get_by_test_id('portfolio-draft-retained')).to_be_visible()
    page.go_back()  # Evidence from previous browser entry
    expect(root.get_by_test_id('portfolio-draft-retained')).to_be_visible()
    select.select_option('holdings')
    expect(root.get_by_test_id('portfolio-field-ticker')).to_have_value('FICT')
    expect(root.get_by_test_id('portfolio-field-notes')).to_have_value('Fictional pending draft')
    assert root.get_by_test_id('portfolio-draft-retained').count() == 0
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    root.get_by_role('button', name='Cancel', exact=True).last.click()
    select.select_option('evidence')
    assert root.get_by_test_id('portfolio-draft-retained').count() == 0


@pytest.mark.parametrize('width', [360, 1440])
def test_calendar_exact_source_and_research_dossier_do_not_claim_corroboration(page, width):
    configured_fict(page)
    prepare(page, [
        fixture_event(id='earlier', title='Earlier fictional issuer report'),
        fixture_event(id='later', title='Later fictional issuer revision',
                      date='2026-11-14', confirmation='estimated', confirmationBasis=None,
                      sourceUrl='https://example.com/issuer/later')
    ])
    calendar = load_snapshot(page)
    page.set_viewport_size({'width': width, 'height': 950})
    source_reads = []
    page.on('request', lambda req: source_reads.append(req.url) if '/api/earnings-alerts' in req.url else None)
    calendar.get_by_test_id('catalyst-event').filter(has_text='Later fictional issuer revision').get_by_role(
        'link', name='Research FICT', exact=True).click()
    research = page.get_by_test_id('company-research-workspace')
    origin = research.get_by_test_id('research-origin-context')
    expect(origin).to_contain_text('Later fictional issuer revision')
    expect(origin).not_to_contain_text('Earlier fictional issuer report')
    expect(origin).to_contain_text('Date only; no event time supplied')
    expect(research.get_by_test_id('research-source-boundary')).to_contain_text('independent evidence scopes')
    research.get_by_text('Company dossier', exact=True).click()
    dossier = research.get_by_test_id('company-dossier')
    expect(dossier.get_by_test_id('dossier-source-status')).to_contain_text('Financial source not connected')
    dossier.get_by_role('button', name='Sources', exact=True).click()
    expect(dossier).to_contain_text('No supported filing references loaded')
    expect(research.get_by_test_id('research-source-boundary')).to_contain_text('does not verify the issuer')
    assert 'Later fictional' not in page.url
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    research.get_by_role('link', name='Return to Calendar', exact=True).click()
    expect(page.get_by_test_id('catalyst-calendar')).to_be_visible()
    assert source_reads == []  # No replay of the original feed on return.


def test_inbox_browser_vs_provider_evidence_never_becomes_dossier_fact(page):
    configured_fict(page)
    inbox = open_inbox(page, [LOCAL])
    reads = []
    def ledger(route):
        reads.append(route.request.url)
        route.fulfill(status=200, content_type='application/json',
                      body=json.dumps(payload([server_item()])))
    page.route('**/api/alert-inbox*', ledger)
    inbox.get_by_role('button', name='Load server delivery history', exact=True).click()
    server = inbox.get_by_test_id('inbox-record').filter(has_text='Server delivery record')
    expect(server).to_have_count(1)
    server.get_by_role('link', name='Research FICT', exact=True).click()
    research = page.get_by_test_id('company-research-workspace')
    origin = research.get_by_test_id('research-origin-context')
    expect(origin).to_contain_text('Server re-entry delivery record')
    expect(origin).to_contain_text('not a read receipt')
    expect(origin).to_contain_text('Original trigger and message text are absent')
    expect(origin).not_to_contain_text('Fictional price target reached')
    expect(research.get_by_test_id('research-source-boundary')).to_contain_text('Telegram provider receipt')
    research.get_by_text('Company dossier', exact=True).click()
    dossier = research.get_by_test_id('company-dossier')
    expect(dossier).to_contain_text('Read-only research')
    research.get_by_role('link', name='Return to Alert inbox', exact=True).click()
    expect(page.get_by_test_id('alert-inbox').get_by_test_id('inbox-record')).to_have_count(2)
    assert len(reads) == 1  # No automatic resend, replay or ledger refresh.


@pytest.mark.parametrize('origin', ['calendar', 'alerts'])
def test_direct_company_links_with_missing_source_stay_unverified(page, origin):
    configured_fict(page)
    mock_local_apis(page)
    page.goto('/portfolio?portfolio_tab=research&research_symbol=FICT&research_from=' + origin)
    research = page.get_by_test_id('company-research-workspace')
    expect(research.get_by_test_id('research-origin-context')).to_contain_text('context is unavailable')
    expect(research.get_by_test_id('research-source-boundary')).to_contain_text('missing evidence stays unavailable')
    research.get_by_text('Company dossier', exact=True).click()
    expect(research.get_by_test_id('dossier-source-status')).to_contain_text('Financial source not connected')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
