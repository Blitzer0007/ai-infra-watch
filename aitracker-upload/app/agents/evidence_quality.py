"""Evidence freshness normalization and conservative cross-source conflict detection.

This module is deterministic by design. It enriches retrieved MCP evidence before
Jev sees it, so stale data and genuine contradictions are explicit inputs rather
than hidden model judgments.
"""
from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any

FRESHNESS_WINDOWS_HOURS: dict[str, tuple[float, float]] = {
    "market": (24, 72),
    "news": (72, 24 * 14),
    "sec": (24 * 30, 24 * 90),
    "earnings": (24 * 14, 24 * 90),
    "event_study": (24 * 90, 24 * 365),
    "congress": (24 * 30, 24 * 180),
    "macro": (24 * 7, 24 * 30),
    "default": (24 * 7, 24 * 30),
}

DATE_KEYS = {
    "published_at", "publishedAt", "published", "date", "datetime", "timestamp",
    "created_at", "createdAt", "updated_at", "updatedAt", "filing_date",
    "filingDate", "filed_at", "filedAt", "event_date", "eventDate",
}

STATUS_KEYS = {
    "status", "contract_status", "contractStatus", "event_status", "eventStatus",
    "agreement_status", "agreementStatus", "state", "phase",
}

ENTITY_KEYS = {
    "symbol", "ticker", "company", "issuer", "entity", "counterparty",
    "name", "title",
}

CLAIM_KEYS = {
    "claim", "statement", "finding", "summary", "headline", "description",
    "text", "content", "status",
}

POSITIVE_STATUS = {
    "announced": "announced", "announce": "announced",
    "signed": "signed", "executed": "signed",
    "active": "active", "effective": "active", "completed": "completed",
    "awarded": "awarded", "won": "awarded",
    "confirmed": "confirmed", "approved": "approved",
}

NEGATIVE_STATUS = {
    "delayed": "delayed", "delay": "delayed", "postponed": "delayed",
    "cancelled": "cancelled", "canceled": "cancelled",
    "terminated": "terminated", "termination": "terminated",
    "withdrawn": "withdrawn", "rejected": "rejected",
    "suspended": "suspended", "paused": "suspended",
}

CONFLICT_PAIRS = {
    frozenset({"announced", "cancelled"}),
    frozenset({"announced", "terminated"}),
    frozenset({"signed", "cancelled"}),
    frozenset({"signed", "terminated"}),
    frozenset({"active", "cancelled"}),
    frozenset({"active", "terminated"}),
    frozenset({"awarded", "cancelled"}),
    frozenset({"awarded", "terminated"}),
    frozenset({"approved", "rejected"}),
    frozenset({"approved", "withdrawn"}),
    frozenset({"confirmed", "rejected"}),
}

def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, (int, float)):
        try:
            dt = datetime.fromtimestamp(value / 1000 if value > 10_000_000_000 else value, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    elif isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(raw)
        except ValueError:
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y"):
                try:
                    dt = datetime.strptime(raw, fmt)
                    break
                except ValueError:
                    continue
            else:
                return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _walk(value: Any, path: str = ""):
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}" if path else str(key)
            yield child_path, key, child
            yield from _walk(child, child_path)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, f"{path}[{index}]")

def _latest_date(value: Any) -> datetime | None:
    dates: list[datetime] = []
    for _, key, child in _walk(value):
        if str(key) in DATE_KEYS:
            parsed = _parse_datetime(child)
            if parsed:
                dates.append(parsed)
    return max(dates) if dates else None

def _family_from_tool(tool_name: str) -> str:
    name = tool_name.lower()
    if name.startswith("news."): return "news"
    if "get_event_study" in name: return "event_study"
    if "get_earnings" in name: return "earnings"
    if name.startswith("filings.") or "sec" in name: return "sec"
    if "congress" in name: return "congress"
    if "macro" in name or "risk" in name: return "macro"
    if any(token in name for token in (".get_quote", ".get_quotes", ".get_snapshot")): return "market"
    return name.split(".", 1)[0] if "." in name else "default"

