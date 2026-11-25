"""Deterministic loaded-input roles: fictional data only, no I/O or authority."""
import copy
import json
from pathlib import Path

import httpx
import pytest

from app.agents.council_admission import evaluate
from app.agents.research_role_review import AUTHORITY, research_role_review
from app.eval.council_benchmark import load_suite

FIXTURE = Path(__file__).resolve().parents[2] / "data/research/research-role-review.fictional.json"


def cases():
    return {case.case_id: case for case in load_suite()[0].cases}


def test_python_expected_role_packets_bind_all_eight_cross_language_snapshots(monkeypatch):
    def deny(*_args, **_kwargs):
        pytest.fail("Deterministic role views must never contact providers")
    monkeypatch.setattr(httpx, "Client", deny)
    monkeypatch.setattr("app.agents.council_model.configured_role_model", deny)
    snapshots = json.loads(FIXTURE.read_text())
    for example in snapshots["cases"]:
        case = cases()[example["case_id"]]
        original = case.raw
        assert evaluate(original) == example["admission"]
        result = research_role_review(original)
        assert result == example["review"]
        assert case.raw == original
        assert all(result[key] is False for key in AUTHORITY)
        assert result["policy"] == {"read_only": True, "max_evidence": 8, "max_review_codes": 7,
                                    "model_calls": 0, "provider_requests": 0, "tool_calls": 0}
        for role in result["roles"].values():
            assert len(role["review_codes"]) <= 7
            assert len(set(role["review_codes"])) == len(role["review_codes"])
            assert set(role["evidence_ids"]) <= set(example["admission"]["quality"]["usable_ids"])


@pytest.mark.parametrize("name", ["missing-filing-lineage", "same-day-filing-uncertainty"])
def test_missing_or_uncertain_filings_cannot_enter_company_citations(name):
    result = research_role_review(cases()[name].raw)
    company = result["roles"]["company"]
    assert company["status"] == "needs-data" and company["evidence_ids"] == []
    assert "FINANCIAL_INPUTS_MISSING" in company["review_codes"]
    assert "RISK_INPUTS_MISSING" in company["review_codes"]
    assert "REVIEW_NEGATIVE_CASH_FLOW" not in company["review_codes"]
    assert result["roles"]["daily"]["status"] == "needs-data"


@pytest.mark.parametrize("name,code", [("growth-with-cash-burn", "REVIEW_NEGATIVE_CASH_FLOW"),
    ("zero-cash-flow", "REVIEW_ZERO_CASH_FLOW"), ("profitable-growth-flat-market", "REVIEW_CASH_FLOW_CONTEXT")])
def test_zero_negative_and_positive_cash_flow_keep_their_original_meaning(name, code):
    case = cases()[name]
    result = research_role_review(case.raw)
    company = result["roles"]["company"]
    assert "sec:free_cash_flow_usd" in company["evidence_ids"]
    assert code in company["review_codes"] and "FINANCIAL_INPUTS_MISSING" not in company["review_codes"]
    assert result["status"] == "conditional"
    assert result["source_authenticity_verified"] is False


def test_catalyst_and_daily_views_expose_confirmation_and_market_gaps():
    catalyst = research_role_review(cases()["unconfirmed-catalyst"].raw)
    assert catalyst["roles"]["catalyst"]["evidence_ids"] == []
    assert catalyst["roles"]["catalyst"]["review_codes"] == ["VERIFY_EVENT_SOURCE", "EVENT_CONFIRMATION_REQUIRED"]
    assert "FILL_CATALYST_COVERAGE" in catalyst["roles"]["daily"]["review_codes"]
    stale = research_role_review(cases()["stale-market"].raw)
    assert "REFRESH_MARKET_EVIDENCE" in stale["roles"]["daily"]["review_codes"]
    assert not any(key.startswith("loaded:") for key in stale["roles"]["daily"]["evidence_ids"])


@pytest.mark.parametrize("change", ["private-field", "mixed-symbol", "unknown-mode", "duplicate-evidence"])
def test_invalid_or_unbound_input_rejected_without_a_role_packet(change):
    value = copy.deepcopy(cases()["growth-with-cash-burn"].request)
    if change == "private-field": value["packet"]["notes"] = "fictional-private-note"
    if change == "mixed-symbol": value["packet"]["evidence"][0]["symbol"] = "OTHER"
    if change == "unknown-mode": value["mode"] = "autonomous-live"
    if change == "duplicate-evidence": value["packet"]["evidence"].append(value["packet"]["evidence"][0])
    with pytest.raises(ValueError): research_role_review(json.dumps(value).encode())
