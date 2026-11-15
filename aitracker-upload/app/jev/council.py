"""Optional typed coverage check. No narrative judge, discovery, or eligibility grant."""
import os
import json
from app.agents.council_model import development_enabled

QUESTIONS = {
    "coverage": {"type": "choice", "instructions": "Assess only supplied council coverage counts. Missing/conflicting inputs are authoritative. Never predict returns or verify sources.",
                 "criteria": {"needs_data": "Missing, conflicting, or incomplete supplied evidence.", "reviewable": "Coverage permits a provisional manual review, without proving the facts."}},
    "next_check": {"type": "choice", "instructions": "Choose a research follow-up, never a trade or probability.",
                   "criteria": {"verify_sources": "Required evidence or source verification needs attention.", "inspect_disagreement": "Compare the conflicting source/argument references.", "wait_for_outcome": "Future correctness requires a matured independently measured outcome."}},
}


def valid_summary(state):
    keys = {"contract_version", "mode", "observed_count", "usable_count", "missing_families", "conflict_count", "bull_claim_count", "bear_claim_count", "role_count", "judge_abstained"}
    if not isinstance(state, dict) or set(state) != keys or state["contract_version"] != "council-coverage-v1" or state["mode"] != "nvidia":
        return False
    for key, limit in (("observed_count", 8), ("usable_count", 8), ("conflict_count", 8), ("bull_claim_count", 4), ("bear_claim_count", 4), ("role_count", 3)):
        if type(state[key]) is not int or not 0 <= state[key] <= limit:
            return False
    return (state["usable_count"] <= state["observed_count"] and state["role_count"] == 3 and type(state["judge_abstained"]) is bool
            and isinstance(state["missing_families"], list) and len(state["missing_families"]) <= 4
            and all(isinstance(item, str) for item in state["missing_families"])
            and len(set(state["missing_families"])) == len(state["missing_families"])
            and all(item in ("market", "financial", "catalyst", "risk") for item in state["missing_families"]))


def assess_council_summary(state, run_id, client=None):
    result = {"contract_version": "council-jev-v1", "run_id": run_id, "available": False, "coverage": None,
              "next_check": None, "input_tokens": None, "error_code": "not-enabled", "grants_decision_eligibility": False}
    if not development_enabled() or os.getenv("COUNCIL_JEV_DEV_ENABLED") != "true":
        return result
    if not valid_summary(state):
        result["error_code"] = "invalid-summary"
        return result
    from app.jev.client import JevClient
    try:
        if client is None:
            from app.config import settings
            if settings.JEV_BASE_URL.rstrip('/') != 'https://api.typesafe.ai':
                raise ValueError()
        evaluation = (client or JevClient(timeout_sec=10.)).evaluate(state=json.dumps(state, sort_keys=True), questions=QUESTIONS)
        if not evaluation.usable:
            raise ValueError()
        coverage, check = evaluation.answers.get("coverage"), evaluation.answers.get("next_check")
        if not coverage or coverage.type != "choice" or coverage.choice not in QUESTIONS["coverage"]["criteria"] or not check or check.type != "choice" or check.choice not in QUESTIONS["next_check"]["criteria"]:
            raise ValueError()
        result.update(available=True, coverage=coverage.choice, next_check=check.choice, error_code=None)
        if state["missing_families"] or state["usable_count"] < state["observed_count"] or not state["bull_claim_count"] or not state["bear_claim_count"]:
            result.update(coverage="needs_data", next_check="verify_sources")
        if state["conflict_count"]:
            result.update(coverage="needs_data", next_check="inspect_disagreement")
        if type(evaluation.input_tokens) is int and 0 <= evaluation.input_tokens <= 1000000:
            result["input_tokens"] = evaluation.input_tokens
    except Exception:
        result["error_code"] = "assessment-unavailable"
    return result
