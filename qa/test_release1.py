from pathlib import Path
import os
from playwright.sync_api import expect

ARTIFACTS = Path(os.getenv("QA_ARTIFACT_DIR", "/tmp/aiw-release1"))
from test_ui import goto_app, mock_local_apis


def test_command_center_fails_closed_and_preserves_navigation(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id('nav-portfolio').click()
    center = page.get_by_test_id('portfolio-command-center')
    center.get_by_test_id('position-decision-card').first.wait_for()
    assert 'Not enough reliable data' in center.inner_text()
    assert 'Price: Unavailable' in center.inner_text()
    freshness = center.get_by_test_id('freshness-provenance').first
    freshness.get_by_text('Quote source and timestamps', exact=True).click()
    assert 'cannot establish a live price by itself' in freshness.inner_text()
    center.get_by_text('Why this position needs review').first.click()
    assert 'Missing information' in center.inner_text()
    center.get_by_role('button', name='Position details', exact=True).first.click()
    assert 'portfolio_tab=holdings' in page.url


def test_glossary_keyboard_escape_and_mobile_layout(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id('nav-guide').click()
    glossary = page.get_by_role('region', name='Financial glossary')
    glossary.get_by_role('button', name='Explain P/E ratio', exact=True).wait_for()
    assert glossary.get_by_role('button').count() == 20
    button = glossary.get_by_role('button', name='Explain P/E ratio', exact=True)
    button.focus()
    page.keyboard.press('Enter')
    dialog = page.get_by_role('dialog')
    assert dialog.is_visible()
    assert '$100' in dialog.inner_text()
    page.keyboard.press('Escape')
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(button).to_be_focused()
    page.set_viewport_size({'width':360,'height':800})
    button.click()
    assert page.get_by_role('dialog').is_visible()
    box = page.get_by_role('dialog').bounding_box()
    assert box['width'] <= 360
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(ARTIFACTS / 'release1-glossary-mobile.png'))


def test_command_center_mobile_and_no_config_writes(page):
    writes = []
    page.on('request', lambda request: writes.append(request.url) if '/api/alert-config' in request.url and request.method == 'POST' else None)
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id('nav-portfolio').click()
    center = page.get_by_test_id('portfolio-command-center')
    center.get_by_test_id('position-decision-card').first.wait_for()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(ARTIFACTS / 'release1-command-center-desktop.png'))
    page.set_viewport_size({'width':360,'height':800})
    assert center.evaluate('(element) => element.scrollWidth <= element.clientWidth')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    refresh = page.get_by_role('button', name='REFRESH FEED')
    refresh.wait_for(state='visible')
    box = refresh.bounding_box()
    assert box['x'] >= 0 and box['x'] + box['width'] <= 360
    page.screenshot(path=str(ARTIFACTS / 'release1-command-center-mobile.png'))
    assert writes == []


def test_review_queue_search_classification_and_detail_preference(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id('nav-portfolio').click()
    center = page.get_by_test_id('portfolio-command-center')
    center.get_by_test_id('position-decision-card').first.wait_for()
    search = center.get_by_role('searchbox', name='Search review queue')
    search.fill('not-held')
    center.get_by_text('No positions match these filters.', exact=False).wait_for()
    assert center.get_by_test_id('position-decision-card').count() == 0
    search.fill('nvda')
    center.get_by_test_id('position-decision-card').first.wait_for()
    classification = center.get_by_role('combobox', name='Review classification')
    classification.select_option('RISK REVIEW')
    assert center.get_by_test_id('position-decision-card').count() == 0
    classification.select_option('all')
    center.get_by_text('Why this position needs review', exact=True).click()
    method = center.get_by_text('Methodology and prior engine output', exact=True)
    assert not method.evaluate('(summary) => summary.parentElement.open')
    page.get_by_role('button', name='Detailed', exact=True).click()
    assert method.evaluate('(summary) => summary.parentElement.open')
    assert page.evaluate("localStorage.getItem('aiw-portfolio-view-mode')") == 'detailed'
    page.reload(wait_until='domcontentloaded')
    center.get_by_test_id('position-decision-card').first.wait_for()
    center.get_by_text('Why this position needs review', exact=True).click()
    assert method.evaluate('(summary) => summary.parentElement.open')


def test_glossary_search_related_terms_and_focus_containment(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id('nav-guide').click()
    glossary = page.get_by_role('region', name='Financial glossary')
    search = glossary.get_by_role('searchbox', name='Find a financial term')
    search.fill('not-a-real-term')
    glossary.get_by_text('No matching definitions.', exact=False).wait_for()
    search.fill('P/E ratio')
    original = glossary.get_by_role('button', name='Explain P/E ratio', exact=True)
    original.click()
    dialog = page.get_by_role('dialog')
    dialog.get_by_role('button', name='Risk/reward ratio', exact=True).click()
    dialog.get_by_role('heading', name='Risk/reward ratio', exact=True).wait_for()
    dialog.get_by_role('button', name='Drawdown', exact=True).click()
    dialog.get_by_role('heading', name='Drawdown', exact=True).wait_for()
    for _ in range(8):
        page.keyboard.press('Tab')
        assert dialog.evaluate('(element) => element.contains(document.activeElement)')
    page.keyboard.press('Escape')
    expect(original).to_be_focused()
    original.click()
    dialog.get_by_role('heading', name='P/E ratio', exact=True).wait_for()


def test_command_center_empty_and_error_states_are_distinct(page):
    import json
    mock_local_apis(page)
    page.route('**/api/portfolio?includeLots=true', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps({'holdings':[]})))
    goto_app(page)
    page.get_by_test_id('nav-portfolio').click()
    center = page.get_by_test_id('portfolio-command-center')
    center.get_by_text('No holdings yet.', exact=False).wait_for()
    page.route('**/api/portfolio?includeLots=true', lambda route: route.fulfill(status=503, content_type='application/json', body=json.dumps({'error':'Fixture service unavailable'})))
    page.reload(wait_until='domcontentloaded')
    center.get_by_role('alert').wait_for()
    assert 'Portfolio service unavailable' in center.get_by_role('alert').inner_text()
    assert 'No holdings yet.' not in center.inner_text()


def test_command_center_loading_is_not_reported_as_empty(page):
    mock_local_apis(page)
    pending = []
    page.route('**/api/portfolio?includeLots=true', lambda route: pending.append(route))
    goto_app(page)
    page.get_by_test_id('nav-portfolio').click()
    center = page.get_by_test_id('portfolio-command-center')
    center.get_by_text('Loading holdings…', exact=True).wait_for()
    assert 'No holdings yet.' not in center.inner_text()
    assert center.get_by_test_id('position-decision-card').count() == 0
    for route in pending:
        route.fulfill(status=200, content_type='application/json', body='{"holdings":[]}')
    center.get_by_text('No holdings yet.', exact=False).wait_for()


def test_review_timezone_is_local_only_and_persists(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id('nav-portfolio').click()
    center = page.get_by_test_id('portfolio-command-center')
    center.get_by_role('combobox', name='Review timezone').select_option('Asia/Kolkata')
    center.get_by_text('Times shown in Asia/Kolkata.', exact=False).wait_for()
    assert page.evaluate("localStorage.getItem('aiw-review-timezone')") == 'Asia/Kolkata'
    page.reload(wait_until='domcontentloaded')
    center.get_by_text('Times shown in Asia/Kolkata.', exact=False).wait_for()
    assert center.get_by_role('combobox', name='Review timezone').input_value() == 'Asia/Kolkata'
