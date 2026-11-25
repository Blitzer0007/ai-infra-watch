"""Fictional protocol and mocked providers only; never live financial acceptance."""
import json
import os
from pathlib import Path
import subprocess
import sys

import httpx
import pytest

from app.agents.council_model import NVIDIA_FIRST_MODELS, NvidiaCouncilModel, RoleRoutedCouncilModel
from app.agents.research_role_agent import (
    FAMILIES, PROVIDER_ROLES, FictionalResearchRoleModel, ResearchRoleAgent,
    ResearchRoleModelAdapter, ResearchRoleStopped,
)
from app.agents.research_role_review import AUTHORITY, research_role_review
from app.eval.council_benchmark import load_suite
from app.eval.research_role_probe import run_probe, render_probe


def case(name="growth-with-cash-burn"):
    return next(value for value in load_suite()[0].cases if value.case_id == name)


class Script(FictionalResearchRoleModel):
    def __init__(self, mutate=None):
        self.mutate, self.calls = mutate, []

    def complete(self, role, messages, **budget):
        self.calls.append((role, messages, budget))
        step = json.loads(super().complete(role, messages, **budget))
        return json.dumps(self.mutate(role, messages, step) if self.mutate else step)


def test_eight_cases_finish_in_six_calls_and_three_loaded_tools_without_authority():
    for value in load_suite()[0].cases:
        model = Script()
        original = value.raw
        result = ResearchRoleAgent(model).run(original)
        assert result["status"] == "complete"
        assert result["usage"]["model_calls"] == 6 and result["usage"]["tool_calls"] == 3
        assert result["usage"]["provider_requests"] == 0
        assert result["scope"] == "single-symbol-frozen-snapshot" and result["selection_is_exhaustive"] is False
        assert value.raw == original and all(result[key] is False for key in AUTHORITY)
        baseline = research_role_review(original)
        for role, output in result["roles"].items():
            assert 1 <= len(output["review_codes"]) <= 3 and len(output["evidence_ids"]) <= 4
            assert set(output["review_codes"]) <= set(baseline["roles"][role]["review_codes"])
            assert set(output["evidence_ids"]) <= set(baseline["roles"][role]["evidence_ids"])
        for role, messages, budget in model.calls:
            context = json.loads(messages[1]["content"])
            assert all(row["family"] in FAMILIES[role] and "value" not in row for row in context["catalog"])
            assert ("previous_roles" in context) is (role == "daily")
            assert all(key not in "\n".join(m["content"] for m in messages) for key in ['"inputs"', '"cik"', '"accession"'])
            assert 0 < budget["timeout_seconds"] <= 6 and budget["max_output_tokens"] == 600


@pytest.mark.parametrize("change", ["web", "wrong-family", "duplicate-inspection", "no-tool", "tool-loop", "uninspected", "unknown-code", "extra-prose", "duplicate-code", "too-many-codes", "wrong-metric", "outside-citation"])
def test_invalid_tool_or_unsupported_selection_stops_without_retry_or_private_prose(change):
    def mutate(role, messages, step):
        if role != "company": return step
        first = len(messages) == 2
        if first:
            if change == "web": return {"action": "web", "url": "https://private.invalid"}
            if change == "wrong-family": return {"action": "inspect", "evidence_ids": ["calendar:event-days"]}
            if change == "duplicate-inspection": step["evidence_ids"] *= 2
            if change == "no-tool": return {"action": "review", "review_codes": ["VERIFY_ORIGINAL_FILINGS"], "evidence_ids": []}
            if change == "uninspected": return {"action": "coverage", "families": ["financial"]}
        else:
            if change == "tool-loop": return {"action": "coverage", "families": ["financial"]}
            if change == "uninspected": return {"action": "review", "review_codes": ["REVIEW_NEGATIVE_CASH_FLOW"], "evidence_ids": ["sec:free_cash_flow_usd"]}
            if change == "unknown-code": step["review_codes"] = ["BUY_NOW"]
            if change == "extra-prose": step["summary"] = "fictional-private-body predicts guaranteed returns"
            if change == "duplicate-code": step["review_codes"] = ["VERIFY_ORIGINAL_FILINGS"] * 2
            if change == "too-many-codes": step["review_codes"] += ["REVIEW_LEVERAGE_CONTEXT"]
            if change == "wrong-metric": return {"action": "review", "review_codes": ["REVIEW_NEGATIVE_CASH_FLOW"], "evidence_ids": ["sec:revenue_growth_pct"]}
            if change == "outside-citation": step["evidence_ids"] = ["outside"]
        return step
    model = Script(mutate)
    result = ResearchRoleAgent(model).run(case().raw)
    assert result["status"] in ("failed", "partial") and len(model.calls) <= 2
    assert not result["roles"] and result["usage"]["tool_calls"] <= 1
    assert "fictional-private-body" not in json.dumps(result)
    assert all(result[key] is False for key in AUTHORITY)


