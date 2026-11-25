"""Independent fixture labels, explicit live opt-in, real mocked role transports."""
import json
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import httpx
import pytest

from app.agents.council_model import NVIDIA_FIRST_MODELS, NvidiaCouncilModel, RoleRoutedCouncilModel
from app.agents.portfolio_council import FictionalCouncilModel
from app.eval.council_benchmark import (
    AUTHORITY, FIXTURES, deterministic_baseline, load_suite, render_markdown,
    run_benchmark, score_case, _telemetry, _observed_total,
)


def case(name):
    return next(row for row in load_suite()[0].cases if row.case_id == name)


def test_offline_path_does_not_access_provider_configuration_or_transport(monkeypatch):
    def denied(*_args, **_kwargs):
        pytest.fail("Offline comparison must not read credentials or create HTTP clients")
    monkeypatch.setattr("app.agents.council_model.configured_role_model", denied)
    monkeypatch.setattr(httpx, "Client", denied)
    report = run_benchmark()
    assert report["status"] == "offline-controls-ready"
    assert len(report["deterministic_baseline"]) == len(report["protocol_fixture_control"]) == 8
    assert all(row["all_label_checks_pass"] for row in report["deterministic_baseline"])
    assert report["candidate"] is None and report["telemetry"] is None
    assert len(report["fixture_sha256"]) == 64
    assert report["financial_usefulness_established"] is False
    assert all(report[key] is False for key in AUTHORITY)


def test_protocol_fixture_is_not_misrepresented_as_a_useful_model():
    report = run_benchmark()
    controls = report["protocol_fixture_control"]
    assert all(row["protocol_completed"] for row in controls)
    assert not any(row["all_label_checks_pass"] for row in controls)
    weak = next(row for row in controls if row["case_id"] == "stale-market")
    assert weak["judge"]["abstention_matches_label"] is False
    assert weak["judge"]["future_winner_accuracy"] is None
    assert weak["roles"]["bear"]["labelled_selection_precision"] is None
    assert weak["roles"]["bear"]["labelled_selection_recall"] == 0


def test_zero_is_not_missing_or_positive_and_flat_price_does_not_create_a_claim():
    zero = case("zero-cash-flow")
    scored = score_case(zero, deterministic_baseline(zero))
    assert scored["roles"]["bull"]["claim_count"] == 3
    assert scored["all_label_checks_pass"]
    flat = case("profitable-growth-flat-market")
    result = deterministic_baseline(flat)
    assert all(row["stance"] == "support" for row in result["roles"]["bull"]["claims"])
    assert all(row["stance"] == "challenge" for row in result["roles"]["bear"]["claims"])
    assert not any(row["evidence_id"].startswith("loaded:") for row in result["roles"]["bull"]["claims"])


@pytest.mark.parametrize("name", ["stale-market", "missing-filing-lineage", "same-day-filing-uncertainty", "unconfirmed-catalyst"])
def test_failure_or_partial_output_cannot_pass_required_abstention(name):
    value = case(name)
    result = deterministic_baseline(value)
    assert result["roles"]["judge"]["preference"] == "insufficient"
    result["status"] = "failed"
    scored = score_case(value, result)
    assert not scored["protocol_completed"]
    assert scored["judge"]["abstention_matches_label"] is False
    assert not scored["all_label_checks_pass"]


def test_valid_citation_and_wrong_stance_are_distinct_from_unusable_citation():
    value = case("growth-with-cash-burn")
    result = deterministic_baseline(value)
    result["roles"]["bull"]["claims"][0]["stance"] = "challenge"
    scored = score_case(value, result)
    assert scored["roles"]["bull"]["conditional_citation_precision"] == 1
    assert scored["roles"]["bull"]["labelled_selection_precision"] == .75
    assert not scored["all_label_checks_pass"]
    result["roles"]["bull"]["claims"][0]["evidence_id"] = "outside"
    assert score_case(value, result)["roles"]["bull"]["conditional_citation_precision"] == .75


