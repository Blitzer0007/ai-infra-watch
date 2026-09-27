"""/api/ask endpoint tests — Phase 5 wiring (in-process supervisor over HTTP).

Hermetic: the endpoint builds a real `SupervisorAgent()` whose Market/Filings
specialists run IN-PROCESS over the fixture services + stub LLM (no MCP
subprocess, no network). We drive it through FastAPI's TestClient so the whole
request path — validation, routing, response shaping — is exercised exactly as
a browser would hit it, but deterministically.

What's asserted here is the WIRING and the response CONTRACT, not answer
quality (that's graded under `-m live`):
  1. shape        — 200 + the documented keys; nested market/filings sub-results
  2. routing      — a market-cue question reaches market; a filings-cue question
                    reaches filings; a cross-domain question fans out to both
  3. trajectory   — the orchestration node-path is surfaced for the UI
  4. validation   — a blank/empty question is a 4xx, never a 500
  5. GET parity   — GET ?q= returns the same contract as POST
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. shape / contract
# ---------------------------------------------------------------------------
def test_ask_returns_documented_contract(client):
    r = client.post("/api/ask", json={"question": "How did the watchlist move today?"})
    assert r.status_code == 200
    body = r.json()
    # Top-level contract the frontend depends on.
    for key in ("question", "route", "ok", "degraded", "hallucination_flagged",
                "summary", "error", "trajectory", "market", "filings"):
        assert key in body
    assert body["question"] == "How did the watchlist move today?"
    assert isinstance(body["trajectory"], list)
    assert isinstance(body["ok"], bool)
    assert isinstance(body["degraded"], bool)
    assert isinstance(body["hallucination_flagged"], bool)


# ---------------------------------------------------------------------------
# 2. routing — the classifier's decision reaches the right specialist
# ---------------------------------------------------------------------------
def test_market_question_routes_to_market(client):
    r = client.post("/api/ask", json={"question": "What is the NVDA stock price today?"})
    body = r.json()
    assert body["route"] == "market"
    assert body["market"] is not None          # the market branch ran
    assert body["filings"] is None             # filings branch did not
    assert "market" in body["trajectory"]


def test_filings_question_routes_to_filings(client):
    r = client.post("/api/ask", json={"question": "What did the 10-K say about revenue growth?"})
    body = r.json()
    assert body["route"] == "filings"
    assert body["filings"] is not None
    assert body["market"] is None
    assert "filings" in body["trajectory"]


def test_cross_domain_question_fans_out_to_both(client):
    r = client.post(
        "/api/ask",
        json={"question": "How did the stock move and what did the filing say about revenue?"},
    )
    body = r.json()
    assert body["route"] == "both"
    # Both specialist sub-results are present (parallel fan-out merged).
    assert body["market"] is not None
    assert body["filings"] is not None
    assert "market" in body["trajectory"] and "filings" in body["trajectory"]


# ---------------------------------------------------------------------------
# 3. nested sub-result shape
# ---------------------------------------------------------------------------
def test_market_subresult_has_expected_keys(client):
    r = client.post("/api/ask", json={"question": "watchlist quote today"})
    market = r.json()["market"]
    for key in ("ok", "symbols", "summary", "insights", "groundedness", "error", "trajectory"):
        assert key in market
    assert isinstance(market["symbols"], list)


def test_filings_subresult_has_expected_keys(client):
    r = client.post("/api/ask", json={"question": "revenue guidance in the filing"})
    filings = r.json()["filings"]
    for key in ("ok", "routed", "answer", "citations", "groundedness",
                "corrective_fallback", "error", "trajectory"):
        assert key in filings


# ---------------------------------------------------------------------------
# Phase 6 — hallucination flag surfaces alongside degraded
# ---------------------------------------------------------------------------
def test_clean_market_route_is_not_flagged(client):
    # The deterministic stub market answer is grounded in its data facts, so a
    # clean demo run must not raise the hallucination flag.
    body = client.post("/api/ask", json={"question": "How did the watchlist move today?"}).json()
    assert body["hallucination_flagged"] is False
    g = body["market"]["groundedness"]
    assert g is not None
    assert g["grounded"] is True
    assert g["flagged"] is False


def test_hallucination_flag_consistent_with_branch_reports(client):
    # The top-level flag must equal: some engaged branch has a groundedness
    # report whose `flagged` is true. Reconstruct from the response so the
    # invariant holds regardless of what the stub happens to produce.
    body = client.post(
        "/api/ask",
        json={"question": "How did the stock move and what did the filing say about revenue?"},
    ).json()
    branch_flagged = False
    for branch in (body["market"], body["filings"]):
        g = branch and branch.get("groundedness")
        if g and g.get("flagged"):
            branch_flagged = True
    assert body["hallucination_flagged"] == branch_flagged


# ---------------------------------------------------------------------------
# degraded flag — clean vs usable-but-partial, surfaced for the UI
# ---------------------------------------------------------------------------
def test_clean_market_route_is_not_degraded(client):
    # A no-LLM market question runs cleanly end-to-end, so it is ok and NOT
    # degraded (nothing failed).
    body = client.post("/api/ask", json={"question": "How did the watchlist move today?"}).json()
    assert body["ok"] is True
    assert body["degraded"] is False


def test_degraded_flag_is_consistent_with_subresults(client):
    # `degraded` must equal: run is ok() AND some engaged branch didn't succeed
    # (a stored sub-result with ok False, or a recorded error). Reconstructing it
    # from the response keeps this robust to whether a stub fixture happens to
    # exist for the filings answer — we assert the INVARIANT, not a fixed value.
    body = client.post(
        "/api/ask",
        json={"question": "How did the stock move and what did the filing say about revenue?"},
    ).json()
    m, f = body["market"], body["filings"]
    branch_failed = (m is not None and not m["ok"]) or (f is not None and not f["ok"]) or bool(body["error"])
    expected = bool(body["ok"] and branch_failed)
    assert body["degraded"] == expected
    # A total failure is never "degraded".
    if not body["ok"]:
        assert body["degraded"] is False


# ---------------------------------------------------------------------------
# 4. validation — a malformed question is a clean 4xx, never a 500
# ---------------------------------------------------------------------------
def test_blank_question_is_rejected(client):
    # Whitespace-only body passes min_length but fails the strip() guard -> 422.
    r = client.post("/api/ask", json={"question": "   "})
    assert r.status_code == 422


def test_empty_string_is_rejected_by_schema(client):
    # min_length=1 makes an empty string a pydantic validation error (422).
    r = client.post("/api/ask", json={"question": ""})
    assert r.status_code == 422


def test_missing_question_is_rejected(client):
    r = client.post("/api/ask", json={})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 5. GET parity
# ---------------------------------------------------------------------------
def test_get_ask_matches_post_contract(client):
    r = client.get("/api/ask", params={"q": "How did the watchlist move today?"})
    assert r.status_code == 200
    body = r.json()
    assert body["route"] == "market"
    assert body["question"] == "How did the watchlist move today?"


def test_get_ask_requires_q(client):
    assert client.get("/api/ask").status_code == 422


# ---------------------------------------------------------------------------
# root advertises the new route
# ---------------------------------------------------------------------------
def test_root_lists_ask_route(client):
    assert client.get("/").json().get("ask") == "/api/ask"
