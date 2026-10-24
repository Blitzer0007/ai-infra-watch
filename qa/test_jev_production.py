from __future__ import annotations

import json
import os
from urllib.parse import urlsplit

import httpx
import pytest


def _has_auth_headers() -> bool:
    # The app's protected JEV APIs require an Authorization header. Browser
    # storage state does not restore the app's sessionStorage bearer token.
    return bool(os.getenv("QA_HEADERS_JSON", "").strip())


def _headers() -> dict[str, str]:
    raw = os.getenv("QA_HEADERS_JSON", "").strip()
    if not raw:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("QA_HEADERS_JSON must be a JSON object")
    return {str(key): str(item) for key, item in value.items()}


@pytest.mark.integration
@pytest.mark.skipif(not _has_auth_headers(), reason="authenticated JEV API smoke requires QA_HEADERS_JSON")
def test_jev_read_only_api_contracts():
    """Exercise authenticated JEV read paths only; never create or mutate a paper proposal."""
    base_url = (os.getenv("QA_BASE_URL") or "https://ai-infra-watch-theta.vercel.app").rstrip("/")
    with httpx.Client(base_url=base_url, headers=_headers(), follow_redirects=True, timeout=30.0) as client:
        proposals = client.get("/api/jev-lab", params={"limit": 5})
        assert proposals.status_code == 200, f"/api/jev-lab returned HTTP {proposals.status_code}"
        proposal_body = proposals.json()
        assert proposal_body.get("ok") is True
        assert isinstance(proposal_body.get("proposals"), list)

        history = client.get(
            "/api/jev-lab-history",
            params={"range": "1y", "symbols": "MSFT,SPY,QQQ"},
        )
        assert history.status_code == 200, f"/api/jev-lab-history returned HTTP {history.status_code}"
        history_body = history.json()
        assert isinstance(history_body.get("results"), list)
        assert {row.get("symbol") for row in history_body["results"]} == {"MSFT", "SPY", "QQQ"}
        assert history_body.get("availabilityAssumption")
        assert history_body.get("purpose") == "coverage_check_only"


@pytest.mark.integration
@pytest.mark.skipif(not _has_auth_headers(), reason="authenticated JEV UI smoke requires QA_HEADERS_JSON")
def test_jev_production_ui_loads_without_mutating_paper_ledger(page):
    """Open the actual JEV route with auth headers and assert this smoke remains read-only."""
    api_responses: list[tuple[str, int]] = []
    mutating_requests: list[str] = []

    def capture_response(response):
        if "/api/jev-lab" in response.url or "/api/jev-lab-history" in response.url:
            api_responses.append((urlsplit(response.url).path, response.status))

    def read_only_guard(route):
        request = route.request
        method = request.method.upper()
        # The access-token verification endpoint is read-only with respect to
        # portfolio/paper-ledger state. Allow the UI's normal unlock POST so the
        # browser can establish its sessionStorage token; continue blocking all
        # other non-read requests before they can reach production.
        is_auth_verification = request.url.split("?", 1)[0].rstrip("/").endswith("/api/auth")
        if method not in {"GET", "HEAD", "OPTIONS"} and not (method == "POST" and is_auth_verification):
            if "/api/jev-lab" in request.url or "/api/jev-lab-history" in request.url:
                mutating_requests.append(method + " " + urlsplit(request.url).path)
            route.abort("blockedbyclient")
            return
        route.continue_()

    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    page.on("response", capture_response)
    page.route("**/*", read_only_guard)
    response = page.goto("/jev-lab", wait_until="domcontentloaded", timeout=60000)
    # The server-side bearer header authenticates direct API tests, but the SPA's
    # private-dashboard gate requires its normal browser unlock flow. Reuse the
    # token in memory and submit it through the UI; never print or persist it.
    body_text = page.locator("body").inner_text(timeout=10000)
    if "Enter your private access token" in body_text:
        headers = _headers()
        authorization = next((value for key, value in headers.items() if key.lower() == "authorization"), "")
        token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
        assert token, "QA_HEADERS_JSON must include Authorization: Bearer <token> for browser unlock"
        token_input = page.locator('input[type="password"], input[autocomplete="current-password"], input').first
        token_input.fill(token)
        unlock = page.get_by_role("button", name="UNLOCK DASHBOARD", exact=False)
        unlock.click()
    try:
        page.get_by_text("JEV Autonomous Portfolio Lab", exact=False).first.wait_for(state="visible", timeout=30000)
    except Exception:
        # CI logs may be publicly visible: emit status/counts only, never dashboard text,
        # complete URLs, console messages, or page-error messages.
        print(f"JEV smoke diagnostic: final_path={urlsplit(page.url).path!r}")
        print(f"JEV smoke diagnostic: response_status={response.status if response else None}")
        print(f"JEV smoke diagnostic: jev_api_statuses={[status for _, status in api_responses]!r}")
        print(f"JEV smoke diagnostic: console_error_count={len(console_errors)}")
        print(f"JEV smoke diagnostic: page_error_count={len(page_errors)}")
        raise
    page.get_by_text("PAPER ONLY", exact=True).wait_for(state="visible", timeout=30000)
    page.get_by_text("MANUAL APPROVAL", exact=True).wait_for(state="visible", timeout=30000)

    assert not mutating_requests, f"Read-only smoke unexpectedly attempted writes to these API paths: {[request for request in mutating_requests]!r}"
    # The direct API test above verifies the authenticated proposal/history contracts.
    # The UI can render its read-only shell without eagerly issuing those requests in
    # every deployment; do not fail solely because this build deferred the fetch.
    failures = [(path, status) for path, status in api_responses if status >= 400]
    assert not failures, f"JEV read endpoints returned errors by path/status: {failures}"