def test_no_claims_do_not_receive_vacuous_perfect_precision_and_authority_cannot_pass():
    value = case("missing-filing-lineage")
    result = deterministic_baseline(value)
    row = score_case(value, result)
    assert row["roles"]["bull"]["conditional_citation_precision"] is None
    assert row["roles"]["bull"]["labelled_selection_precision"] is None
    assert row["roles"]["bull"]["labelled_selection_recall"] is None
    assert row["roles"]["bull"]["empty_label_respected"] is True
    result["source_authenticity_verified"] = True
    assert not score_case(value, result)["all_label_checks_pass"]


@pytest.mark.parametrize("change", ["real-symbol", "duplicate-case", "unbound-label", "duplicate-label", "nonfiction", "extra", "bad-id", "empty"])
def test_invalid_or_unbound_fixture_labels_fail_without_echoing_data(tmp_path, change):
    value = json.loads(FIXTURES.read_text())
    if change == "real-symbol": value["cases"][0]["request"]["packet"]["symbol"] = "MSFT"
    if change == "duplicate-case": value["cases"][1]["case_id"] = value["cases"][0]["case_id"]
    if change == "unbound-label": value["cases"][0]["expected"]["claims"]["bull"][0]["evidence_id"] = "outside"
    if change == "duplicate-label": value["cases"][0]["expected"]["usable_ids"] *= 2
    if change == "nonfiction": value["fictional_only"] = False
    if change == "extra": value["private"] = "fictional-private-body"
    if change == "bad-id": value["cases"][0]["case_id"] = "<fictional-private-body>"
    if change == "empty": value["cases"] = []
    path = tmp_path / "fixture.json"
    path.write_text(json.dumps(value))
    with pytest.raises(ValueError, match="^Council benchmark fixtures are invalid$"):
        load_suite(path)


@pytest.mark.parametrize("raw", [b'{"contract_version":"a","contract_version":"b"}', b'{"x":NaN}', b'x' * 131073])
def test_duplicate_nonfinite_or_oversized_dataset_rejected(tmp_path, raw):
    path = tmp_path / "fixture.json"
    path.write_bytes(raw)
    with pytest.raises(ValueError, match="^Council benchmark fixtures are invalid$"):
        load_suite(path)


def test_live_requires_one_explicit_known_case_before_reading_credentials(monkeypatch):
    monkeypatch.setattr("app.agents.council_model.configured_role_model", lambda: pytest.fail("No provider configuration allowed"))
    for kwargs in ({"live": True}, {"live": True, "case_id": "unknown"}):
        with pytest.raises(ValueError): run_benchmark(**kwargs)


