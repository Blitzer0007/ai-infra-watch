"""Authored fictional labels, bounded comparisons and mocked NVIDIA only."""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys

import httpx
import pytest

from app.agents.council_model import NVIDIA_FIRST_MODELS, NvidiaCouncilModel, RoleRoutedCouncilModel
from app.agents.research_role_agent import FictionalResearchRoleModel, ResearchRoleAgent, ResearchRoleModelAdapter, PROVIDER_ROLES
from app.agents.research_role_review import AUTHORITY
from app.eval.council_benchmark import load_suite
from app.eval.research_role_benchmark import (
    LABELS, PRIORITIES, bounded_baseline, load_priorities, run_priority_benchmark,
    render_priorities, score_priorities,
)


def selected(name="growth-with-cash-burn"):
    suite = load_suite()[0]
    case = next(row for row in suite.cases if row.case_id == name)
    return case, load_priorities(suite.cases)[0][name]


def test_offline_comparison_never_configures_a_provider_and_exposes_fixture_omissions(monkeypatch):
    def deny(*_args, **_kwargs): pytest.fail("No provider/configuration on offline path")
    monkeypatch.setattr("app.agents.council_model.configured_role_model", deny)
    monkeypatch.setattr(httpx, "Client", deny)
    report = run_priority_benchmark()
    assert report["status"] == "offline-controls-ready"
    assert len(report["baseline"]) == len(report["protocol_fixture_control"]) == 8
    assert all(row["all_priority_checks_pass"] for row in report["baseline"])
    assert all(row["run_completed"] for row in report["protocol_fixture_control"])
    assert not any(row["all_priority_checks_pass"] for row in report["protocol_fixture_control"])
    assert report["protocol_fixture_control"][0]["roles"]["company"]["missing_priority_codes"] == ["REVIEW_LEVERAGE_CONTEXT"]
    missing = report["protocol_fixture_control"][5]["roles"]["daily"]
    assert missing["missing_priority_codes"] == ["FILL_RISK_COVERAGE"]
    assert all(row["usage"]["provider_requests"] == 0 for group in ("baseline", "protocol_fixture_control") for row in report[group])
    assert report["candidate"] is report["telemetry"] is None
    for key in (*AUTHORITY, "financial_usefulness_established", "independent_review_completed", "holdout_validation_completed"):
        assert report[key] is False


def test_equal_output_caps_and_labels_are_not_consumed_by_deterministic_selector(monkeypatch):
    case, _ = selected()
    before = bounded_baseline(case.raw)
    monkeypatch.setattr("app.eval.research_role_benchmark.load_priorities", lambda *_: pytest.fail("Baseline must not read labels"))
    assert before == bounded_baseline(case.raw)
    assert before["usage"] == {"model_calls": 0, "tool_calls": 0, "provider_requests": 0}
    assert all(1 <= len(row["review_codes"]) <= 3 and len(row["evidence_ids"]) <= 4 for row in before["roles"].values())


@pytest.mark.parametrize("name,code", [("growth-with-cash-burn", "REVIEW_NEGATIVE_CASH_FLOW"),
    ("zero-cash-flow", "REVIEW_ZERO_CASH_FLOW"), ("profitable-growth-flat-market", "REVIEW_CASH_FLOW_CONTEXT")])
def test_cash_flow_sign_and_zero_keep_distinct_priority_context(name, code):
    case, labels = selected(name)
    result = bounded_baseline(case.raw)
    assert code in result["roles"]["company"]["review_codes"]
    assert "sec:free_cash_flow_usd" in result["roles"]["company"]["evidence_ids"]
    assert score_priorities(case, labels, result, deterministic=True)["all_priority_checks_pass"]


@pytest.mark.parametrize("name", ["missing-filing-lineage", "same-day-filing-uncertainty"])
def test_unusable_filing_values_never_become_numeric_review_priorities(name):
    case, labels = selected(name)
    result = bounded_baseline(case.raw)
    assert result["roles"]["company"]["evidence_ids"] == []
    assert not any(code.startswith("REVIEW_") for code in result["roles"]["company"]["review_codes"])
    assert score_priorities(case, labels, result, deterministic=True)["roles"]["company"]["numeric_context_support"] is None


@pytest.mark.parametrize("kind", ["failed", "partial"])
def test_incomplete_candidate_never_passes_the_case_even_with_all_role_priorities(kind):
    case, labels = selected()
    result = bounded_baseline(case.raw); result["status"] = kind
    score = score_priorities(case, labels, result, deterministic=True)
    assert all(row["all_priority_checks_pass"] for row in score["roles"].values())
    assert not score["run_completed"] and not score["all_priority_checks_pass"]


