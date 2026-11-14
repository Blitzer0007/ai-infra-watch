"""Fictional Radar flow: isolated zero-network runtime plus intercepted full-app navigation."""
import json
import os
from pathlib import Path
import subprocess

import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def radar_bundle():
    script = """
import {buildSync} from 'esbuild';
const contents = `import React from 'react'; import {createRoot} from 'react-dom/client';
import EventRiskRadar from './src/components/portfolio/EventRiskRadar';
createRoot(document.getElementById('root')).render(<EventRiskRadar holdingSymbols={['NVDA','AMD','MSFT']} />);`;
process.stdout.write(buildSync({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},write:false}).outputFiles[0].text);
"""
    return subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True)


@pytest.fixture
def isolated_radar(page, radar_bundle):
    requests = []; errors = []
    page.on('request', lambda request: requests.append(request.url))
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('<div id="root"></div>')
    page.evaluate("""() => {
      window.fetch = () => {throw Error('Radar network forbidden');};
      window.WebSocket = class {constructor(){throw Error('Radar websocket forbidden');}};
      Storage.prototype.setItem = () => {throw Error('Radar persistence forbidden');};
      window.Notification = class {constructor(){throw Error('Radar notification forbidden');}};
    }""")
    page.add_script_tag(content=radar_bundle)
    panel = page.get_by_test_id('event-risk-radar')
    expect(panel.get_by_role('heading', name='Event Risk Radar', exact=True)).to_be_visible()
    yield panel
    assert requests == [] and errors == []


def test_manual_loading_sources_counter_evidence_and_zero_transport(page, isolated_radar):
    radar = isolated_radar
    assert radar.get_by_test_id('radar-event').count() == 0
    expect(radar.get_by_test_id('radar-source-health')).to_contain_text('Live X: not configured')
    radar.get_by_role('button', name='Load fictional timeline', exact=True).click()
    assert radar.get_by_test_id('radar-event').count() == 6
    cause = radar.get_by_test_id('radar-event').filter(has_text='NVDA · board change cause')
    expect(cause).to_contain_text('Fictional · Disputed')
    cause.locator('summary').click()
    expect(cause).to_contain_text('Simulated issuer · company-primary · contradicts')
    expect(cause).to_contain_text('First posted: 2024-06-08 12:00:00 UTC')
    assert cause.get_by_role('link').count() == 3
    radar.get_by_role('button', name='Inspect offline replay evaluation', exact=True).click()
    expect(radar.get_by_test_id('radar-replay-score')).to_contain_text('5 scorable · 1 early lead · 2 false leads · 1 missed · 1 post-event · 2 unscorable')
    expect(radar.get_by_test_id('radar-replay-score')).to_contain_text('Insufficient historical evidence')


def test_earlier_cutoff_holding_changes_and_missing_scope_do_not_imply_all_clear(page, isolated_radar):
    radar = isolated_radar
    radar.get_by_role('combobox', name='Fictional replay cutoff', exact=True).select_option('2024-06-08T13:00:00Z')
    radar.get_by_role('button', name='Load fictional timeline', exact=True).click()
    assert radar.get_by_test_id('radar-event').count() == 1
    expect(radar.get_by_test_id('radar-event')).to_contain_text('Fictional · Unverified')
    assert radar.get_by_test_id('radar-event').get_by_text('Simulated issuer', exact=True).count() == 0
    radar.get_by_role('combobox', name='Radar holding', exact=True).select_option('MSFT')
    assert radar.get_by_test_id('radar-event').count() == 0
    expect(radar.get_by_test_id('radar-load-status')).to_contain_text('Timeline not loaded')
    radar.get_by_role('button', name='Load fictional timeline', exact=True).click()
    expect(radar).to_contain_text('No fictional scenarios for this holding')
    expect(radar).to_contain_text('This says nothing about real events or source coverage')


def test_public_original_url_validation_is_syntax_only_and_has_no_acquisition(page, isolated_radar):
    radar = isolated_radar
    radar.get_by_text('Check a public original-post URL format', exact=True).click()
    field = radar.get_by_role('textbox', name='Public original-post URL (format only)', exact=True)
    field.fill('https://x.com/aravind/status/123456')
    radar.get_by_role('button', name='Validate URL format only', exact=True).click()
    expect(radar).to_contain_text('No content was fetched or retained')
    field.fill('https://x.com.evil.example/aravind/status/123456')
    radar.get_by_role('button', name='Validate URL format only', exact=True).click()
    expect(radar).to_contain_text('Unsupported URL')


@pytest.mark.parametrize('width', [360, 768, 1440])
def test_app_navigation_responsive_keyboard_and_no_radar_requests(page, width):
    mock_local_apis(page)
    page.set_viewport_size({'width': width, 'height': 1000})
    errors = []; calls = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: calls.append((request.method, request.url)))
    page.goto('/portfolio?portfolio_tab=radar')
    radar = page.get_by_test_id('event-risk-radar')
    expect(radar.get_by_role('heading', name='Event Risk Radar', exact=True)).to_be_visible()
    page.wait_for_load_state('networkidle')
    # Observe component actions after the existing app shell has loaded intercepted APIs.
    calls.clear()
    button = radar.get_by_role('button', name='Load fictional timeline', exact=True)
    button.focus(); button.press('Enter')
    radar.get_by_role('button', name='Inspect offline replay evaluation', exact=True).click()
    cause = radar.get_by_test_id('radar-event').filter(has_text='NVDA · board change cause')
    summary = cause.locator('summary'); summary.focus(); summary.press('Enter')
    assert summary.evaluate('(node) => node.parentElement.open')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert radar.evaluate('(node) => node.scrollWidth <= node.clientWidth')
    for link in radar.get_by_role('link').all():
        assert link.get_attribute('rel') == 'noopener noreferrer'
    assert not [url for _, url in calls if '/api/' in url]
    assert not [url for method, url in calls if method not in ('GET', 'HEAD')]
    assert errors == []
    output = Path(os.getenv('QA_ARTIFACT_DIR', '/tmp/aiw-radar')); output.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output / f'event-risk-radar-{width}.png'), full_page=True, animations='disabled')


def test_holding_dialog_has_discoverable_radar_link_without_mounting_event_study(page):
    mock_local_apis(page)
    page.goto('/portfolio?portfolio_tab=holdings&portfolio_detail=NVDA')
    dialog = page.get_by_role('dialog', name='NVDA holding details', exact=True)
    dialog.get_by_role('button', name='Open Event Risk Radar · fictional preview', exact=True).click()
    expect(page.get_by_test_id('event-risk-radar')).to_be_visible()
    assert page.get_by_role('dialog').count() == 0
    assert page.get_by_test_id('event-risk-radar').get_by_test_id('radar-event').count() == 0