def test_production_guard_prevents_a_live_trial_even_with_fake_development_flags(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("COUNCIL_DEV_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_LIVE_DEV_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_MULTI_MODEL_DEV_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_NVIDIA_API_KEY", "fictional-private-key")
    monkeypatch.setattr(httpx, "Client", lambda **_: pytest.fail("No HTTP in production"))
    report = run_benchmark(live=True, case_id="growth-with-cash-burn")
    assert report["status"] == "development-configuration-unavailable"
    assert report["candidate"] is None and report["telemetry"] is None
    assert "fictional-private-key" not in json.dumps(report)


def routed_model(monkeypatch, calls, *, outage=False):
    for name in ("VERCEL", "VERCEL_ENV", "NODE_ENV"): monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("COUNCIL_DEV_ENABLED", "true")
    monkeypatch.setenv("COUNCIL_LIVE_DEV_ENABLED", "true")
    routes = {}
    for role, model_id in NVIDIA_FIRST_MODELS.items():
        def handle(request, role=role, model_id=model_id):
            calls.append((role, request))
            if outage: return httpx.Response(429, json={"private": "fictional-provider-body"})
            payload = json.loads(request.content)
            content = FictionalCouncilModel().complete(role, payload["messages"])
            return httpx.Response(200, json={"model": model_id, "choices": [{"message": {"content": content}}],
                                            "usage": {"prompt_tokens": 15, "completion_tokens": 20, "private": "fictional-provider-body"}})
        routes[role] = NvidiaCouncilModel("fictional-private-key", model_id, transport=httpx.MockTransport(handle))
    model = RoleRoutedCouncilModel(routes)
    monkeypatch.setattr("app.agents.council_model.configured_role_model", lambda: model)
    return model


def test_mocked_live_trial_preserves_distinct_role_models_six_calls_and_unknown_cost(monkeypatch):
    calls = []
    model = routed_model(monkeypatch, calls)
    report = run_benchmark(live=True, case_id="growth-with-cash-burn")
    assert report["status"] == "live-trial-complete"
    assert len(report["deterministic_baseline"]) == 1
    assert len(calls) == report["telemetry"]["observed_provider_attempts"] == 6
    assert {role: sum(row[0] == role for row in calls) for role in NVIDIA_FIRST_MODELS} == dict.fromkeys(NVIDIA_FIRST_MODELS, 2)
    assert {role: row["model"] for role, row in report["telemetry"]["routes"].items()} == NVIDIA_FIRST_MODELS
    assert report["telemetry"]["totals"]["reported_cost_usd"] is None
    assert report["telemetry"]["totals"]["input_tokens"] == 90
    assert report["candidate"]["protocol_completed"] and not report["candidate"]["all_label_checks_pass"]
    markdown = render_markdown(report)
    assert "Observed latency sum (ms)" in markdown and "Reported cost (USD)" in markdown
    assert all(model_id in markdown for model_id in NVIDIA_FIRST_MODELS.values())
    assert "unknown" in markdown
    for _, request in calls:
        assert str(request.url) == "https://integrate.api.nvidia.com/v1/chat/completions"
        assert b'judge_must_abstain' not in request.content and b'"expected"' not in request.content
        assert b'"inputs"' not in request.content and b'"cik"' not in request.content
    encoded = json.dumps(report) + render_markdown(report)
    assert "fictional-private-key" not in encoded and "fictional-provider-body" not in encoded
    assert report["financial_usefulness_established"] is False


def test_provider_outage_is_one_attempt_without_retry_or_a_false_success(monkeypatch):
    calls = []
    routed_model(monkeypatch, calls, outage=True)
    report = run_benchmark(live=True, case_id="stale-market")
    assert report["status"] == "candidate-unavailable" and len(calls) == 1
    assert not report["candidate"]["protocol_completed"]
    assert report["candidate"]["judge"]["abstention_matches_label"] is False
    assert report["telemetry"]["totals"]["reported_cost_usd"] is None
    assert "fictional-provider-body" not in json.dumps(report)


def test_receipt_export_drops_unknown_fields_and_invalid_metadata():
    model = SimpleNamespace(http_attempts=1,
        manifest={"bull": {"provider": "nvidia", "model": "vendor/model", "key": "fictional-private-key"}},
        receipts=[{"role": "bull", "provider": "nvidia", "requested_model": "vendor/model",
                   "returned_model": "invalid private body", "status": "unavailable",
                   "latency_ms": 10, "input_tokens": None, "output_tokens": float("nan"),
                   "reported_cost_usd": None, "prompt": "fictional-private-key"}])
    telemetry = _telemetry(model)
    assert telemetry["receipts"][0]["returned_model"] is None
    assert telemetry["totals"]["output_tokens"] is None
    assert telemetry["totals"]["reported_cost_usd"] is None
    assert "fictional-private-key" not in json.dumps(telemetry)
    assert _observed_total([1e308, 1e308]) is None
    assert _observed_total([0, None]) is None
    assert _observed_total([0, 0]) == 0


def test_markdown_and_cli_distinguish_offline_controls_from_real_model_results():
    text = render_markdown(run_benchmark())
    assert "Live candidate: not evaluated" in text and "Protocol fixture" in text
    assert "not scored" in text and "| fail |" in text
    root = Path(__file__).resolve().parents[2]
    command = [sys.executable, str(root / "scripts/council_model_benchmark.py")]
    env = {"PATH": os.defpath, "PYTHONPATH": str(root)}
    output = subprocess.run(command, env=env, capture_output=True, text=True, check=True)
    assert json.loads(output.stdout)["status"] == "offline-controls-ready"
    invalid = subprocess.run(command + ["--live"], env=env, capture_output=True, text=True)
    assert invalid.returncode == 2 and json.loads(invalid.stdout)["status"] == "benchmark-unavailable"
    assert not invalid.stderr
