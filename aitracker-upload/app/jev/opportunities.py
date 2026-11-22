"""Bounded coverage summaries only; no positions, raw evidence or credentials."""
from datetime import datetime
import re
from typing import Any

FIELDS = {"schemaVersion", "symbol", "ruleVersion", "dataEligibility", "status", "asOf", "missingInputCount", "evidenceReferenceCount", "supportingReasonCount", "adverseReasonCount"}


def validate_opportunity_state(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError("Invalid opportunity coverage summary")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1:
        raise ValueError("Invalid opportunity schema")
    if not isinstance(value["symbol"], str) or not re.fullmatch(r"[A-Z][A-Z0-9.-]{0,14}", value["symbol"]):
        raise ValueError("Invalid opportunity symbol")
    if not isinstance(value["ruleVersion"], str) or not re.fullmatch(r"[a-zA-Z0-9._-]{1,80}", value["ruleVersion"]):
        raise ValueError("Invalid opportunity rule version")
    if value["dataEligibility"] not in ("eligible", "insufficient", "conflicting") or value["status"] not in ("needs-data", "research-candidate", "monitor"):
        raise ValueError("Invalid opportunity coverage state")
    for key in ("missingInputCount", "evidenceReferenceCount", "supportingReasonCount", "adverseReasonCount"):
        if type(value[key]) is not int or not 0 <= value[key] <= 100:
            raise ValueError("Invalid opportunity count")
    stamp = value["asOf"]
    if stamp is not None:
        if not isinstance(stamp, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})", stamp):
            raise ValueError("Invalid opportunity observation time")
        try:
            datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        except ValueError:
            raise ValueError("Invalid opportunity observation time") from None
    return {key: value[key] for key in sorted(FIELDS)}


OPPORTUNITY_QUESTIONS = {
    "next_check": {"type": "choice", "instructions": "Choose the next evidence-coverage check from this summary only. Do not infer returns, source authenticity or trading eligibility.", "criteria": {
        "gather_evidence": "Evidence or required inputs are missing; gather dated independent evidence.",
        "resolve_conflicts": "The supplied summary declares conflicting inputs; resolve them before conclusions.",
        "inspect_sources": "Inspect the supplied references; counts alone do not verify sources.",
        "monitor": "Only bounded review is supported by the supplied coverage summary; no return or trade prediction.",
    }},
    "context": {"type": "choice", "instructions": "Describe coverage, not investment merit. Missing inputs or no references mean insufficient evidence; declared conflicts mean conflicting evidence.", "criteria": {
        "insufficient": "Coverage is incomplete or has no evidence references.",
        "conflicting": "The supplied coverage declarations conflict.",
        "bounded_review": "The summary supports only a bounded evidence review, not source verification or prediction.",
    }},
}
