"""Browser → actual read handler → fictional rows → summary → panel; loopback only."""
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlsplit

import httpx
from playwright.sync_api import expect
import pytest
from safety import is_loopback_url
from test_release2 import fictional_portfolio

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='module')
def forecast_gateway(tmp_path_factory):
    directory = tmp_path_factory.mktemp('forecast-summary')
    port_file = directory / 'port'
    env = {'PATH': os.environ.get('PATH', ''), 'AIW_ACCESS_TOKEN': 'fictional-session',
           'SUPABASE_URL': 'https://fixture.invalid', 'SUPABASE_SERVICE_ROLE_KEY': 'fictional-database-key'}
    with (directory / 'gateway.log').open('w') as output:
        process = subprocess.Popen(['node', str(ROOT / 'qa/forecast_summary_gateway.mjs'), str(port_file)],
                                   cwd=ROOT, env=env, stdout=output, stderr=output)
        try:
            for _ in range(50):
                if port_file.exists(): break
                if process.poll() is not None: raise AssertionError('Fictional gateway exited')
                time.sleep(.1)
            else: raise AssertionError('Fictional gateway did not start')
            address = 'http://127.0.0.1:' + port_file.read_text()
            assert is_loopback_url(address)
            with httpx.Client(trust_env=False) as client:
                assert client.get(address + '/health').status_code == 204
            yield address
        finally:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)


@pytest.fixture(autouse=True)
def no_page_errors(page):
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    yield
    assert errors == []


def setup(page, forecast_gateway):
    fictional_portfolio(page)
    page.add_init_script('sessionStorage.setItem("aiw_access_token_v1","fictional-session")')
    holdings = [{'id': 'fictional-' + symbol, 'symbol': symbol, 'quantity': 1, 'averageCost': 100,
                 'purchaseDate': '2026-01-01', 'notes': ''} for symbol in ['FICT', 'OTHER']]
    page.route('**/api/portfolio?includeLots=true', lambda route: route.fulfill(
        status=200, content_type='application/json', body=json.dumps({'holdings': holdings})))
    calls = []

    def relay(route):
        assert route.request.method == 'GET'
        assert route.request.headers['authorization'] == 'Bearer fictional-session'
        path = urlsplit(route.request.url)
        response = route.fetch(url=forecast_gateway + path.path + '?' + path.query)
        assert response.status == 200
        body = response.json()
        calls.append(body)
        route.fulfill(response=response)

    page.route('**/api/forecast-validation*', relay)
    page.goto('/portfolio?portfolio_tab=holdings&portfolio_detail=FICT')
    detail = page.get_by_test_id('holding-research-detail')
    detail.locator('summary').first.click()
    panel = page.get_by_test_id('forecast-validation-panel')
    expect(panel.get_by_text('Global sample-count policy met', exact=True)).to_be_visible()
    return panel, calls


def test_actual_handler_counts_and_mixed_coverage_are_descriptive(page, forecast_gateway):
    panel, calls = setup(page, forecast_gateway)
    body = calls[-1]
    assert body['contractVersion'] == 'forecast-summary-v2'
    assert body['overall']['count'] == 100 and body['overall']['directionalSampleCount'] == 0
    assert body['globalValidationGate']['independent5D'] == 25
    assert body['globalValidationGate']['independent20D'] == 100
    assert body['overall']['calibrationVerdict'] == 'mixed coverage'
    expect(panel).to_contain_text('Global retained outcomes: 125 / 50')
    expect(panel).to_contain_text('Heuristic match score')
    method = panel.get_by_test_id('forecast-summary-method')
    method.locator('summary').focus(); method.locator('summary').press('Enter')
    expect(method).to_contain_text('Interval diagnostic: mixed coverage')
    expect(method).to_contain_text('0 nonzero prediction/outcome pairs')
    expect(method).to_contain_text('100 zero pairs')
    expect(method).to_contain_text('does not establish statistical independence')
    expect(method).to_contain_text('not a probability')
    assert 'Auto tracking is on' not in panel.inner_text()
    assert 'well calibrated' not in panel.inner_text()


