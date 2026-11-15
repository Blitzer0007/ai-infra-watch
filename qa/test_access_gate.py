"""Exercise the real, non-QA access gate against a loopback-only static build."""
import os
from pathlib import Path
import pytest
from safety import is_loopback_url


@pytest.mark.parametrize('width', [320, 768, 1440])
def test_private_access_labels_validation_and_error_recovery(page, width):
    base = os.getenv('QA_LOGIN_BASE_URL')
    if not base:
        pytest.skip('Set QA_LOGIN_BASE_URL to a loopback preview built with VITE_QA_MODE=false')
    assert is_loopback_url(base), 'Access-gate tests require a loopback preview'
    page.set_viewport_size({'width': width, 'height': 800})
    requests = []

    def reject_fixture(route):
        requests.append(route.request.method)
        route.fulfill(status=401, content_type='application/json', body='{"error":"Token not accepted. Try again."}')

    page.route('**/api/auth', reject_fixture)
    page.goto(base)
    page.get_by_role('heading', level=1, name='Private dashboard').wait_for()
    token = page.get_by_label('Access token', exact=True)
    submit = page.get_by_role('button', name='Unlock dashboard')
    assert token.get_attribute('type') == 'password'
    assert submit.is_disabled()
    token.fill('qa-invalid-access-token')
    token.press('Enter')
    page.get_by_role('alert').wait_for()
    assert 'Token not accepted' in page.get_by_role('alert').inner_text()
    assert token.get_attribute('aria-invalid') == 'true'
    assert 'access-error' in token.get_attribute('aria-describedby')
    assert submit.is_enabled()
    assert requests == ['POST']
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('sessionStorage.getItem("aiw_access_token_v1")') is None
    root = Path(os.getenv('QA_ARTIFACT_DIR', '/tmp/aiw-uiux')) / 'uiux-audit' / 'after'
    root.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(root / f'access-{width}.png'))
