from __future__ import annotations

import json
import os

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
        assert proposals.status_code == 200, proposals.text[:500]
        proposal_body = proposals.json()
        assert proposal_body.get("ok") is True
        assert isinstance(proposal_body.get("proposals"), list)

        history = client.get(
            "/api/jev-lab-history",
            params={"range": "1y", "symbols": "MSFT,SPY,QQQ"},
        )
        assert history.status_code == 200, history.text[:500]
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
            api_responses.append((response.url, response.status))

    def read_only_guard(route):
        request = route.request
        method = request.method.upper()
        if method not in {"GET", "HEAD", "OPTIONS"}:
            if "/api/jev-lab" in request.url or "/api/jev-lab-history" in request.url:
                mutating_requests.append(method + " " + request.url)
            # Block every non-read request before it can reach production. This
            # protects against unrelated startup effects as well as JEV writes.
            route.abort("blockedbyclient")
            return
        route.continue_()

    page.on("response", capture_response)
    page.route("**/*", read_only_guard)
    page.goto("/jev-lab", wait_until="domcontentloaded", timeout=60000)
    page.get_by_text("JEV Autonomous Portfolio Lab", exact=False).first.wait_for(state="visible", timeout=30000)
    page.get_by_text("PAPER ONLY", exact=True).wait_for(state="visible", timeout=30000)
    page.get_by_text("MANUAL APPROVAL", exact=True).wait_for(state="visible", timeout=30000)

    assert not mutating_requests, f"Read-only smoke unexpectedly attempted a write: {mutating_requests}"
    assert api_responses, "JEV UI did not call the authenticated proposal/history read endpoints"
    failures = [(url, status) for url, status in api_responses if status >= 400]
    assert not failures, f"JEV read endpoints returned errors: {failures}"
