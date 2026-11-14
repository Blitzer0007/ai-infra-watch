"""Offline, developer-labelled council protocol evaluation. Never constructs a provider.

Labels describe frozen fictional proposals, not arbitrary future prose or market
outcomes. Contract rejection, semantic gaps and policy agreement stay separate.
"""
from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.agents.portfolio_council import PortfolioCouncil

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = ROOT / "aitracker-upload/data/eval/council-admission-v1-reference.json"
DEFAULT_SUITE = ROOT / "aitracker-upload/data/eval/council-grounding-v2.json"
VERSION = "council-grounding-eval-v2"
MAX_BYTES = 262144
ROLES = ("bull", "bear", "judge")
FAMILIES = {"market", "financial", "catalyst", "risk"}
Role = Literal["bull", "bear", "judge"]
Preference = Literal["bull", "bear", "balanced", "insufficient"]
AUTHORITY = ("source_authenticity_verified", "forecast_validity_established",
             "grants_decision_eligibility", "changes_allocation", "sends_messages")


def canonical(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate evaluation key")
        result[key] = value
    return result


def read_json(path: Path) -> tuple[bytes, Any]:
    with path.open("rb") as handle:
        raw = handle.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Evaluation input too large")
    try:
        value = json.loads(raw, object_pairs_hook=_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Nonfinite input")))
    except RecursionError:
        raise ValueError("Evaluation nesting too deep") from None
    return raw, value


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Edit(Contract):
    path: list[str | int] = Field(min_length=2, max_length=12)
    value: Any


class Labels(Contract):
    proposal_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    input_edits_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    usable_ids: list[str] = Field(max_length=8)
    missing_families: list[Literal["market", "financial", "catalyst", "risk"]] = Field(max_length=4)
    conflicting_ids: list[str] = Field(max_length=8)
    must_abstain: bool
    input_must_abstain: bool
    expected_status: Literal["complete", "failed", "partial"]
    expected_disposition: Literal["balanced", "insufficient-evidence", "provisional-bull", "provisional-bear"]
    acceptable_judge_preferences: list[Preference] = Field(min_length=1, max_length=4)
    narrative_supported: dict[Role, bool]
    presentation_version: str | None = None
    accepted_summaries: dict[Role, str] | None = None
    accepted_limitations: list[str] | None = None
    rationale: str = Field(min_length=20, max_length=1200)

    @model_validator(mode="after")
    def complete_labels(self):
        if set(self.narrative_supported) != set(ROLES):
            raise ValueError("Every role needs a narrative label")
        for values in (self.usable_ids, self.missing_families, self.conflicting_ids,
                       self.acceptable_judge_preferences):
            if len(values) != len(set(values)):
                raise ValueError("Duplicate evaluation label")
        return self


class Case(Contract):
    id: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    category: str = Field(min_length=1, max_length=64)
    edits: list[Edit] = Field(max_length=32)
    responses: dict[Role, list[dict[str, Any]]]
    labels: Labels

    @model_validator(mode="after")
    def frozen_proposals(self):
        if set(self.responses) != set(ROLES) or any(len(v) != 2 for v in self.responses.values()):
            raise ValueError("Exactly two scripted responses per role required")
        if digest(self.responses) != self.labels.proposal_sha256:
            raise ValueError("Proposal changed without re-labelling")
        if digest([edit.model_dump() for edit in self.edits]) != self.labels.input_edits_sha256:
            raise ValueError("Inputs changed without re-labelling")
        return self


class Suite(Contract):
    version: Literal["council-grounding-cases-v1", "council-grounding-cases-v2"]
    label_origin: Literal["developer-authored-fictional-not-human-independent"]
    base_fixture_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    cases: list[Case] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def unique_cases(self):
        if len({case.id for case in self.cases}) != len(self.cases):
            raise ValueError("Duplicate evaluation case")
        if self.version == "council-grounding-cases-v2" and any(
            case.labels.presentation_version != "council-evidence-summary-v1"
            or set(case.labels.accepted_summaries or {}) != set(ROLES)
            or not case.labels.accepted_limitations for case in self.cases
        ):
            raise ValueError("Controlled presentation needs complete frozen labels")
        return self


def request_for(base: dict, case: Case) -> dict:
    request = copy.deepcopy(base)
    for edit in case.edits:
        if edit.path[0] not in ("packet", "sources"):
            raise ValueError("Only loaded input fields may change")
        target = request
        for key in edit.path[:-1]:
            target = target[key]
        key = edit.path[-1]
        # Replace existing fields only; no executable paths, creation or I/O.
        target[key]
        target[key] = copy.deepcopy(edit.value)
    request["packet"]["run_id"] = "eval:" + case.id
    return request


class ScriptedModel:
    # Exercise the existing NVIDIA-mode branch with a local replay, no transport.
    mode = "nvidia"
    http_attempts = 0

    def __init__(self, responses):
        self.responses = copy.deepcopy(responses)
        self.calls: list[dict] = []

    def complete(self, role, messages, **_kwargs):
        index = sum(call["role"] == role for call in self.calls)
        if index >= 2 or len(self.calls) >= 6:
            raise ValueError("Replay budget exceeded")
        reply = copy.deepcopy(self.responses[role][index])
        self.calls.append({"role": role, "messages": copy.deepcopy(messages), "reply": reply})
        return canonical(reply).decode()


def fraction(numerator: int, denominator: int) -> dict:
    return {"numerator": numerator, "denominator": denominator,
            "rate": numerator / denominator if denominator else None}


def _score(case: Case, result: dict, model: ScriptedModel, request: dict) -> dict:
    labels = case.labels
    quality = result["quality"]
    admission_match = all(set(quality[key]) == set(getattr(labels, key))
                          for key in ("usable_ids", "missing_families", "conflicting_ids"))
    proposed = {call["role"]: call for call in model.calls
                if call["reply"].get("action") in ("conclude", "judge")}
    unsupported_proposed = [role for role in proposed if not labels.narrative_supported[role]]
    unsupported_accepted = [role for role in unsupported_proposed if role in result["roles"]
                            and result["roles"][role]["summary"] == proposed[role]["reply"].get("summary")]
    expected_summaries = labels.accepted_summaries or {
        role: call["reply"].get("summary") for role, call in proposed.items()}
    unlabelled_narratives = [role for role in result["roles"]
                            if result["roles"][role]["summary"] != expected_summaries.get(role)
                            or (labels.accepted_limitations is not None and role != "judge"
                                and result["roles"][role]["limitations"] != labels.accepted_limitations)]
    unsupported_withheld = [role for role in unsupported_proposed if role in result["roles"]
                            and role not in unsupported_accepted and role not in unlabelled_narratives]
    references, grounded_references = 0, 0
    proposed_references, inspected_proposals = 0, 0
    for role in ("bull", "bear"):
        call = proposed.get(role)
        inspected = set()
        if call and len(call["messages"]) == 4:
            tool_result = json.loads(call["messages"][-1]["content"])["tool_result"]
            if isinstance(tool_result, list):
                inspected = {row["evidence_id"] for row in tool_result}
        known = {row["evidence_id"] for row in request["packet"]["evidence"]}
        for claim in call["reply"].get("claims", []) if call else []:
            proposed_references += 1
            inspected_proposals += isinstance(claim, dict) and claim.get("evidence_id") in known & inspected
        for claim in result["roles"].get(role, {}).get("claims", []):
            references += 1
            grounded_references += claim["evidence_id"] in known & inspected
    judge = proposed.get("judge", {}).get("reply", {}).get("preference")
    abstained = result["disposition"] == "insufficient-evidence"
    authority_false = all(result.get(key) is False for key in AUTHORITY)
    expected_match = (admission_match and authority_false and not unlabelled_narratives
                      and (labels.presentation_version is None or result.get("presentation_version") == labels.presentation_version)
                      and result["status"] == labels.expected_status
                      and result["disposition"] == labels.expected_disposition
                      and (not labels.must_abstain or abstained)
                      and result["usage"]["provider_requests"] == 0
                      and result["usage"]["jev_calls"] == 0)
    families_present = {row["family"] for row in request["packet"]["evidence"]}
    return {
        "case_id": case.id, "category": case.category, "case_sha256": digest(case.model_dump()),
        "request_sha256": result["snapshot_id"], "status": result["status"],
        "disposition": result["disposition"], "expected_behavior_match": expected_match,
        "admission_label_match": admission_match, "authority_false": authority_false,
        "must_abstain": labels.must_abstain, "abstained": abstained,
        "input_must_abstain": labels.input_must_abstain,
        "judge_preference": judge,
        "judge_policy_agreement": judge in labels.acceptable_judge_preferences if judge else None,
        "accepted_reference_precision": fraction(grounded_references, references),
        "proposed_reference_precision": fraction(inspected_proposals, proposed_references),
        "unsupported_narrative_proposals": unsupported_proposed,
        "unsupported_narratives_accepted": unsupported_accepted,
        "unsupported_narratives_withheld": unsupported_withheld,
        "unlabelled_accepted_narratives": unlabelled_narratives,
        "completed_roles": sorted(result["roles"]), "usage": result["usage"],
        "baselines": {"always_abstain": True,
                      "family_presence_only": not FAMILIES.issubset(families_present),
                      "admission_only": bool(quality["missing_families"] or quality["conflicting_ids"])},
    }


def run_suite(path: Path = DEFAULT_SUITE) -> dict:
    raw, payload = read_json(path)
    suite = Suite.model_validate(payload)
    fixture_raw, fixture = read_json(FIXTURE)
    if hashlib.sha256(fixture_raw).hexdigest() != suite.base_fixture_sha256:
        raise ValueError("Base fixture changed; review labels before evaluation")
    rows = []
    for case in suite.cases:
        request = request_for(fixture["request"], case)
        model = ScriptedModel(case.responses)
        result = PortfolioCouncil(model, clock=lambda: 0).run_admitted(canonical(request))
        rows.append(_score(case, result, model, request))
    required = [row for row in rows if row["must_abstain"]]
    reviewable = [row for row in rows if not row["must_abstain"]]
    input_required = [row for row in rows if row["input_must_abstain"]]
    input_reviewable = [row for row in rows if not row["input_must_abstain"]]
    preferences = [row for row in rows if row["judge_policy_agreement"] is not None]
    references = [row["accepted_reference_precision"] for row in rows]
    proposals = [row["proposed_reference_precision"] for row in rows]
    baselines = {}
    for name in ("always_abstain", "family_presence_only", "admission_only"):
        baselines[name] = {
            "input_required_abstention_recall": fraction(sum(row["baselines"][name] for row in input_required), len(input_required)),
            "abstention_among_input_reviewable": fraction(sum(row["baselines"][name] for row in input_reviewable), len(input_reviewable)),
        }
    return {
        "version": VERSION, "mode": "scripted-offline-no-provider",
        "suite_sha256": hashlib.sha256(raw).hexdigest(), "base_fixture_sha256": suite.base_fixture_sha256,
        "implementation_sha256": {name: hashlib.sha256(file.read_bytes()).hexdigest() for name, file in {
            "council": ROOT / "aitracker-upload/app/agents/portfolio_council.py",
            "admission": ROOT / "aitracker-upload/app/agents/council_admission.py",
            "evaluator": Path(__file__),
        }.items()},
        "label_origin": suite.label_origin, "case_count": len(rows),
        "expected_behavior": fraction(sum(row["expected_behavior_match"] for row in rows), len(rows)),
        "admission_label_agreement": fraction(sum(row["admission_label_match"] for row in rows), len(rows)),
        "accepted_reference_precision": fraction(sum(r["numerator"] for r in references), sum(r["denominator"] for r in references)),
        "proposed_reference_precision": fraction(sum(r["numerator"] for r in proposals), sum(r["denominator"] for r in proposals)),
        "complete_runs": fraction(sum(row["status"] == "complete" for row in rows), len(rows)),
        "required_abstention_recall": fraction(sum(row["abstained"] for row in required), len(required)),
        "abstention_among_reviewable": fraction(sum(row["abstained"] for row in reviewable), len(reviewable)),
        "judge_policy_agreement": fraction(sum(row["judge_policy_agreement"] for row in preferences), len(preferences)),
        "judge_missing_count": len(rows) - len(preferences),
        "unsupported_narrative_proposal_count": sum(len(row["unsupported_narrative_proposals"]) for row in rows),
        "unsupported_narratives_accepted": sum(len(row["unsupported_narratives_accepted"]) for row in rows),
        "unsupported_narratives_withheld": sum(len(row["unsupported_narratives_withheld"]) for row in rows),
        "unlabelled_accepted_narrative_count": sum(len(row["unlabelled_accepted_narratives"]) for row in rows),
        "provider_requests": sum(row["usage"]["provider_requests"] for row in rows),
        "jev_calls": sum(row["usage"]["jev_calls"] for row in rows),
        "baselines": baselines, "cases": rows,
        "source_authenticity_verified": False, "forecast_validity_established": False,
        "semantic_grounding_established": False,
        "live_model_effectiveness_established": False,
    }