def switch_holding(page):
    page.evaluate("""() => {
      history.pushState(null, '', '/portfolio?portfolio_tab=holdings&portfolio_detail=OTHER&portfolio_symbol=OTHER');
      dispatchEvent(new PopStateEvent('popstate'));
    }""")


def test_symbol_change_clears_previous_metrics_and_learning_before_error(page, forecast_gateway):
    panel, _ = setup(page, forecast_gateway)
    pending = []
    page.route('**/api/forecast-validation*ticker=OTHER*', lambda route: pending.append(route))
    switch_holding(page)
    expect(panel).to_contain_text('OTHER · 20D verified history')
    expect(panel).to_contain_text('Loading')
    assert panel.get_by_test_id('forecast-summary-method').count() == 0
    assert 'What are we learning?' not in panel.inner_text()
    expect(page.get_by_test_id('forecast-validation-panel')).to_have_count(1)
    page.wait_for_timeout(100)
    assert pending
    for route in pending:
        route.fulfill(status=503, content_type='application/json', body='{"ok":false,"error":"Forecast validation is unavailable."}')
    expect(panel.get_by_role('alert')).to_contain_text('Forecast validation is unavailable.')
    assert 'No verified' not in panel.inner_text()
    assert 'What are we learning?' not in panel.inner_text()
    assert panel.get_by_test_id('forecast-summary-method').count() == 0


def test_late_previous_symbol_response_cannot_restore_old_results(page, forecast_gateway):
    panel, calls = setup(page, forecast_gateway)
    previous = calls[-1]
    pending = []
    page.route('**/api/forecast-validation*ticker=FICT*', lambda route: pending.append(route))
    # Change through the actual URL navigation state without remounting the dialog.
    switch_holding(page)
    expect(panel).to_contain_text('No eligible verified 20D forecast outcomes')
    page.evaluate("""() => {
      history.pushState(null, '', '/portfolio?portfolio_tab=holdings&portfolio_detail=FICT&portfolio_symbol=FICT');
      dispatchEvent(new PopStateEvent('popstate'));
    }""")
    expect(panel).to_contain_text('Loading')
    page.wait_for_timeout(100)
    assert pending
    switch_holding(page)
    expect(panel).to_contain_text('OTHER · 20D verified history')
    expect(panel).to_contain_text('No eligible verified 20D forecast outcomes')
    for route in pending:
        route.fulfill(status=200, content_type='application/json', body=json.dumps(previous))
    page.wait_for_timeout(150)
    assert panel.get_by_test_id('forecast-summary-method').count() == 0
    assert 'What are we learning?' not in panel.inner_text()
    expect(panel).to_contain_text('OTHER · 20D verified history')


@pytest.mark.parametrize('body', ['not-json', '{}'])
def test_malformed_success_is_unavailable_not_empty(page, forecast_gateway, body):
    panel, _ = setup(page, forecast_gateway)
    page.route('**/api/forecast-validation*ticker=OTHER*', lambda route: route.fulfill(
        status=200, content_type='application/json', body=body))
    switch_holding(page)
    expect(panel.get_by_role('alert')).to_contain_text('Forecast validation is unavailable.')
    assert 'No eligible' not in panel.inner_text()
    assert 'What are we learning?' not in panel.inner_text()


@pytest.mark.parametrize('width', [360, 768, 1440])
def test_forecast_summary_keyboard_and_responsive_evidence(page, forecast_gateway, width):
    page.set_viewport_size({'width': width, 'height': 900})
    panel, _ = setup(page, forecast_gateway)
    method = panel.get_by_test_id('forecast-summary-method')
    method.locator('summary').focus(); method.locator('summary').press('Enter')
    expect(method).to_contain_text('Interval diagnostic: mixed coverage')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    root = Path(os.getenv('QA_ARTIFACT_DIR', '/tmp/aiw-uiux')); root.mkdir(parents=True, exist_ok=True)
    method.scroll_into_view_if_needed()
    page.evaluate('document.activeElement?.blur()')
    page.screenshot(path=str(root / f'forecast-summary-{width}.png'), animations='disabled')
