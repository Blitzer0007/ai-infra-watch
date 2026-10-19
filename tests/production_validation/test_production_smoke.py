"""Read-only production smoke tests.

Authenticated UI checks require a cookie/local-storage Playwright storage state,
a separately exported sessionStorage map (sessionStorage is not included by
Playwright's storage_state), and an authenticated-shell selector. The protected
portfolio API response is the actual authorization/data-shape assertion.
Every non-read HTTP method is intercepted and aborted before reaching the network.
Never commit or print credentials, storage state, or private portfolio rows.
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
SESSION_STORAGE_B64 = os.getenv("PROD_SESSION_STORAGE_B64", "").strip()
AUTH_MARKER = os.getenv("PROD_AUTHENTICATED_MARKER", "").strip()
SMOKE_PATHS = [
    path.strip()
    for path in os.getenv("PROD_SMOKE_PATHS", "/").split(",")
    if path.strip()
]
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
SESSION_TOKEN_KEY = "aiw_access_token_v1"


def _decode_session_storage() -> dict[str, str]:
    if not SESSION_STORAGE_B64:
        return {}
    try:
        value = json.loads(base64.b64decode(SESSION_STORAGE_B64, validate=True).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError("PROD_SESSION_STORAGE_B64 must be base64-encoded UTF-8 JSON") from exc
    if not isinstance(value, dict) or not all(
        isinstance(key, str) and isinstance(item, str) for key, item in value.items()
    ):
        raise RuntimeError("PROD_SESSION_STORAGE_B64 must encode a string-to-string JSON object")
    if not value.get(SESSION_TOKEN_KEY):
        raise RuntimeError(f"PROD_SESSION_STORAGE_B64 must contain {SESSION_TOKEN_KEY}")
    return value


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
    # Guard every origin, not just the dashboard host: no POST/PUT/PATCH/DELETE
    # can leave the browser during this release check. This blocks automatic
    # alert-config sync, scorecard writes, and any accidental notification relay.
    def read_only_route(route):
        request = route.request
        if request.method.upper() not in SAFE_METHODS:
            parsed = urlparse(request.url)
            blocked_mutations.append(f"{request.method.upper()} {parsed.netloc}{parsed.path}")
            route.abort("blockedbyclient")
        else:
            route.continue_()

    context.route("**/*", read_only_route)

    session_values = _decode_session_storage()
    if session_values:
        origin = f"{urlparse(BASE_URL).scheme}://{urlparse(BASE_URL).netloc}"
        # Populate only this origin, before app scripts run. Do not log values.
        context.add_init_script(
            script=(
                f"if (window.location.origin === {json.dumps(origin)}) {{"
                f"const entries = {json.dumps(session_values, separators=(',', ':'))};"
                "for (const [key, value] of Object.entries(entries)) {"
                "window.sessionStorage.setItem(key, value);"
                "}}"
            )
        )

    page = context.new_page()
    yield page
    if blocked_mutations:
        # Report method + route only; never include body or headers.
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
    not STORAGE_STATE_B64 or not SESSION_STORAGE_B64 or not AUTH_MARKER,
    reason=(
        "BLOCKED: configure secure PROD_STORAGE_STATE_B64, "
        "PROD_SESSION_STORAGE_B64, and PROD_AUTHENTICATED_MARKER secrets"
    ),
)
def test_authenticated_production_session(page: Page):
    response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60_000)
    assert response is not None and response.status < 400
    expect(page.locator(AUTH_MARKER).first).to_be_visible(timeout=20_000)

    # The app stores its bearer token in sessionStorage, which standard Playwright
    # storage state does not restore. Verify a real protected GET without returning
    # any holding rows, symbols, prices, or thesis data to the test log.
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
    assert summary.get("tokenPresent") is True, "Approved session token was not restored to sessionStorage"
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
    not STORAGE_STATE_B64 or not SESSION_STORAGE_B64 or not AUTH_MARKER,
    reason="BLOCKED: authenticated route checks require the approved QA session secrets",
)
def test_authenticated_read_only_routes(page: Page):
    for path in SMOKE_PATHS:
        response = page.goto(f"{BASE_URL}/{path.lstrip('/')}", wait_until="domcontentloaded", timeout=60_000)
        assert response is not None and response.status < 400, f"Route failed: {path}"
        expect(page.locator(AUTH_MARKER).first).to_be_visible(timeout=20_000)
