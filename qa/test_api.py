from __future__ import annotations

import json
import math
import os

import httpx
import pytest

def _headers() -> dict[str, str]:
    raw = os.getenv("QA_HEADERS_JSON", "").strip()
    if not raw:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("QA_HEADERS_JSON must be a JSON object")
    return {str(k): str(v) for k, v in value.items()}

@pytest.fixture
def client():
    with httpx.Client(
        base_url=os.getenv("QA_BASE_URL", "https://ai-infra-watch-theta.vercel.app").rstrip("/"),
        headers=_headers(), follow_redirects=True, timeout=30.0
    ) as value:
        yield value

def _json(response: httpx.Response) -> dict:
    try:
        body = response.json()
    except ValueError:
        pytest.fail(f"Expected JSON from {response.url}, got HTTP {response.status_code}: {response.text[:300]}")
    assert isinstance(body, dict)
    return body

def test_root_is_reachable(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "AI INFRA WATCH" in response.text.upper()

def test_quote_api_contract(client):
    response = client.get("/api/quote", params={"symbol": "NVDA"})
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    quote = body.get("quote") if isinstance(body.get("quote"), dict) else body
    assert math.isfinite(float(quote["price"]))
    assert math.isfinite(float(quote["changePct"]))

def test_history_api_contract_and_payload(client):
    response = client.get("/api/company-scale", params={"action":"history","symbol":"NVDA","range":"5y"})
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    points = body.get("points")
    assert isinstance(points, list) and len(points) > 100
    assert isinstance(points[0]["date"], str) and float(points[0]["price"]) > 0
    assert isinstance(points[-1]["date"], str) and float(points[-1]["price"]) > 0

def test_milestones_api_contract(client):
    response = client.get("/api/company-scale", params={"action":"milestones","symbol":"NVDA","limit":12})
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    assert body.get("symbol") == "NVDA"
    assert isinstance(body.get("events"), list)

def test_portfolio_api_contract(client):
    response = client.get("/api/portfolio")
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    assert isinstance(body.get("holdings"), list)
    assert len(body["holdings"]) >= 1

@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("QA_HEADERS_JSON"), reason="protected Vercel API requires QA_HEADERS_JSON")
def test_forecast_verification_api_contract(client):
    response = client.get("/api/forecast-verification")
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    assert isinstance(body.get("forecasts"), list)
    assert isinstance(body.get("analytics"), dict)
    assert "byTickerHorizon" in body["analytics"]
    assert "byScenario" in body["analytics"]
    assert "byModel" in body["analytics"]

@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("QA_HEADERS_JSON"), reason="protected Vercel API requires QA_HEADERS_JSON")
def test_ai_quality_api_contract(client):
    response = client.get("/api/ai-quality", params={"limit":2})
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    assert isinstance(body.get("runs"), list)
    assert isinstance(body.get("analytics"), dict)

@pytest.mark.integration
@pytest.mark.skipif(not os.getenv("QA_HEADERS_JSON"), reason="protected Vercel API requires QA_HEADERS_JSON")
def test_autonomous_probe_contract(client):
    response = client.get("/api/agent-ask", params={"probe_mcp":"true"})
    assert response.status_code == 200, response.text[:500]
    body = _json(response)
    assert body.get("ok") is True or body.get("status") in {"ok", "degraded"}
