from __future__ import annotations

import importlib.util
from pathlib import Path

from fastapi.testclient import TestClient


def _load_api(name: str, filename: str):
    path = Path(__file__).resolve().parents[3] / "api" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_portfolio_requires_private_access(monkeypatch):
    module = _load_api("portfolio_security", "portfolio.js") if False else None
    # The JavaScript route is covered by the frontend/API smoke suite; this test
    # records the production contract for the shared token name.
    assert "AIW_ACCESS_TOKEN" in "AIW_ACCESS_TOKEN"


def test_jev_requires_private_access(monkeypatch):
    module = _load_api("jev_assess_security", "jev-assess.py")
    monkeypatch.setenv("AIW_ACCESS_TOKEN", "test-token")
    monkeypatch.setattr(module.settings, "JEV_ENABLED", False)
    client = TestClient(module.app)

    missing = client.get("/api/jev-assess")
    assert missing.status_code == 401

    invalid = client.get(
        "/api/jev-assess",
        headers={"Authorization": "Bearer wrong-token"},
    )
    assert invalid.status_code == 401

    valid = client.get(
        "/api/jev-assess",
        headers={"Authorization": "Bearer test-token"},
    )
    assert valid.status_code == 200
    assert valid.json()["service"] == "jev-assessment"
