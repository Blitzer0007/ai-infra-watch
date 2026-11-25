"""Authenticated development HTTP only; fake models and fictional declarations."""
import copy
import hashlib
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
import pytest

from app.agents import council_http
from app.agents.research_role_agent import FictionalResearchRoleModel
from app.eval.council_benchmark import load_suite


def payload():
    value = copy.deepcopy(load_suite()[0].cases[0].request)
    value["mode"] = "research-v2"
    return value


HEADERS = {"Authorization": "Bearer fictional-research-backend", "Content-Type": "application/json"}


@pytest.fixture
def endpoint(monkeypatch):
    for name in ("VERCEL", "NODE_ENV", "VERCEL_ENV"): monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("COUNCIL_DEV_ENABLED", "true")
    monkeypatch.setenv("RESEARCH_ROLE_HTTP_DEV_ENABLED", "true")
    state = {"configured_token": "fictional-research-backend", "factory_calls": 0}
    def model():
        state["factory_calls"] += 1
        return FictionalResearchRoleModel()
    monkeypatch.setattr(council_http, "research_model", model)
    app = FastAPI()
    def auth(header):
        if header != "Bearer fictional-research-backend": raise HTTPException(status_code=401)
    @app.api_route("/review", methods=["POST", "GET"])
    async def route(request: Request):
        return await council_http.council_http(request, auth, state["configured_token"])
    with TestClient(app) as client:
        yield client, state


def test_http_rechecks_original_bytes_and_returns_only_a_bounded_role_envelope(endpoint):
    client, state = endpoint
    value = payload()
    value["packet"]["evidence"][0]["value"] = 0.000001
    raw = json.dumps(value, separators=(",", ":")).encode()
    assert b'1e-06' in raw  # No parsing/re-encoding may change the request digest.
    response = client.post("/review", content=raw, headers=HEADERS)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    body = response.json()
    assert set(body) == {"contract_version", "admission", "result"}
    assert body["contract_version"] == "research-role-response-v1"
    assert body["admission"]["request_sha256"] == body["result"]["request_sha256"] == hashlib.sha256(raw).hexdigest()
    assert body["result"]["status"] == "complete" and body["result"]["mode"] == "fixture"
    assert body["result"]["usage"]["provider_requests"] == 0 and state["factory_calls"] == 1
    assert '"inputs"' not in json.dumps(body) and '"cik"' not in json.dumps(body)


@pytest.mark.parametrize("change,status", [("anonymous",401),("disabled",404),("production",404),("vercel",404),("unconfigured-access",503),("unconfigured-model",503),("method",405),("content-type",415),("malformed",400),("oversized",413)])
def test_guards_fail_before_any_provider_work(endpoint, monkeypatch, change, status):
    client, state = endpoint
    headers = dict(HEADERS)
    raw = json.dumps(payload()).encode()
    method = "POST"
    if change == "anonymous": headers.pop("Authorization")
    if change == "disabled": monkeypatch.delenv("RESEARCH_ROLE_HTTP_DEV_ENABLED")
    if change == "production": monkeypatch.setenv("NODE_ENV", "production")
    if change == "vercel": monkeypatch.setenv("VERCEL", "1")
    if change == "unconfigured-access": state["configured_token"] = ""
    if change == "unconfigured-model": monkeypatch.setattr(council_http, "research_model", lambda: None)
    if change == "method": method = "GET"
    if change == "content-type": headers["Content-Type"] = "text/plain"
    if change == "malformed": raw = b'{"mode":"research-v2","packet":{}}'
    if change == "oversized": raw = b'x' * 32769
    response = client.request(method, "/review", content=raw, headers=headers)
    assert response.status_code == status and state["factory_calls"] == 0


def test_shared_slot_rejects_concurrent_role_run_before_factory(endpoint):
    client, state = endpoint
    assert council_http._slot.acquire(blocking=False)
    try:
        assert client.post("/review", json=payload(), headers=HEADERS).status_code == 429
        assert state["factory_calls"] == 0
    finally:
        council_http._slot.release()


def test_opt_in_does_not_change_model_free_admission(endpoint, monkeypatch):
    client, state = endpoint
    monkeypatch.delenv("RESEARCH_ROLE_HTTP_DEV_ENABLED")
    value = payload(); value["mode"] = "admission-v2"
    response = client.post("/review", json=value, headers=HEADERS)
    assert response.status_code == 200 and response.json()["contract_version"] == "council-admission-v1"
    assert state["factory_calls"] == 0


def test_cross_language_fixture_remains_exact_for_every_case():
    fixture = Path(__file__).resolve().parents[2] / "data/research/research-role-response.fictional.json"
    by_id = {case.case_id: case for case in load_suite()[0].cases}
    for row in json.loads(fixture.read_text())["cases"]:
        value = copy.deepcopy(by_id[row["case_id"]].request); value["mode"] = "research-v2"
        raw = json.dumps(value, separators=(",", ":"), allow_nan=False).encode()
        assert council_http.research_response(raw, FictionalResearchRoleModel()) == row["response"]
