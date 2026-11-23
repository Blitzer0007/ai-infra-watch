"""Fictional, development-only council comparison; no financial accuracy claims."""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from app.agents.council_admission import evaluate, parse_request
from app.agents.portfolio_council import Contract, FictionalCouncilModel, PortfolioCouncil

FIXTURES = Path(__file__).resolve().parents[2] / "data/research/council-benchmark.fictional.json"
ROLES = ("bull", "bear", "judge")
AUTHORITY = ("source_authenticity_verified", "forecast_validity_established",
             "grants_decision_eligibility", "changes_allocation", "sends_messages")
LABEL_SCOPE = ("Conditional declared-input admission and numeric-sign argument selection; "
               "not source truth or future returns.")


class LabelClaim(Contract):
    evidence_id: str = Field(pattern=r"^[A-Za-z0-9_.:-]{1,64}$")
    stance: Literal["support", "challenge"]


class Expected(Contract):
    usable_ids: tuple[str, ...] = Field(max_length=8)
    missing_families: tuple[Literal["market", "financial", "catalyst", "risk"], ...]
    claims: dict[Literal["bull", "bear"], tuple[LabelClaim, ...]]
    judge_must_abstain: bool


class Case(Contract):
    case_id: str = Field(pattern=r"^[a-z][a-z0-9-]{1,63}$")
    request: dict
    expected: Expected

    @property
    def raw(self):
        return json.dumps(self.request, allow_nan=False, separators=(",", ":")).encode()

    @model_validator(mode="after")
    def bound_labels(self):
        packet, _, _ = parse_request(self.raw)
        if packet.symbol != "FICT" or self.request["mode"] != "loaded-v2":
            raise ValueError("Fictional declarations required")
        ids = {row.evidence_id for row in packet.evidence}
        expected = self.expected
        if (set(expected.claims) != {"bull", "bear"}
                or len(set(expected.usable_ids)) != len(expected.usable_ids)
                or not set(expected.usable_ids) <= ids
                or len(set(expected.missing_families)) != len(expected.missing_families)):
            raise ValueError("Unbound labels")
        for claims in expected.claims.values():
            if (len(claims) > 4 or len({c.evidence_id for c in claims}) != len(claims)
                    or any(c.evidence_id not in expected.usable_ids for c in claims)):
                raise ValueError("Unbound claim labels")
        return self


class Suite(Contract):
    contract_version: Literal["council-benchmark-fixtures-v1"]
    fictional_only: Literal[True]
    label_scope: Literal[LABEL_SCOPE]
    cases: tuple[Case, ...] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def unique_cases(self):
        if len({case.case_id for case in self.cases}) != len(self.cases):
            raise ValueError("Duplicate case")
        return self


