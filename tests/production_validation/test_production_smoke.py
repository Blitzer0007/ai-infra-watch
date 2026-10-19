"""Read-only production smoke tests.

Configure PROD_BASE_URL. Authenticated tests require PROD_STORAGE_STATE_B64 and
PROD_AUTHENTICATED_MARKER. Never commit storage-state files or print their contents.
"""
from __future__ import annotations

import base64
import os
from pathlib import Path
from urllib.parse import urlparse

import pytest
from playwright.sync_api import Browser, BrowserContext, Page, expect

BASE_URL = os.getenv("PROD_BASE_URL", "https://ai-infra-watch-theta.vercel.app").rstrip("/")
STORAGE_STATE_B64 = os.getenv("PROD_STORAGE_STATE_B64", "").strip()
AUTH_MARKER = os.getenv("PROD_AUTHENTICATED_MARKER", "").strip()
SMOKE_PATHS = [
    path.strip()
    for path in os.getenv("PROD_SMOKE_PATHS", "/").split(",")
    if path.strip()
]


@pytest.fixture()
def page(browser: Browser, tmp_path: Path):
    state_path = None
    context: BrowserContext
    if STORAGE_STATE_B64:
        state_path = tmp_path / "storage-state.json"
        # Decode only in runner temp storage; never log or upload this file.
        state_path.write_bytes(base64.b64decode(STORAGE_STATE_B64, validate=True))
        context = browser.new_context(storage_state=str(state_path))
    else:
        context = browser.new_context()
    page = context.new_page()
    yield page
    context.close()


def test_production_homepage_is_reachable(page: Page):
    response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
    assert response is not None, "Production navigation returned no main-document response"
    assert response.status < 500, f"Production homepage returned HTTP {response.status}"
    expect(page.locator("body")).not_to_be_empty()


def test_internal_navigation_does_not_return_server_errors(page: Page):
    failures: list[str] = []
    parsed_base = urlparse(BASE_URL)
    for path in SMOKE_PATHS:
        response = page.goto(f"{BASE_URL}/{path.lstrip('/')}", wait_until="domcontentloaded", timeout=60_000)
        if response is None:
            failures.append(f"{path}: no main-document response")
        elif response.status >= 500:
            failures.append(f"{path}: HTTP {response.status}")
        current = urlparse(page.url)
        assert current.scheme in {"http", "https"}
        # A login redirect is allowed here; authentication is verified separately.
        if current.netloc and current.netloc != parsed_base.netloc:
            assert current.scheme == "https", "Cross-origin redirect must use HTTPS"
    assert not failures, "; ".join(failures)


@pytest.mark.skipif(
    not STORAGE_STATE_B64 or not AUTH_MARKER,
    reason="BLOCKED: configure secure PROD_STORAGE_STATE_B64 and PROD_AUTHENTICATED_MARKER secrets",
)
def test_authenticated_production_session(page: Page):
    response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
    assert response is not None and response.status < 400
    marker = page.locator(AUTH_MARKER).first
    expect(marker).to_be_visible(timeout=20_000)


@pytest.mark.skipif(
    not STORAGE_STATE_B64 or not AUTH_MARKER,
    reason="BLOCKED: authenticated read-only route checks require the approved QA session",
)
def test_authenticated_read_only_routes(page: Page):
    for path in SMOKE_PATHS:
        response = page.goto(f"{BASE_URL}/{path.lstrip('/')}", wait_until="domcontentloaded", timeout=60_000)
        assert response is not None and response.status < 400, f"Route failed: {path}"
        expect(page.locator(AUTH_MARKER).first).to_be_visible(timeout=20_000)
