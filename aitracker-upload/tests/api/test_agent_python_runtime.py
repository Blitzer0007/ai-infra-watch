from __future__ import annotations

import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient


def _load_agent_api():
    path = Path(__file__).resolve().parents[3] / "api" / "agent-python.py"
    spec = importlib.util.spec_from_file_location("agent_python_runtime", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_agent_python_entrypoint_imports():
    module = _load_agent_api()
    assert hasattr(module, "app")


def test_agent_python_requires_the_configured_bearer_token(monkeypatch):
    module = _load_agent_api()
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(module.settings, "AGENT_API_TOKEN", "test-token")
    client = TestClient(module.app)

    assert client.get("/api/agent-python").status_code == 401
    assert client.get(
        "/api/agent-python",
        headers={"Authorization": "Bearer wrong-token"},
    ).status_code == 403
    assert client.get(
        "/api/agent-python",
        headers={"Authorization": "Bearer test-token"},
    ).status_code == 200
    assert client.post(
        "/api/agent-python",
        json={"question": "quote NVDA"},
    ).status_code == 401


def test_agent_python_fails_closed_when_deployed_without_agent_token(monkeypatch):
    module = _load_agent_api()
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(module.settings, "AGENT_API_TOKEN", "")
    response = TestClient(module.app).get("/api/agent-python")

    assert response.status_code == 503
    assert response.json()["detail"] == "Agent API authentication is not configured"


def test_agent_python_local_mode_can_run_without_internal_token(monkeypatch):
    module = _load_agent_api()
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(module.settings, "AGENT_API_TOKEN", "")
    response = TestClient(module.app).get("/api/agent-python")

    assert response.status_code == 200


def test_agent_python_runs_fixture_backed_mcp_research_end_to_end(monkeypatch):
    from app.mcp_client.inprocess import InProcessMCPToolbox

    module = _load_agent_api()
    monkeypatch.delenv("VERCEL", raising=False)
    monkeypatch.setattr(module.settings, "AGENT_API_TOKEN", "test-token")
    monkeypatch.setattr(module.settings, "LLM_PROVIDER", "stub")
    monkeypatch.setattr(module.settings, "STUB_MODE", True)
    monkeypatch.setattr(module.settings, "JEV_ENABLED", False)
    monkeypatch.setattr(module.settings, "JEV_API_KEY", "")
    monkeypatch.setattr(module, "get_toolbox", lambda: InProcessMCPToolbox(live=False))

    response = TestClient(module.app).post(
        "/api/agent-python",
        headers={"Authorization": "Bearer test-token"},
        json={"question": "What is the current quote for NVDA?"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "autonomous-mcp"
    assert body["ok"] is True
    assert any(call["tool"] == "stocks.get_quote" and call["ok"] for call in body["calls"])
    assert any(step["kind"] == "tool" for step in body["trajectory"])