def test_missing_roles_empty_targets_and_no_numeric_targets_are_unscored():
    case, labels = selected()
    result = bounded_baseline(case.raw)
    del result["roles"]["daily"]
    score = score_priorities(case, labels, result, deterministic=True)
    assert score["roles"]["daily"]["priority_recall"] is None
    assert not score["all_priority_checks_pass"]
    empty = labels.model_copy(update={"roles": {**labels.roles, "company": ()}})
    score = score_priorities(case, empty, bounded_baseline(case.raw), deterministic=True)
    assert score["roles"]["company"]["priority_recall"] is None
    assert score["roles"]["company"]["all_priority_checks_pass"] is None
    assert not score["all_priority_checks_pass"]


@pytest.mark.parametrize("change", ["scope", "digest", "authority", "citation", "uninspected", "wrong-metric", "unknown-code", "over-budget"])
def test_tampered_binding_or_unsupported_selection_cannot_pass_or_leak_prose(change):
    case, labels = selected()
    result = ResearchRoleAgent(FictionalResearchRoleModel()).run(case.raw)
    if change == "scope": result["scope"] = "portfolio"
    if change == "digest": result["request_sha256"] = "0" * 64
    if change == "authority": result["sends_messages"] = True
    if change == "citation": result["roles"]["company"]["evidence_ids"] = ["outside-private-value"]
    if change == "uninspected": result["trace"][0]["evidence_ids"] = ["sec:revenue_growth_pct"]
    if change == "wrong-metric": result["roles"]["company"]["evidence_ids"] = ["sec:revenue_growth_pct"]
    if change == "unknown-code": result["roles"]["company"]["review_codes"] = ["private prose guaranteed winner"]
    if change == "over-budget": result["usage"]["model_calls"] = 7
    result["private_prompt"] = "private prose guaranteed winner"
    score = score_priorities(case, labels, result)
    assert not score["all_priority_checks_pass"]
    assert "private" not in json.dumps(score)
    assert score["roles"]["company"]["priority_recall"] != 1
    if change == "wrong-metric":
        assert score["roles"]["company"]["numeric_context_support"] == .5
        assert not score["roles"]["company"]["selection_contract_valid"]


@pytest.mark.parametrize("change", ["hash", "duplicate-case", "duplicate-code", "unknown-code", "too-many", "missing-role", "independent", "holdout", "extra", "duplicate-key", "nan", "oversized"])
def test_label_files_are_strict_bound_and_cannot_claim_independent_validation(tmp_path, change):
    value = json.loads(LABELS.read_text())
    if change == "hash": value["cases"][0]["request_sha256"] = "0" * 64
    if change == "duplicate-case": value["cases"][1] = copy.deepcopy(value["cases"][0])
    if change == "duplicate-code": value["cases"][0]["roles"]["company"] = ["VERIFY_ORIGINAL_FILINGS"] * 2
    if change == "unknown-code": value["cases"][0]["roles"]["company"] = ["RAW_PRIVATE_LABEL"]
    if change == "too-many": value["cases"][0]["roles"]["company"] += ["VERIFY_ORIGINAL_FILINGS"]
    if change == "missing-role": del value["cases"][0]["roles"]["daily"]
    if change == "independent": value["independent_review_completed"] = True
    if change == "holdout": value["holdout_validation_completed"] = True
    if change == "extra": value["reviewer_private_notes"] = "RAW_PRIVATE_LABEL"
    text = json.dumps(value)
    if change == "duplicate-key": text = text.replace('"fictional_only": true', '"fictional_only": true, "fictional_only": true')
    if change == "nan": text = text.replace('"fictional_only": true', '"fictional_only": NaN')
    if change == "oversized": text = "x" * 16385
    path = tmp_path / "labels.json"; path.write_text(text)
    with pytest.raises(ValueError, match="^Research priority labels are invalid$"):
        load_priorities(load_suite()[0].cases, path)


def install_mock_router(monkeypatch, *, outage=False, prioritize=False):
    for name in ("VERCEL", "VERCEL_ENV", "NODE_ENV"): monkeypatch.delenv(name, raising=False)
    for flag in ("COUNCIL_DEV_ENABLED", "COUNCIL_LIVE_DEV_ENABLED"): monkeypatch.setenv(flag, "true")
    calls, routes = [], {}
    inverse = {provider: role for role, provider in PROVIDER_ROLES.items()}
    for provider_role, model_id in NVIDIA_FIRST_MODELS.items():
        def respond(request, alias=provider_role, model=model_id):
            calls.append(request)
            if outage: return httpx.Response(429, json={"error": "private provider body"})
            messages = json.loads(request.content)["messages"]
            content = FictionalResearchRoleModel().complete(inverse[alias], messages)
            if prioritize and len(messages) > 2:
                role = inverse[alias]
                codes, ids = {
                    "company": (["REVIEW_NEGATIVE_CASH_FLOW", "REVIEW_GROWTH_CONTEXT", "REVIEW_LEVERAGE_CONTEXT"],
                                ["sec:free_cash_flow_usd", "sec:revenue_growth_pct", "sec:liabilities_equity"]),
                    "catalyst": (["REVIEW_EVENT_TIMING"], ["calendar:event-days"]),
                    "daily": (["CHECK_SOURCE_AUTHENTICITY"], []),
                }[role]
                content = json.dumps({"action": "review", "review_codes": codes, "evidence_ids": ids})
            return httpx.Response(200, json={"model": model, "choices": [{"message": {"content": content}}],
                                           "usage": {"prompt_tokens": 30, "completion_tokens": 20}})
        routes[provider_role] = NvidiaCouncilModel("fake-dev-key", model_id, transport=httpx.MockTransport(respond))
    model = ResearchRoleModelAdapter(RoleRoutedCouncilModel(routes))
    monkeypatch.setattr("app.eval.research_role_probe.configured_research_role_model", lambda: model)
    return calls