def test_ineligible_filing_values_cannot_be_cited_even_after_inspection():
    def mutate(role, messages, step):
        if role == "company" and len(messages) > 2: step["evidence_ids"] = ["sec:free_cash_flow_usd"]
        return step
    result = ResearchRoleAgent(Script(mutate)).run(case("missing-filing-lineage").raw)
    assert result["status"] == "failed" and not result["roles"]
    normal = ResearchRoleAgent(FictionalResearchRoleModel()).run(case("same-day-filing-uncertainty").raw)
    assert normal["roles"]["company"]["evidence_ids"] == [] and normal["input_status"] == "needs-data"


@pytest.mark.parametrize("raw", ['{"action":"inspect","action":"web"}', "not JSON", "x" * 8193])
def test_malformed_duplicate_or_oversized_model_output_is_not_a_prose_fallback(raw):
    class Bad(FictionalResearchRoleModel):
        def complete(self, *_args, **_kwargs): return raw
    result = ResearchRoleAgent(Bad()).run(case().raw)
    assert result["status"] == "failed" and result["usage"]["model_calls"] == 1


@pytest.mark.parametrize("ticks", [[0, 41], [10, 9], [0, 0, 41]])
def test_time_budget_and_clock_rollback_fail_closed(ticks):
    clock = iter(ticks)
    result = ResearchRoleAgent(FictionalResearchRoleModel(), clock=lambda: next(clock)).run(case().raw)
    assert result["status"] == "partial" and result["termination_reason"] == "budget"


def test_exceptions_are_redacted_and_a_runner_cannot_be_reused():
    class Broken(FictionalResearchRoleModel):
        def complete(self, *_args, **_kwargs): raise ResearchRoleStopped("fictional-private-body")
    result = ResearchRoleAgent(Broken()).run(case().raw)
    assert result["termination_reason"] == "budget" and "fictional-private-body" not in json.dumps(result)
    runner = ResearchRoleAgent(FictionalResearchRoleModel())
    runner.run(case().raw)
    with pytest.raises(ValueError, match="single-use"): runner.run(case().raw)


def test_prompt_budget_is_checked_before_any_model_call(monkeypatch):
    monkeypatch.setattr("app.agents.research_role_agent.MAX_PROMPT_CHARS", 10)
    model = Script()
    result = ResearchRoleAgent(model).run(case().raw)
    assert result["status"] == "partial" and result["termination_reason"] == "budget"
    assert not model.calls and result["usage"]["model_calls"] == 0


def test_offline_probe_never_reads_provider_configuration_or_creates_http_clients(monkeypatch):
    def deny(*_args, **_kwargs): pytest.fail("Offline probe must not contact/configure a provider")
    monkeypatch.setattr("app.eval.research_role_probe.configured_research_role_model", deny)
    monkeypatch.setattr(httpx, "Client", deny)
    report = run_probe()
    assert report["status"] == "offline-fixture" and report["telemetry"] is None
    assert report["agent"]["status"] == "complete" and report["financial_usefulness_established"] is False
    for kwargs in ({"live": True}, {"live": True, "case_id": "outside"}):
        with pytest.raises(ValueError): run_probe(**kwargs)
    text = render_probe(report)
    assert "provider attempts 0" in text and "not exhaustive" in text
    assert '"messages"' not in json.dumps(report)


def live_model(monkeypatch, calls, *, outage=False):
    for name in ("VERCEL", "VERCEL_ENV", "NODE_ENV"): monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("COUNCIL_DEV_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_LIVE_DEV_ENABLED", "true")
    inverse = {provider: role for role, provider in PROVIDER_ROLES.items()}
    routes = {}
    for provider_role, model_id in NVIDIA_FIRST_MODELS.items():
        def handle(request, provider_role=provider_role, model_id=model_id):
            calls.append((provider_role, request))
            if outage: return httpx.Response(429, json={"private": "fictional-private-provider-body"})
            payload = json.loads(request.content)
            content = FictionalResearchRoleModel().complete(inverse[provider_role], payload["messages"])
            return httpx.Response(200, json={"model": model_id, "choices": [{"message": {"content": content}}],
                                            "usage": {"prompt_tokens": 30, "completion_tokens": 20}})
        routes[provider_role] = NvidiaCouncilModel("fictional-private-development-key", model_id, transport=httpx.MockTransport(handle))
    model = ResearchRoleModelAdapter(RoleRoutedCouncilModel(routes))
    monkeypatch.setattr("app.eval.research_role_probe.configured_research_role_model", lambda: model)
    return model


