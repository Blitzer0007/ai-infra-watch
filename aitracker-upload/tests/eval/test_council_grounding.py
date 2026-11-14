"""Frozen proposal labels expose gaps; they do not certify a model or a forecast."""
import copy
import json
import socket
import subprocess
import sys

import httpx
import pytest

from app.eval import council_grounding as evaluation


def payload():
    return json.loads(evaluation.DEFAULT_SUITE.read_text())


def write_suite(tmp_path, value):
    path = tmp_path / "cases.json"
    path.write_text(json.dumps(value, allow_nan=False))
    return path


@pytest.fixture(scope="module")
def report():
    return evaluation.run_suite()


def test_actual_orchestration_matches_frozen_protocol_labels_without_live_claims(report):
    assert report["case_count"] == 14
    assert report["expected_behavior"] == evaluation.fraction(14, 14)
    assert report["admission_label_agreement"] == evaluation.fraction(14, 14)
    assert report["provider_requests"] == report["jev_calls"] == 0
    assert report["mode"] == "scripted-offline-no-provider"
    assert report["label_origin"] == "developer-authored-fictional-not-human-independent"
    for key in ("source_authenticity_verified", "forecast_validity_established", "semantic_grounding_established", "live_model_effectiveness_established"):
        assert report[key] is False
    assert set(report["implementation_sha256"]) == {"council", "admission", "evaluator"}


def test_reference_precision_cannot_hide_proposals_rejected_before_acceptance(report):
    assert report["accepted_reference_precision"] == evaluation.fraction(24, 24)
    assert report["proposed_reference_precision"] == evaluation.fraction(25, 26)
    unknown = next(row for row in report["cases"] if row["case_id"] == "unknown-citation")
    assert unknown["accepted_reference_precision"]["rate"] is None
    assert unknown["proposed_reference_precision"] == evaluation.fraction(0, 1)
    assert unknown["completed_roles"] == [] and unknown["judge_policy_agreement"] is None


def test_known_unsupported_proposals_are_withheld_despite_valid_references(report):
    assert report["unsupported_narrative_proposal_count"] == 4
    assert report["unsupported_narratives_accepted"] == 0
    assert report["unsupported_narratives_withheld"] == 3
    by_id = {row["case_id"]: row for row in report["cases"]}
    for case_id, role in [("unsupported-word-number", "bull"), ("inverted-cash-flow-sign", "bull"),
                          ("unsupported-future-certainty", "judge")]:
        assert by_id[case_id]["status"] == "complete"
        assert by_id[case_id]["unsupported_narratives_accepted"] == []
        assert by_id[case_id]["unsupported_narratives_withheld"] == [role]
    assert by_id["unsupported-numeral-blocked"]["unsupported_narratives_accepted"] == []
    assert by_id["unsupported-numeral-blocked"]["status"] == "failed"
    assert report["unlabelled_accepted_narrative_count"] == 0


def test_missing_judges_do_not_silently_inflate_policy_agreement(report):
    assert report["judge_policy_agreement"] == evaluation.fraction(5, 12)
    assert report["judge_missing_count"] == 2
    assert report["complete_runs"] == evaluation.fraction(11, 14)
    assert report["required_abstention_recall"] == evaluation.fraction(9, 9)
    # Conditional research does not label a preferred side as a future winner.
    directional = next(row for row in report["cases"] if row["case_id"] == "conditional-bull-is-not-a-forecast")
    assert directional["disposition"] == "provisional-bull" and directional["authority_false"]


def test_input_baselines_use_the_same_input_labels_and_report_abstention_cost(report):
    baselines = report["baselines"]
    assert baselines["always_abstain"]["input_required_abstention_recall"] == evaluation.fraction(6, 6)
    assert baselines["always_abstain"]["abstention_among_input_reviewable"] == evaluation.fraction(8, 8)
    assert baselines["family_presence_only"]["input_required_abstention_recall"] == evaluation.fraction(1, 6)
    assert baselines["admission_only"]["input_required_abstention_recall"] == evaluation.fraction(6, 6)
    assert baselines["admission_only"]["abstention_among_input_reviewable"] == evaluation.fraction(0, 8)


def test_replays_are_deterministic_and_do_not_mutate_frozen_inputs():
    before = evaluation.DEFAULT_SUITE.read_bytes()
    assert evaluation.run_suite() == evaluation.run_suite()
    assert evaluation.DEFAULT_SUITE.read_bytes() == before
    suite = evaluation.Suite.model_validate(payload())
    base = json.loads(evaluation.FIXTURE.read_text())["request"]
    original = copy.deepcopy(base)
    evaluation.request_for(base, suite.cases[2])
    assert base == original


