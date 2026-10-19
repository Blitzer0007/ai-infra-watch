"""Strict validators for exported historical-data evidence.

These helpers validate provenance fields and chronology; they do not authenticate
a vendor's claims. Production evidence must include the source records themselves.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable


def _timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing timestamp: {field}")
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid timestamp: {field}") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"Timestamp must include timezone: {field}")
    return parsed


def validate_price_evidence(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Reject missing provenance, unadjusted prices, and look-ahead observations."""
    materialized = list(rows)
    if not materialized:
        return {"status": "BLOCKED", "checked": 0, "errors": ["No historical price evidence supplied."]}

    errors: list[str] = []
    for index, row in enumerate(materialized):
        prefix = f"row[{index}]"
        for field in ("symbol", "date", "source", "source_url"):
            if not isinstance(row.get(field), str) or not row[field].strip():
                errors.append(f"{prefix}: missing {field}")
        if row.get("adjusted") is not True:
            errors.append(f"{prefix}: adjusted price semantics are not verified")
        try:
            available_at = _timestamp(row.get("available_at"), f"{prefix}.available_at")
            cutoff = _timestamp(row.get("decision_cutoff"), f"{prefix}.decision_cutoff")
            observation_at = _timestamp(row.get("date"), f"{prefix}.date")
            if available_at > cutoff:
                errors.append(f"{prefix}: observation was not available by the decision cutoff")
            if observation_at > cutoff:
                errors.append(f"{prefix}: observation timestamp is after the decision cutoff")
        except ValueError as exc:
            errors.append(str(exc))

    return {
        "status": "PASS" if not errors else "FAIL",
        "checked": len(materialized),
        "errors": errors,
    }


def validate_universe_membership(rows: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Require sourced, effective-dated membership evidence for each symbol/date."""
    materialized = list(rows)
    if not materialized:
        return {"status": "BLOCKED", "checked": 0, "errors": ["No point-in-time universe membership supplied."]}

    errors: list[str] = []
    for index, row in enumerate(materialized):
        prefix = f"membership[{index}]"
        for field in ("symbol", "source", "source_url"):
            if not isinstance(row.get(field), str) or not row[field].strip():
                errors.append(f"{prefix}: missing {field}")
        if row.get("status") != "verified":
            errors.append(f"{prefix}: membership status is not verified")
        try:
            effective_from = _timestamp(row.get("effective_from"), f"{prefix}.effective_from")
            effective_to_raw = row.get("effective_to")
            effective_to = _timestamp(effective_to_raw, f"{prefix}.effective_to") if effective_to_raw else None
            as_of = _timestamp(row.get("as_of"), f"{prefix}.as_of")
            if effective_from > as_of:
                errors.append(f"{prefix}: membership begins after the requested as-of date")
            if effective_to and as_of > effective_to:
                errors.append(f"{prefix}: membership had ended by the requested as-of date")
        except ValueError as exc:
            errors.append(str(exc))

    return {
        "status": "PASS" if not errors else "FAIL",
        "checked": len(materialized),
        "errors": errors,
    }