def load_suite(path=FIXTURES):
    """Only the CLI's bundled suite is selectable; errors never echo fixture bodies."""
    try:
        with Path(path).open("rb") as source:
            raw = source.read(131073)
        if len(raw) > 131072:
            raise ValueError()
        # Reuse strict duplicate-key/non-finite rejection without the per-request size cap.
        from app.agents.portfolio_council import _pairs
        value = json.loads(raw, object_pairs_hook=_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        suite = Suite.model_validate_json(json.dumps(value, allow_nan=False))
        return suite, hashlib.sha256(raw).hexdigest()
    except Exception:
        raise ValueError("Council benchmark fixtures are invalid") from None


def deterministic_baseline(case):
    """Versioned numeric-selection rules; never reads labels or calls an LLM.

    Positive growth/margin/FCF and liabilities/equity below one support the
    conditional bull case; opposite signs/high leverage challenge it. Zero
    growth/margin/FCF and exactly one leverage make no directional selection.
    Bear selections invert stance. This is a test baseline, not a trade rule.
    """
    admission = evaluate(case.raw)
    usable = set(admission["quality"]["usable_ids"])
    claims = {"bull": [], "bear": []}
    for row in case.request["packet"]["evidence"]:
        if row["evidence_id"] not in usable:
            continue
        metric, value = row["metric"], row["value"]
        if metric in ("revenue_growth_pct", "operating_margin_pct", "free_cash_flow_usd"):
            sign = (value > 0) - (value < 0)
        elif metric == "liabilities_equity":
            sign = (value < 1) - (value > 1)
        else:
            continue
        if sign:
            for role in claims:
                support = sign > 0 if role == "bull" else sign < 0
                claims[role].append({"evidence_id": row["evidence_id"],
                                     "stance": "support" if support else "challenge"})
    abstain = bool(admission["quality"]["missing_families"]
                   or admission["quality"]["conflicting_ids"])
    return {"status": "complete", "disposition": "insufficient-evidence",
            "quality": admission["quality"], "usage": {"provider_requests": 0},
            "roles": {**{role: {"claims": rows} for role, rows in claims.items()},
                      "judge": {"preference": "insufficient" if abstain else "balanced"}},
            **dict.fromkeys(AUTHORITY, False)}


def _ratio(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else None


def _observed_total(values):
    if not values or not all(type(value) in (int, float)
                            and math.isfinite(value) and value >= 0 for value in values):
        return None
    total = sum(values)
    return total if math.isfinite(total) else None


def score_case(case, result):
    """Scores selections only, never free-form model prose or future direction."""
    quality = result["quality"]
    usable = set(quality["usable_ids"])
    roles = {}
    for role in ("bull", "bear"):
        actual = result["roles"].get(role, {}).get("claims", [])
        expected = {(row.evidence_id, row.stance) for row in case.expected.claims[role]}
        selected = {(row["evidence_id"], row["stance"]) for row in actual}
        matched = len(selected & expected)
        roles[role] = {
            "completed": role in result["roles"], "claim_count": len(actual),
            "conditional_citation_precision": _ratio(sum(row["evidence_id"] in usable for row in actual), len(actual)),
            "labelled_selection_precision": _ratio(matched, len(actual)),
            "labelled_selection_recall": _ratio(matched, len(expected)),
            "empty_label_respected": not actual if not expected else None,
            "selection_matches_labels": selected == expected,
        }
    preference = result["roles"].get("judge", {}).get("preference")
    abstention = (result["status"] == "complete" and preference == "insufficient"
                  if case.expected.judge_must_abstain else None)
    quality_match = (usable == set(case.expected.usable_ids)
                     and set(quality["missing_families"]) == set(case.expected.missing_families))
    authority = all(result.get(key) is False for key in AUTHORITY)
    return {"case_id": case.case_id, "protocol_completed": result["status"] == "complete",
            "admission_matches_labels": quality_match, "roles": roles,
            "judge": {"completed": preference is not None, "preference": preference,
                      "abstention_required": case.expected.judge_must_abstain,
                      "abstention_matches_label": abstention, "future_winner_accuracy": None},
            "authority_remains_false": authority,
            "all_label_checks_pass": (result["status"] == "complete" and quality_match and authority
                                      and all(row["selection_matches_labels"] for row in roles.values())
                                      and abstention is not False)}


def _telemetry(model):
    """Only fixed adapter metadata; missing cost/usage never becomes zero."""
    def name(value):
        return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_.:/-]{1,160}", value) else None
    def number(value):
        return value if type(value) in (int, float) and math.isfinite(value) and value >= 0 else None
    receipts = []
    for row in model.receipts[:6]:
        receipts.append({"role": row["role"] if row.get("role") in ROLES else None,
            "provider": row["provider"] if row.get("provider") in ("nvidia", "openrouter-free") else None,
            "requested_model": name(row.get("requested_model")), "returned_model": name(row.get("returned_model")),
            "status": row["status"] if row.get("status") in ("response-received", "unavailable") else None,
            **{key: number(row.get(key)) for key in ("latency_ms", "input_tokens", "output_tokens", "reported_cost_usd")}})
    totals = {}
    for key in ("latency_ms", "input_tokens", "output_tokens", "reported_cost_usd"):
        totals[key] = _observed_total([row[key] for row in receipts])
    manifest = {role: {"provider": route["provider"] if route.get("provider") in ("nvidia", "openrouter-free") else None,
                       "model": name(route.get("model"))} for role, route in model.manifest.items() if role in ROLES}
    return {"routes": manifest, "receipts": receipts,
            "observed_provider_attempts": model.http_attempts, "totals": totals}


def run_benchmark(*, case_id=None, live=False):
    suite, digest = load_suite()
    cases = [case for case in suite.cases if case_id is None or case.case_id == case_id]
    if not cases:
        raise ValueError("Unknown council benchmark case")
    if live and (case_id is None or len(cases) != 1):
        raise ValueError("A live trial requires exactly one explicit case")
    output = {"contract_version": "council-benchmark-report-v1", "fixture_sha256": digest,
              "fictional_only": True, "label_scope": LABEL_SCOPE,
              "status": "offline-controls-ready", "live_requested": live,
              "baseline_version": "numeric-selection-v1", "baseline_provider_attempts": 0,
              "deterministic_baseline": [],
              "protocol_fixture_control": [], "candidate": None, "telemetry": None,
              "financial_usefulness_established": False, **dict.fromkeys(AUTHORITY, False)}
    for case in cases:
        output["deterministic_baseline"].append(score_case(case, deterministic_baseline(case)))
        fixture = PortfolioCouncil(FictionalCouncilModel()).run_admitted(case.raw)
        output["protocol_fixture_control"].append(score_case(case, fixture))
    if live:
        # Never load .env/shared settings or instantiate a provider on the offline path.
        from app.agents.council_model import configured_role_model
        model = configured_role_model()
        if model is None:
            output["status"] = "development-configuration-unavailable"
        else:
            result = PortfolioCouncil(model).run_admitted(cases[0].raw)
            output["candidate"] = score_case(cases[0], result)
            output["telemetry"] = _telemetry(model)
            output["status"] = "live-trial-complete" if result["status"] == "complete" else "candidate-unavailable"
    return output


def render_markdown(report):
    """Fixed-format, prose-free comparison safe to save in a private Cloud artifact."""
    lines = ["# Fictional council comparison", "", f"Status: {report['status']}", "",
             "These labels test conditional input handling, not source truth or future returns.", "",
             "| Run | Case | Complete | Admission labels | Bull selections | Bear selections | Required abstention |",
             "| --- | --- | --- | --- | --- | --- | --- |"]
    groups = [("Numeric baseline", report["deterministic_baseline"]),
              ("Protocol fixture", report["protocol_fixture_control"]),
              ("Candidate", [report["candidate"]] if report["candidate"] else [])]
    for name, rows in groups:
        for row in rows:
            flag = lambda v: "not scored" if v is None else "pass" if v else "fail"
            lines.append("| " + " | ".join([name, row["case_id"], flag(row["protocol_completed"]),
                flag(row["admission_matches_labels"]), flag(row["roles"]["bull"]["selection_matches_labels"]),
                flag(row["roles"]["bear"]["selection_matches_labels"]),
                flag(row["judge"]["abstention_matches_label"])]) + " |")
    lines += ["", "Live candidate: " + ("attempted on fictional inputs only" if report["candidate"] else "not evaluated")]
    if report["telemetry"] is not None:
        lines += ["", "| Role | Provider | Requested model | Attempts | Observed latency sum (ms) | Input tokens | Output tokens | Reported cost (USD) |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |"]
        for role in ROLES:
            route = report["telemetry"]["routes"].get(role, {})
            receipts = [row for row in report["telemetry"]["receipts"] if row["role"] == role]
            values = [_observed_total([row[key] for row in receipts])
                      for key in ("latency_ms", "input_tokens", "output_tokens", "reported_cost_usd")]
            lines.append("| " + " | ".join([role, route.get("provider") or "unknown", route.get("model") or "unknown", str(len(receipts)),
                *["unknown" if value is None else str(value) for value in values]]) + " |")
        lines += ["", "Missing usage/cost is unknown. Provider-reported cost is not a verified bill."]
    lines += ["", "Financial usefulness, forecast validity and decision eligibility remain unestablished.", ""]
    return "\n".join(lines)