def normalize_freshness(tool_name: str, output: Any, now: datetime | None = None) -> dict[str, Any]:
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    family = _family_from_tool(tool_name)
    latest = _latest_date(output)
    fresh_h, aging_h = FRESHNESS_WINDOWS_HOURS.get(family, FRESHNESS_WINDOWS_HOURS["default"])
    if latest is None:
        return {
            "family": family, "status": "UNKNOWN", "age_hours": None,
            "observed_at": None, "fresh_within_hours": fresh_h,
            "aging_within_hours": aging_h,
        }
    age_hours = max(0.0, (now - latest).total_seconds() / 3600.0)
    status = "FRESH" if age_hours <= fresh_h else "AGING" if age_hours <= aging_h else "STALE"
    return {
        "family": family, "status": status, "age_hours": round(age_hours, 2),
        "observed_at": latest.isoformat(), "fresh_within_hours": fresh_h,
        "aging_within_hours": aging_h,
    }

def _normalize_status(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = re.sub(r"[^a-z0-9 ]+", " ", value.lower()).strip()
    for raw, normalized in {**POSITIVE_STATUS, **NEGATIVE_STATUS}.items():
        if re.search(rf"\b{re.escape(raw)}\b", text):
            return normalized
    return None

def _extract_claims(tool_name: str, output: Any) -> list[dict[str, Any]]:
    family = _family_from_tool(tool_name)
    claims: list[dict[str, Any]] = []
    for path, key, value in _walk(output):
        if str(key) not in STATUS_KEYS:
            continue
        status = _normalize_status(value)
        if not status:
            continue
        parts = path.split(".")
        parent: dict[str, Any] = output
        # Recover a nearby entity without requiring a fixed response schema.
        entity = ""
        for _, pkey, pvalue in _walk(output):
            if str(pkey) in ENTITY_KEYS and isinstance(pvalue, str):
                candidate = pvalue.strip()
                if candidate and len(candidate) <= 120:
                    entity = candidate
                    if candidate.upper() in {"SEC", "EDGAR", "NEWS"}:
                        continue
                    break
        claim = ""
        for _, pkey, pvalue in _walk(output):
            if str(pkey) in CLAIM_KEYS and isinstance(pvalue, str):
                candidate = pvalue.strip()
                if candidate and len(candidate) <= 500:
                    claim = candidate
                    break
        claims.append({
            "family": family, "status": status, "entity": entity,
            "claim": claim, "path": path, "tool": tool_name,
        })
    return claims

def detect_conflicts(calls: list[Any]) -> dict[str, Any]:
    """Find conservative same-claim contradictions across successful calls.

    Different lifecycle stages (e.g. signed then implementation delayed) are
    not automatically conflicts unless their normalized statuses form a known
    incompatible pair. Only fresh/aging evidence participates; stale evidence
    is retained as context but cannot trigger a conflict by itself.
    """
    claims: list[dict[str, Any]] = []
    for call in calls:
        if not getattr(call, "ok", False):
            continue
        output = getattr(call, "output", None)
        freshness = normalize_freshness(getattr(call, "tool", ""), output)
        if freshness["status"] == "STALE":
            continue
        claims.extend(_extract_claims(getattr(call, "tool", ""), output))

    conflicts: list[dict[str, Any]] = []
    for index, left in enumerate(claims):
        for right in claims[index + 1:]:
            if left["status"] == right["status"]:
                continue
            pair = frozenset({left["status"], right["status"]})
            if pair not in CONFLICT_PAIRS:
                continue
            if left["entity"] and right["entity"] and left["entity"].lower() != right["entity"].lower():
                continue
            conflicts.append({
                "type": "CONTRADICTORY_STATUS",
                "entity": left["entity"] or right["entity"],
                "left": left,
                "right": right,
                "resolution": "investigate",
            })
    unique: dict[str, dict[str, Any]] = {}
    for conflict in conflicts:
        key = repr((conflict["entity"], conflict["left"]["status"], conflict["right"]["status"], conflict["left"]["tool"], conflict["right"]["tool"]))
        unique[key] = conflict
    return {
        "detected": bool(unique),
        "count": len(unique),
        "items": list(unique.values()),
        "eligible_claims": len(claims),
    }

def enrich_calls(calls: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "tool": getattr(call, "tool", ""),
            "freshness": normalize_freshness(getattr(call, "tool", ""), getattr(call, "output", None)),
        }
        for call in calls if getattr(call, "ok", False)
    ]

__all__ = ["normalize_freshness", "detect_conflicts", "enrich_calls", "FRESHNESS_WINDOWS_HOURS"]
