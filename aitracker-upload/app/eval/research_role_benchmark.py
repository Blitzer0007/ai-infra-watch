"""Authored fictional priority coverage, not independent financial validation."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from app.agents.portfolio_council import Contract, _pairs
from app.agents.research_role_agent import (
    FAMILIES, REQUIRES_CITATION, ROLES, FictionalResearchRoleModel, ResearchRoleAgent,
)
from app.agents.research_role_review import AUTHORITY, research_role_review
from app.eval.council_benchmark import load_suite, _ratio
from app.eval.research_role_probe import run_probe

LABELS = Path(__file__).resolve().parents[2] / "data/research/research-role-priorities.fictional.json"
PRIORITIES = {
    "company": ("FINANCIAL_INPUTS_MISSING", "RISK_INPUTS_MISSING", "REVIEW_NEGATIVE_CASH_FLOW",
                "REVIEW_ZERO_CASH_FLOW", "REVIEW_CASH_FLOW_CONTEXT", "REVIEW_GROWTH_CONTEXT",
                "REVIEW_LEVERAGE_CONTEXT", "VERIFY_ORIGINAL_FILINGS"),
    "catalyst": ("EVENT_CONFIRMATION_REQUIRED", "REVIEW_EVENT_TIMING", "VERIFY_EVENT_SOURCE"),
    "daily": ("RECONCILE_CONFLICTING_INPUTS", "FILL_FINANCIAL_COVERAGE", "FILL_RISK_COVERAGE",
              "FILL_CATALYST_COVERAGE", "REFRESH_MARKET_EVIDENCE", "CHECK_SOURCE_AUTHENTICITY",
              "RECORD_REVIEW_QUESTIONS"),
}
LABEL_SCOPE = "Authored fictional review-question priorities; not source truth, financial usefulness or returns."


class PriorityCase(Contract):
    case_id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,63}$")
    request_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    roles: dict[Literal["company", "catalyst", "daily"], tuple[str, ...]]

    @model_validator(mode="after")
    def bounded_priorities(self):
        if set(self.roles) != set(ROLES):
            raise ValueError("All role labels required")
        for role, codes in self.roles.items():
            if len(codes) > 3 or len(set(codes)) != len(codes) or not set(codes) <= set(PRIORITIES[role]):
                raise ValueError("Invalid priority labels")
        return self


class PrioritySuite(Contract):
    contract_version: Literal["research-role-priorities-v1"]
    fictional_only: Literal[True]
    label_scope: Literal[LABEL_SCOPE]
    independent_review_completed: Literal[False]
    holdout_validation_completed: Literal[False]
    cases: tuple[PriorityCase, ...] = Field(min_length=1, max_length=12)


def load_priorities(cases, path=LABELS):
    try:
        with Path(path).open("rb") as source:
            raw = source.read(16385)
        if len(raw) > 16384:
            raise ValueError()
        value = json.loads(raw, object_pairs_hook=_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        labels = PrioritySuite.model_validate_json(json.dumps(value, allow_nan=False))
        by_id = {row.case_id: row for row in labels.cases}
        if len(by_id) != len(labels.cases) or set(by_id) != {case.case_id for case in cases}:
            raise ValueError()
        if any(by_id[case.case_id].request_sha256 != hashlib.sha256(case.raw).hexdigest() for case in cases):
            raise ValueError()
        return by_id, hashlib.sha256(raw).hexdigest()
    except Exception:
        raise ValueError("Research priority labels are invalid") from None


def bounded_baseline(raw):
    """Versioned fixed priority order; never reads labels or provider settings.

    Same three-code/four-citation output cap as the agent. This deterministic
    program directly reads admitted loaded inputs; it does not simulate tools.
    """
    base = research_role_review(raw)
    packet = json.loads(raw)["packet"]
    evidence = {row["evidence_id"]: row for row in packet["evidence"]}
    roles = {}
    for role in ROLES:
        allowed = base["roles"][role]
        codes = [code for code in PRIORITIES[role] if code in allowed["review_codes"]][:3]
        citations = []
        for code in codes:
            metric = REQUIRES_CITATION.get(code)
            if metric:
                found = next((key for key in allowed["evidence_ids"]
                              if evidence[key]["metric"] == metric or evidence[key]["family"] == metric), None)
                if found and found not in citations:
                    citations.append(found)
        roles[role] = {"input_status": allowed["status"], "review_codes": codes, "evidence_ids": citations}
    return {"run_id": base["run_id"], "request_sha256": base["request_sha256"], "symbol": base["symbol"],
            "assessed_at": base["assessed_at"], "horizon_months": base["horizon_months"],
            "scope": "single-symbol-frozen-snapshot", "status": "complete", "roles": roles,
            "selection_is_exhaustive": False, "usage": {"model_calls": 0, "tool_calls": 0, "provider_requests": 0},
            **dict.fromkeys(AUTHORITY, False)}


def score_priorities(case, labels, result, *, deterministic=False):
    """Only controlled IDs/codes/counts leave this scorer; no model prose/raw data."""
    base = research_role_review(case.raw)
    usage = result.get("usage", {})
    safe_usage = {key: usage.get(key) for key in ("model_calls", "tool_calls", "provider_requests")} if isinstance(usage, dict) else {}
    counts_valid = all(type(safe_usage.get(key)) is int and 0 <= safe_usage[key] <= limit
                       for key, limit in (("model_calls", 6), ("tool_calls", 3)))
    counts_valid = counts_valid and (safe_usage.get("provider_requests") is None or
                    type(safe_usage["provider_requests"]) is int and 0 <= safe_usage["provider_requests"] <= safe_usage["model_calls"])
    bound = (counts_valid and all(result.get(key) == base[key] for key in
                 ("run_id", "request_sha256", "symbol", "assessed_at", "horizon_months"))
             and result.get("request_sha256") == labels.request_sha256
             and result.get("scope") == "single-symbol-frozen-snapshot"
             and result.get("selection_is_exhaustive") is False
             and all(result.get(key) is False for key in AUTHORITY))
    by_id = {row["evidence_id"]: row for row in case.request["packet"]["evidence"]}
    actual_roles = result.get("roles", {})
    bound = bound and isinstance(actual_roles, dict) and set(actual_roles) <= set(ROLES)
    output = {}
    for role in ROLES:
        allowed, target = base["roles"][role], set(labels.roles[role])
        row = actual_roles.get(role) if bound else None
        codes = row.get("review_codes") if isinstance(row, dict) else None
        ids = row.get("evidence_ids") if isinstance(row, dict) else None
        def valid_list(items, maximum, options, minimum=0):
            return (isinstance(items, list) and minimum <= len(items) <= maximum
                    and all(isinstance(item, str) and item in options for item in items)
                    and len(set(items)) == len(items))
        valid = (isinstance(row, dict) and set(row) == {"input_status", "review_codes", "evidence_ids"}
                 and row["input_status"] == allowed["status"]
                 and valid_list(codes, 3, allowed["review_codes"], 1)
                 and valid_list(ids, 4, allowed["evidence_ids"]))
        inspected = set()
        trace = result.get("trace", [])
        if not deterministic and isinstance(trace, list):
            for step in trace:
                if isinstance(step, dict) and step.get("role") == role and step.get("action") == "inspect" and step.get("status") == "ok":
                    values = step.get("evidence_ids")
                    scoped = [key for key, value in by_id.items() if value["family"] in FAMILIES[role]]
                    if valid_list(values, 8, scoped, 1):
                        inspected.update(values)
        if valid and not deterministic:
            valid = set(ids) <= inspected
        supported, grounded = set(), 0
        if valid:
            for code in codes:
                metric = REQUIRES_CITATION.get(code)
                if not metric or any(by_id[key]["metric"] == metric or by_id[key]["family"] == metric for key in ids):
                    supported.add(code)
                    if metric:
                        grounded += 1
        matched = supported & target
        returned = bound and row is not None
        output[role] = {"returned": returned, "selection_contract_valid": bool(valid and len(supported) == len(codes)),
            "selected_count": len(codes) if valid else None,
            "priority_count": len(target), "matched_priority_count": len(matched),
            "missing_priority_codes": sorted(target - matched),
            "priority_recall": _ratio(len(matched), len(target)) if valid else None,
            "numeric_context_support": _ratio(grounded, sum(code in REQUIRES_CITATION for code in codes)) if valid else None,
            "all_priority_checks_pass": bool(valid and matched == target and len(supported) == len(codes)) if target else None}
    complete = bound and result.get("status") == "complete" and set(actual_roles) == set(ROLES)
    return {"case_id": case.case_id, "request_bound": bound, "run_completed": complete,
            "usage": safe_usage if counts_valid else None,
            "roles": output, "all_priority_checks_pass": bool(complete and all(row["all_priority_checks_pass"] for row in output.values()))}


def run_priority_benchmark(*, case_id=None, live=False):
    if live and case_id is None:
        raise ValueError("One explicit fictional case is required")
    suite, fixture_digest = load_suite()
    labels, label_digest = load_priorities(suite.cases)
    cases = [case for case in suite.cases if case_id is None or case.case_id == case_id]
    if not cases:
        raise ValueError("Unknown fictional case")
    report = {"contract_version": "research-role-priority-report-v1", "fictional_only": True,
              "fixture_sha256": fixture_digest, "labels_sha256": label_digest,
              "label_scope": LABEL_SCOPE, "independent_review_completed": False,
              "holdout_validation_completed": False, "financial_usefulness_established": False,
              "baseline_version": "bounded-role-priorities-v1", "live_requested": live,
              "status": "offline-controls-ready", "baseline": [], "protocol_fixture_control": [],
              "candidate": None, "telemetry": None, **dict.fromkeys(AUTHORITY, False)}
    for case in cases:
        report["baseline"].append(score_priorities(case, labels[case.case_id], bounded_baseline(case.raw), deterministic=True))
        fixture = ResearchRoleAgent(FictionalResearchRoleModel()).run(case.raw)
        report["protocol_fixture_control"].append(score_priorities(case, labels[case.case_id], fixture))
    if live:
        # Reuse the existing one-case, dedicated-development, six-call probe.
        probe = run_probe(case_id=case_id, live=True)
        report["telemetry"] = probe["telemetry"]
        report["status"] = probe["status"]
        if probe["agent"] is not None:
            report["candidate"] = score_priorities(cases[0], labels[case_id], probe["agent"])
            if report["status"] == "live-trial-complete" and not report["candidate"]["all_priority_checks_pass"]:
                report["status"] = "candidate-priorities-not-met"
    return report


def render_priorities(report):
    lines = ["# Fictional research-role priority comparison", "", f"Status: {report['status']}", "",
             "Authored calibration labels only; independent review and holdout validation are pending.",
             "Same output cap: three codes/four citations per role. Deterministic code reads admitted loaded inputs directly.", "",
             "| Run | Case | Complete | Company priorities | Catalyst priorities | Daily priorities |",
             "| --- | --- | --- | --- | --- | --- |"]
    for name, rows in (("Bounded baseline", report["baseline"]), ("Protocol fixture", report["protocol_fixture_control"]),
                       ("Candidate", [report["candidate"]] if report["candidate"] else [])):
        for row in rows:
            counts = [f"{row['roles'][role]['matched_priority_count']}/{row['roles'][role]['priority_count']}"
                      if row['roles'][role]['priority_recall'] is not None else "not scored" for role in ROLES]
            lines.append("| " + " | ".join([name, row["case_id"], "yes" if row["run_completed"] else "no", *counts]) + " |")
    lines += ["", "Counts show authored priority coverage, not financial accuracy. Zero targets or missing roles are unscored, not 100%.",
              "Protocol completion alone is not priority acceptance. Failed/partial runs cannot pass the case.",
              "Offline controls use zero provider requests. Live candidate: " + ("attempted on one fictional case" if report["candidate"] else "not evaluated") + "."]
    if report["telemetry"] is not None:
        total = report["telemetry"]["totals"]
        lines += ["", "Candidate provider attempts: " + str(report["telemetry"]["observed_provider_attempts"]),
                  "Candidate latency sum (ms): " + ("unknown" if total["latency_ms"] is None else str(total["latency_ms"])),
                  "Provider-reported cost (USD): " + ("unknown" if total["reported_cost_usd"] is None else str(total["reported_cost_usd"])),
                  "Missing usage/cost remains unknown; reported cost is not a verified bill."]
    lines += ["", "Source authenticity, financial usefulness, forecast validity and decision eligibility remain unestablished.", ""]
    return "\n".join(lines)
