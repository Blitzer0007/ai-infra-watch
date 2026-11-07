from pathlib import Path
import os

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
    assert page.get_by_role('dialog').count() == 0
    assert button.evaluate('(element) => element === document.activeElement')
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
    page.screenshot(path=str(ARTIFACTS / 'release1-command-center-mobile.png'))
    assert writes == []