def test_mocked_live_completion_does_not_pass_missing_priorities_or_invent_costs(monkeypatch):
    calls = install_mock_router(monkeypatch)
    report = run_priority_benchmark(case_id="growth-with-cash-burn", live=True)
    assert report["status"] == "candidate-priorities-not-met" and len(calls) == 6
    assert len(report["baseline"]) == len(report["protocol_fixture_control"]) == 1
    assert report["candidate"]["run_completed"] and not report["candidate"]["all_priority_checks_pass"]
    assert report["telemetry"]["totals"]["reported_cost_usd"] is None
    assert report["telemetry"]["observed_provider_attempts"] == 6
    text = json.dumps(report) + render_priorities(report)
    assert "unknown" in text and "fake-dev-key" not in text and '"messages"' not in text


def test_grounded_mocked_candidate_can_pass_authored_labels_without_gaining_financial_authority(monkeypatch):
    calls = install_mock_router(monkeypatch, prioritize=True)
    report = run_priority_benchmark(case_id="growth-with-cash-burn", live=True)
    assert len(calls) == 6 and report["status"] == "live-trial-complete"
    assert report["candidate"]["all_priority_checks_pass"]
    assert report["candidate"]["roles"]["company"]["numeric_context_support"] == 1
    assert report["candidate"]["roles"]["daily"]["numeric_context_support"] is None
    assert not report["independent_review_completed"] and not report["holdout_validation_completed"]
    assert not report["financial_usefulness_established"] and all(report[key] is False for key in AUTHORITY)


def test_provider_outage_stops_at_one_attempt_and_unreturned_roles_are_unscored(monkeypatch):
    calls = install_mock_router(monkeypatch, outage=True)
    report = run_priority_benchmark(case_id="stale-market", live=True)
    assert report["status"] == "candidate-unavailable" and len(calls) == 1
    assert not report["candidate"]["all_priority_checks_pass"]
    assert all(row["priority_recall"] is None for row in report["candidate"]["roles"].values())
    assert "private provider body" not in json.dumps(report)
    assert "not scored" in render_priorities(report)


def test_production_disable_after_router_construction_prevents_all_calls(monkeypatch):
    calls = install_mock_router(monkeypatch)
    monkeypatch.setenv("VERCEL", "1")
    report = run_priority_benchmark(case_id="growth-with-cash-burn", live=True)
    assert report["status"] == "candidate-unavailable" and calls == []
    assert not report["candidate"]["all_priority_checks_pass"]


def test_missing_configuration_and_invalid_live_scope_do_not_create_models(monkeypatch):
    monkeypatch.setattr("app.eval.research_role_probe.configured_research_role_model", lambda: None)
    report = run_priority_benchmark(case_id="growth-with-cash-burn", live=True)
    assert report["status"] == "development-configuration-unavailable"
    assert report["candidate"] is report["telemetry"] is None
    for kwargs in ({"live": True}, {"live": True, "case_id": "outside"}):
        with pytest.raises(ValueError): run_priority_benchmark(**kwargs)


def test_default_cli_is_offline_and_live_scope_errors_are_redacted():
    root = Path(__file__).resolve().parents[2]
    command = [sys.executable, str(root / "scripts/research_role_benchmark.py")]
    env = {"PATH": os.defpath, "PYTHONPATH": str(root)}
    result = subprocess.run(command, env=env, capture_output=True, text=True, check=True)
    report = json.loads(result.stdout)
    assert report["status"] == "offline-controls-ready" and not result.stderr
    assert report["independent_review_completed"] is False
    missing = subprocess.run(command + ["--live"], env=env, capture_output=True, text=True)
    assert missing.returncode == 2 and json.loads(missing.stdout)["status"] == "research-priority-comparison-unavailable"
    unavailable = subprocess.run(command + ["--live", "--case", "growth-with-cash-burn"], env=env, capture_output=True, text=True)
    assert unavailable.returncode == 1 and json.loads(unavailable.stdout)["status"] == "development-configuration-unavailable"
