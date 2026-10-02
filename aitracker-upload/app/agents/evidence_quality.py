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
    """Normalize a tool into a research evidence family.

    Primary company/issuer sources and analyst expectations are intentionally
    separate from generic news and regulatory filings so the research gate can
    reason about provenance instead of treating every source as equivalent.
    """
    name = tool_name.lower()
    if "get_executive_signals" in name or "executive" in name:
        return "executive"
    if "search_web" in name or name.startswith("web."):
        return "web_search"
        if name.startswith("news."):
        return "news"
    if any(token in name for token in ("analyst.", "analyst_", "price_target", "target_price", "consensus", "estimate_revision", "recommendation", "ratings")):
        return "analyst_consensus"
    if any(token in name for token in (
        "investor_relations", "investor-relations", "company.", "companies.",
        "issuer.", "issuer_official", "company_official", "press_release", "press-release", "newsroom", "official.",
        "product_docs", "product-docs", "company_docs", "company-docs",
    )):
        return "issuer_primary"
    if "get_event_study" in name: return "event_study"
    if "get_earnings" in name: return "earnings"
    if name.startswith("filings.") or "sec" in name: return "regulatory_primary"
    if "congress" in name: return "congress"
    if "macro" in name or "risk" in name or "political" in name: return "macro"
    if "forecast" in name or "verification" in name: return "forecast"
    if "portfolio" in name or "holdings" in name: return "portfolio"
    if "quality" in name or "red_team" in name or "red-team" in name: return "quality"
    if "rotation" in name or "relationship" in name: return "relationship"
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

def _record_claim_context(record: dict[str, Any]) -> tuple[str, str]:
    """Extract entity/claim text from the same response record as its status."""
    entity = ""
    claim = ""
    for key, value in record.items():
        if str(key) in ENTITY_KEYS and isinstance(value, str):
            candidate = value.strip()
            if (
                candidate
                and len(candidate) <= 120
                and candidate.upper() not in {"SEC", "EDGAR", "NEWS"}
            ):
                entity = candidate
                break
    for key, value in record.items():
        if str(key) in CLAIM_KEYS and isinstance(value, str):
            candidate = value.strip()
            if candidate and len(candidate) <= 500:
                claim = candidate
                break
    return entity, claim


def _iter_status_records(value: Any):
    """Yield dictionaries that directly contain a lifecycle/status field."""
    if isinstance(value, dict):
        if any(str(key) in STATUS_KEYS for key in value):
            yield value
        for child in value.values():
            yield from _iter_status_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_status_records(child)


def _extract_claims(tool_name: str, output: Any) -> list[dict[str, Any]]:
    family = _family_from_tool(tool_name)
    claims: list[dict[str, Any]] = []
    for record in _iter_status_records(output):
        for key, value in record.items():
            if str(key) not in STATUS_KEYS:
                continue
            status = _normalize_status(value)
            if not status:
                continue
            entity, claim = _record_claim_context(record)
            claims.append({
                "family": family,
                "status": status,
                "entity": entity,
                "claim": claim,
                "path": str(key),
                "tool": tool_name,
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

SOURCE_KEYS = {
    "url", "source_url", "sourceUrl", "link", "html_url", "display_url",
    "accession", "accession_number", "document_id", "documentId", "citation",
}

def _iter_evidence_records(value: Any):
    if isinstance(value, dict):
        keys = {str(key) for key in value.keys()}
        has_identity = bool(keys & (SOURCE_KEYS | {"title", "headline", "name", "summary", "claim", "statement"}))
        if has_identity:
            yield value
        for child in value.values():
            yield from _iter_evidence_records(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_evidence_records(child)

def _record_fingerprint(record: dict[str, Any]) -> str:
    for key in SOURCE_KEYS:
        value = record.get(key)
        if value:
            return "source:" + str(value).strip().lower()
    title = next(
        (str(record.get(key)).strip().lower() for key in ("title", "headline", "name", "summary", "claim", "statement") if record.get(key)),
        "",
    )
    date = next(
        (str(record.get(key)).strip().lower() for key in DATE_KEYS if record.get(key)),
        "",
    )
    entity = next(
        (str(record.get(key)).strip().lower() for key in ENTITY_KEYS if record.get(key)),
        "",
    )
    return "claim:" + "|".join((entity, title, date))

def deduplicate_evidence(calls: list[Any]) -> dict[str, Any]:
    seen: dict[str, dict[str, Any]] = {}
    observed = 0
    for call in calls:
        if not getattr(call, "ok", False):
            continue
        tool = getattr(call, "tool", "")
        family = _family_from_tool(tool)
        for record in _iter_evidence_records(getattr(call, "output", None)):
            fingerprint = _record_fingerprint(record)
            if fingerprint.endswith("claim:||"):
                continue
            observed += 1
            entry = seen.setdefault(fingerprint, {"families": set(), "tools": set()})
            entry["families"].add(family)
            entry["tools"].add(tool)

    duplicates = max(0, observed - len(seen))
    cross_source = sum(
        1
        for entry in seen.values()
        if len(entry["families"]) > 1
    )
    return {
        "observed_records": observed,
        "unique_records": len(seen),
        "duplicates_removed": duplicates,
        "cross_source_duplicates": cross_source,
    }

def citation_coverage(calls: list[Any]) -> dict[str, Any]:
    observed = 0
    cited = 0
    by_family: dict[str, dict[str, int]] = {}
    for call in calls:
        if not getattr(call, "ok", False):
            continue
        family = _family_from_tool(getattr(call, "tool", ""))
        family_entry = by_family.setdefault(family, {"records": 0, "cited": 0})
        for record in _iter_evidence_records(getattr(call, "output", None)):
            if not any(record.get(key) for key in SOURCE_KEYS):
                continue
            observed += 1
            family_entry["records"] += 1
            if any(record.get(key) for key in SOURCE_KEYS if key != "citation") or record.get("citation"):
                cited += 1
                family_entry["cited"] += 1
    return {
        "observed_records": observed,
        "cited_records": cited,
        "coverage": (cited / observed) if observed else None,
        "by_family": by_family,
    }

def enrich_calls(calls: list[Any]) -> list[dict[str, Any]]:
    return [
        {
            "tool": getattr(call, "tool", ""),
            "freshness": normalize_freshness(getattr(call, "tool", ""), getattr(call, "output", None)),
            "citation_coverage": citation_coverage([call]),
        }
        for call in calls if getattr(call, "ok", False)
    ]

__all__ = [
    "normalize_freshness",
    "detect_conflicts",
    "enrich_calls",
    "deduplicate_evidence",
    "citation_coverage",
    "FRESHNESS_WINDOWS_HOURS",
]
