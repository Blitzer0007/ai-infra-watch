"""Read-only production smoke tests.

Playwright storage state does not include sessionStorage. Therefore a green
route/shell check is not by itself proof of access to protected data: the suite
also probes the protected portfolio GET using the token already present in the
page's sessionStorage and validates response shape only (never prints rows).
All mutating HTTP methods are intercepted and aborted, except the app's explicit
POST /api/auth login endpoint, which the automated suite never invokes.
"""
from __future__ import annotations

import base64
import json
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
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
SESSION_TOKEN_KEY = "aiw_access_token_v1"


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

    blocked_mutations: list[str] = []

    def read_only_route(route):
        request = route.request
        method = request.method.upper()
        parsed = urlparse(request.url)
        # Allow only explicit authentication POSTs; this test itself never submits
        # a login. Every other non-read request is blocked before network delivery.
        if method == "POST" and parsed.path == "/api/auth":
            route.continue_()
        elif method not in SAFE_METHODS:
            blocked_mutations.append(f"{method} {parsed.netloc}{parsed.path}")
            route.abort("blockedbyclient")
        else:
            route.continue_()

    context.route("**/*", read_only_route)
    page = context.new_page()
    yield page
    if blocked_mutations:
        print("Read-only guard blocked non-read requests: " + ", ".join(sorted(set(blocked_mutations))))
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

    # The nav marker alone is not auth proof. Test a protected read and return
    # only booleans/status, never any holding rows, symbols, prices, or thesis.
    summary = page.evaluate(
        """async () => {
          const token = window.sessionStorage.getItem("aiw_access_token_v1") || "";
          if (!token) return { tokenPresent: false };
          const response = await fetch("/api/portfolio?includeLots=true", {
            method: "GET",
            headers: { "Authorization": "Bearer " + token, "Accept": "application/json" },
            cache: "no-store"
          });
          const body = await response.json().catch(() => null);
          const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
          return {
            tokenPresent: true,
            status: response.status,
            isJson: Boolean(body && typeof body === "object" && !Array.isArray(body)),
            sourceIsSupabase: body?.source === "supabase",
            persistent: body?.persistent === true,
            holdingsArray: Array.isArray(body?.holdings),
            hasHoldings: holdings.length > 0,
            holdingsShapeOk: holdings.every(row =>
              row && typeof row.symbol === "string" &&
              Number.isFinite(Number(row.quantity)) &&
              Number.isFinite(Number(row.averageCost))
            )
          };
        }"""
    )
    assert summary.get("tokenPresent") is True, (
        "No access token was present in page sessionStorage; Playwright storage state does not restore sessionStorage"
    )
    assert summary.get("status") == 200, "Protected portfolio API did not accept the authenticated session"
    assert summary.get("isJson") is True, "Protected portfolio API did not return JSON"
    assert summary.get("sourceIsSupabase") is True and summary.get("persistent") is True, (
        "Protected portfolio API did not confirm the expected persistent source"
    )
    assert summary.get("holdingsArray") is True and summary.get("hasHoldings") is True, (
        "Protected portfolio API returned an empty or malformed holdings collection"
    )
    assert summary.get("holdingsShapeOk") is True, "Protected portfolio rows have an invalid shape"


@pytest.mark.skipif(
    not STORAGE_STATE_B64 or not AUTH_MARKER,
    reason="BLOCKED: authenticated route checks require the approved QA session secrets",
)
def test_authenticated_read_only_routes(page: Page):
    for path in SMOKE_PATHS:
        response = page.goto(f"{BASE_URL}/{path.lstrip('/')}", wait_until="domcontentloaded", timeout=60_000)
        assert response is not None and response.status < 400, f"Route failed: {path}"
        expect(page.locator(AUTH_MARKER).first).to_be_visible(timeout=20_000)