def test_mocked_nvidia_trial_maps_distinct_models_and_preserves_six_call_budget(monkeypatch):
    calls = []
    model = live_model(monkeypatch, calls)
    report = run_probe(live=True, case_id="growth-with-cash-burn")
    assert report["status"] == "live-trial-complete" and len(calls) == 6
    assert {key: sum(role == key for role, _ in calls) for key in NVIDIA_FIRST_MODELS} == dict.fromkeys(NVIDIA_FIRST_MODELS, 2)
    assert report["agent"]["usage"]["provider_requests"] == 6
    assert report["telemetry"]["totals"]["reported_cost_usd"] is None
    assert report["telemetry"]["totals"]["input_tokens"] == 180
    for role, provider_role in PROVIDER_ROLES.items():
        route = report["telemetry"]["routes"][role]
        assert route["provider_role"] == provider_role and route["model"] == NVIDIA_FIRST_MODELS[provider_role]
    for provider_role, request in calls:
        assert str(request.url) == "https://integrate.api.nvidia.com/v1/chat/completions"
        assert b'"inputs"' not in request.content and b'"cik"' not in request.content
        assert json.loads(request.content)["model"] == NVIDIA_FIRST_MODELS[provider_role]
    text = json.dumps(report) + render_probe(report)
    assert "fictional-private-development-key" not in text and "unknown" in text
    with pytest.raises(ValueError, match="single-use"): ResearchRoleAgent(model).run(case().raw)
    with pytest.raises(ValueError, match="Fresh"): ResearchRoleModelAdapter(model.router)


def test_provider_outage_does_not_retry_or_return_error_bodies(monkeypatch):
    calls = []
    live_model(monkeypatch, calls, outage=True)
    report = run_probe(live=True, case_id="stale-market")
    assert report["status"] == "candidate-unavailable" and len(calls) == 1
    assert not report["agent"]["roles"]
    assert "fictional-private-provider-body" not in json.dumps(report)


def test_production_disable_is_rechecked_after_development_models_were_created(monkeypatch):
    calls = []
    live_model(monkeypatch, calls)
    monkeypatch.setenv("VERCEL", "1")
    report = run_probe(live=True, case_id="growth-with-cash-burn")
    assert report["status"] == "candidate-unavailable" and calls == []
    assert report["agent"]["usage"]["provider_requests"] == 0


@pytest.mark.parametrize("name,value", [("VERCEL", "1"), ("VERCEL_ENV", "production"), ("NODE_ENV", "production")])
def test_production_environment_cannot_create_live_research_roles(monkeypatch, name, value):
    monkeypatch.setenv(name, value)
    for flag in ("COUNCIL_DEV_ENABLED", "COUNCIL_LIVE_DEV_ENABLED", "COUNCIL_MULTI_MODEL_DEV_ENABLED"): monkeypatch.setenv(flag, "true")
    monkeypatch.setenv("COUNCIL_NVIDIA_API_KEY", "fictional-private-development-key")
    monkeypatch.setattr(httpx, "Client", lambda **_: pytest.fail("No production inference"))
    report = run_probe(live=True, case_id="growth-with-cash-burn")
    assert report["status"] == "development-configuration-unavailable" and report["agent"] is None


def test_cli_default_is_offline_and_missing_explicit_live_case_is_a_fixed_error():
    root = Path(__file__).resolve().parents[2]
    command = [sys.executable, str(root / "scripts/research_role_probe.py")]
    env = {"PATH": os.defpath, "PYTHONPATH": str(root)}
    result = subprocess.run(command, env=env, capture_output=True, text=True, check=True)
    assert json.loads(result.stdout)["status"] == "offline-fixture"
    missing = subprocess.run(command + ["--live"], env=env, capture_output=True, text=True)
    assert missing.returncode == 2 and json.loads(missing.stdout)["status"] == "research-role-probe-unavailable"
    assert not missing.stderr
