from __future__ import annotations

from fastapi.testclient import TestClient

from app import main


def test_autonomous_endpoint_allows_local_mode(monkeypatch):
    monkeypatch.setattr(main.settings, "AGENT_API_TOKEN", "")
    monkeypatch.setattr(main, "_run_autonomous", lambda question: {"question": question})

    response = TestClient(main.app).get("/api/ask/autonomous?q=hello")
    assert response.status_code == 200
    assert response.json()["question"] == "hello"


def test_autonomous_endpoint_requires_bearer_token_when_configured(monkeypatch):
    monkeypatch.setattr(main.settings, "AGENT_API_TOKEN", "test-token")
    monkeypatch.setattr(main, "_run_autonomous", lambda question: {"question": question})

    client = TestClient(main.app)
    missing = client.get("/api/ask/autonomous?q=hello")
    assert missing.status_code == 401

    invalid = client.get(
        "/api/ask/autonomous?q=hello",
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert invalid.status_code == 403

    valid = client.get(
        "/api/ask/autonomous?q=hello",
        headers={"Authorization": "Bearer test-token"},
    )
    assert valid.status_code == 200
    assert valid.json()["question"] == "hello"