def test_original_adversarial_proposals_and_input_edits_are_unchanged():
    original = json.loads((evaluation.DEFAULT_SUITE.parent / 'council-grounding-v1.json').read_text())
    current = payload()
    assert current['base_fixture_sha256'] == original['base_fixture_sha256']
    for old, new in zip(original['cases'], current['cases'], strict=True):
        assert old['id'] == new['id'] and old['responses'] == new['responses'] and old['edits'] == new['edits']
        assert old['labels']['narrative_supported'] == new['labels']['narrative_supported']
        assert old['labels']['proposal_sha256'] == new['labels']['proposal_sha256']
    # Historical labels expect the original proposal, so they do not silently
    # certify a changed renderer. V2 explicitly annotates the controlled output.
    assert evaluation.run_suite(evaluation.DEFAULT_SUITE.parent / 'council-grounding-v1.json')['expected_behavior']['rate'] < 1


def test_evaluator_cannot_contact_a_provider_or_open_a_socket(monkeypatch):
    def forbidden(*_args, **_kwargs):
        pytest.fail("Offline evaluation attempted network access")
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(httpx.Client, "send", forbidden)
    monkeypatch.setattr(httpx.AsyncClient, "send", forbidden)
    assert evaluation.run_suite()["expected_behavior"]["rate"] == 1


@pytest.mark.parametrize("mutation", ["proposal", "edits", "duplicate-case", "missing-label", "coerced-bool", "extra", "empty"])
def test_changed_or_ambiguous_labels_fail_closed(tmp_path, mutation):
    value = payload()
    if mutation == "proposal":
        value["cases"][0]["responses"]["bull"][1]["summary"] = "Changed interpretation."
    if mutation == "edits":
        value["cases"][0]["edits"] = [{"path": ["packet", "horizon_months"], "value": 6}]
    if mutation == "duplicate-case":
        value["cases"].append(copy.deepcopy(value["cases"][0]))
    if mutation == "missing-label":
        del value["cases"][0]["labels"]["narrative_supported"]["judge"]
    if mutation == "coerced-bool":
        value["cases"][0]["labels"]["must_abstain"] = "false"
    if mutation == "extra":
        value["provider"] = "https://outside.invalid"
    if mutation == "empty":
        value["cases"] = []
    with pytest.raises(ValueError):
        evaluation.run_suite(write_suite(tmp_path, value))


def test_changed_base_receipt_requires_label_review(tmp_path, monkeypatch):
    fixture = tmp_path / "base.json"
    fixture.write_bytes(evaluation.FIXTURE.read_bytes() + b"\n")
    monkeypatch.setattr(evaluation, "FIXTURE", fixture)
    with pytest.raises(ValueError, match="Base fixture changed"):
        evaluation.run_suite()


@pytest.mark.parametrize("raw", [b'{"version":1,"version":2}', b'{"value":NaN}', b'x' * (evaluation.MAX_BYTES + 1), b'[' * 2000 + b'0' + b']' * 2000])
def test_ambiguous_nonfinite_or_oversized_input_is_rejected(tmp_path, raw):
    path = tmp_path / "input.json"
    path.write_bytes(raw)
    with pytest.raises(ValueError):
        evaluation.run_suite(path)


def test_a_new_runtime_authority_regression_is_not_an_expected_fixture_success(monkeypatch):
    original = evaluation.PortfolioCouncil.run_admitted
    def unsafe(self, raw):
        result = original(self, raw)
        result["grants_decision_eligibility"] = True
        return result
    monkeypatch.setattr(evaluation.PortfolioCouncil, "run_admitted", unsafe)
    report = evaluation.run_suite()
    assert report["expected_behavior"] == evaluation.fraction(0, 14)


def test_new_output_without_a_frozen_label_is_reported_as_unknown(monkeypatch):
    original = evaluation.PortfolioCouncil.run_admitted
    def rewritten(self, raw):
        result = original(self, raw)
        for role in result["roles"].values():
            role["summary"] = "Changed output requiring annotation."
        return result
    monkeypatch.setattr(evaluation.PortfolioCouncil, "run_admitted", rewritten)
    report = evaluation.run_suite()
    assert report["unlabelled_accepted_narrative_count"] > 0
    assert report["unsupported_narratives_accepted"] == 0
    assert report["expected_behavior"]["rate"] < 1


def test_cli_invalid_input_does_not_echo_private_paths_or_payloads(tmp_path):
    path = tmp_path / "fictional-private-input.json"
    path.write_text('{"fictional-private-value":NaN}')
    script = evaluation.ROOT / "aitracker-upload/scripts/evaluate_council_grounding.py"
    result = subprocess.run([sys.executable, str(script), "--cases", str(path)], capture_output=True, text=True)
    assert result.returncode == 2 and result.stderr == ""
    assert json.loads(result.stdout)["status"] == "invalid-evaluation-input"
    assert "fictional-private" not in result.stdout


def test_report_does_not_export_raw_source_receipts_or_proposed_narrative(report):
    encoded = json.dumps(report)
    assert '"accession"' not in encoded and '"inputs"' not in encoded
    for case in payload()["cases"]:
        for role in ("bull", "bear", "judge"):
            assert case["responses"][role][1]["summary"] not in encoded
