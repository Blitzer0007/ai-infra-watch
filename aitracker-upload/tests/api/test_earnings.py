"""/api/earnings endpoint tests — Phase 5 wiring (fixture EarningsService over HTTP).

Hermetic: the endpoint builds a real EarningsService in fixture mode (committed
earnings.json, no candle service, no network) and we drive it through FastAPI's
TestClient so the whole request path — validation, batching, response shaping —
is exercised exactly as the tracker page hits it, but deterministically.

Asserts the WIRING and the response CONTRACT, not data quality (that's -m live):
  1. shape        — 200 + documented keys; per-symbol past/upcoming/next split
  2. defaults     — no symbols -> the page scope (NBIS + DGXX)
  3. reaction     — past events carry price_reaction_pct + surprise_pct
  4. best-effort  — an unknown symbol lands in `missing`, not a 500
  5. total outage — every-symbol-unknown is a clean 422
  6. GET/POST parity + root advertises the route
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
def test_earnings_returns_documented_contract(client):
    r = client.get("/api/earnings", params={"symbols": "NBIS"})
    assert r.status_code == 200
    body = r.json()
    for key in ("symbols", "missing", "earnings"):
        assert key in body
    assert body["symbols"] == ["NBIS"]
    nbis = body["earnings"]["NBIS"]
    for key in ("symbol", "source", "past", "upcoming", "next"):
        assert key in nbis
    assert isinstance(nbis["past"], list) and nbis["past"]
    assert isinstance(nbis["upcoming"], list)


def test_past_event_has_expected_keys(client):
    body = client.get("/api/earnings", params={"symbols": "NBIS"}).json()
    event = body["earnings"]["NBIS"]["past"][0]
    for key in ("date", "when", "period", "hour", "eps_actual", "eps_estimate",
                "revenue_actual", "revenue_estimate", "surprise_pct", "price_reaction_pct"):
        assert key in event
    assert event["when"] == "past"


# ---------------------------------------------------------------------------
# 2. defaults — the Progress Tracker page scope
# ---------------------------------------------------------------------------
def test_default_symbols_are_page_scope(client):
    body = client.get("/api/earnings").json()
    assert set(body["symbols"]) == {"NBIS", "DGXX"}


def test_post_default_body_uses_page_scope(client):
    body = client.post("/api/earnings", json={}).json()
    assert set(body["symbols"]) == {"NBIS", "DGXX"}


# ---------------------------------------------------------------------------
# 3. reaction + surprise are surfaced for past events
# ---------------------------------------------------------------------------
def test_past_events_carry_reaction_and_surprise(client):
    body = client.get("/api/earnings", params={"symbols": "DGXX"}).json()
    past = body["earnings"]["DGXX"]["past"]
    assert any(e["price_reaction_pct"] is not None for e in past)
    assert any(e["surprise_pct"] is not None for e in past)


def test_next_event_is_upcoming_without_actual(client):
    body = client.get("/api/earnings", params={"symbols": "NBIS"}).json()
    nxt = body["earnings"]["NBIS"]["next"]
    assert nxt is not None
    assert nxt["when"] == "upcoming"
    assert nxt["eps_actual"] is None


# ---------------------------------------------------------------------------
# 4. best-effort — an unknown symbol is reported, not fatal
# ---------------------------------------------------------------------------
def test_unknown_symbol_lands_in_missing(client):
    body = client.get("/api/earnings", params={"symbols": "NBIS,ZZZZ"}).json()
    assert "NBIS" in body["earnings"]
    assert "ZZZZ" in body["missing"]


# ---------------------------------------------------------------------------
# 5. total outage / validation — clean 4xx, never a 500
# ---------------------------------------------------------------------------
def test_all_unknown_symbols_is_422(client):
    r = client.get("/api/earnings", params={"symbols": "ZZZZ,YYYY"})
    assert r.status_code == 422


def test_blank_symbols_is_422(client):
    # A symbols param that trims to nothing is a malformed request.
    r = client.get("/api/earnings", params={"symbols": " , "})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 6. GET/POST parity + root
# ---------------------------------------------------------------------------
def test_get_post_parity(client):
    g = client.get("/api/earnings", params={"symbols": "NBIS"}).json()
    p = client.post("/api/earnings", json={"symbols": ["NBIS"]}).json()
    assert g["symbols"] == p["symbols"]
    assert list(g["earnings"]) == list(p["earnings"])


def test_root_lists_earnings_route(client):
    assert client.get("/").json().get("earnings") == "/api/earnings"
