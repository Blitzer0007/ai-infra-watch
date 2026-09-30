"""Evidence provenance, freshness and deterministic conflict helpers."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any


FRESHNESS_WINDOWS_SECONDS = {
    "market": 15 * 60,
    "news": 24 * 60 * 60,
    "sec": 14 * 24 * 60 * 60,
    "earnings": 7 * 24 * 60 * 60,
    "event_study": 30 * 24 * 60 * 60,
    "congress": 30 * 24 * 60 * 60,
    "macro": 7 * 24 * 60 * 60,
}


def _parse_date(value: Any) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        match = re.search(r"\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b", text)
        if not match:
            return None
        parsed = datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _family(tool: str) -> str:
    name = tool.lower()
    if name.startswith("news."):
        return "news"
    if "event_study" in name:
        return "event_study"
    if "earnings" in name:
        return "earnings"
    if name.startswith("filings."):
        return "sec"
    if "congress" in name:
        return "congress"
    if "macro" in name or "risk" in name:
        return "macro"
    if any(token in name for token in (".get_quote", ".get_quotes", ".get_snapshot")):
        return "market"
    return name.split(".", 1)[0] if "." in name else name


def _published_at(output: Any) -> Any:
    if isinstance(output, dict):
        for key in ("publishedAt", "published_at", "date", "filingDate", "filing_date", "asOf", "as_of", "timestamp"):
            if output.get(key):
                return output[key]
        for key in ("articles", "items", "results", "events", "filings", "data"):
            value = output.get(key)
            if isinstance(value, list) and value:
                dates = [_published_at(item) for item in value]
                dates = [d for d in dates if d]
                return max(dates, key=lambda d: _parse_date(d) or datetime.min.replace(tzinfo=timezone.utc)) if dates else None
            if isinstance(value, dict):
                found = _published_at(value)
                if found:
                    return found
    if isinstance(output, list):
        dates = [_published_at(item) for item in output]
        dates = [d for d in dates if d]
        return max(dates, key=lambda d: _parse_date(d) or datetime.min.replace(tzinfo=timezone.utc)) if dates else None
    return None


def normalize_evidence(calls: list[Any]) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    items: list[dict[str, Any]] = []
    for call in calls:
        if not getattr(call, "ok", False):
            continue
        family = _family(getattr(call, "tool", "unknown"))
        published = _published_at(getattr(call, "output", None))
        published_dt = _parse_date(published)
        age = max(0, int((now - published_dt).total_seconds())) if published_dt else None
        window = FRESHNESS_WINDOWS_SECONDS.get(family)
        stale = bool(age is not None and window is not None and age > window)
        output = getattr(call, "output", None)
        source = None
        provider = None
        if isinstance(output, dict):
            source = output.get("source") or output.get("sourceType") or output.get("provider")
            provider = output.get("provider")
        items.append({
            "tool": call.tool,
            "family": family,
            "source": source,
            "provider": provider,
            "retrievedAt": now.isoformat(),
            "publishedAt": published,
            "freshnessSeconds": age,
            "freshnessWindowSeconds": window,
            "stale": stale,
        })
    return items


_STATUS_PATTERNS = {
    "active": re.compile(r"\b(active|effective|signed|entered into|announced|awarded|approved|completed|in force)\b", re.I),
    "delayed": re.compile(r"\b(delayed|postponed|paused|deferred|slowed)\b", re.I),
    "terminated": re.compile(r"\b(terminated|cancelled|canceled|ended|rescinded|withdrawn)\b", re.I),
    "rejected": re.compile(r"\b(rejected|denied|blocked|halted)\b", re.I),
}


def _claim_key(text: str) -> str | None:
    lower = text.lower()
    if not any(word in lower for word in ("contract", "agreement", "deal", "order", "partnership")):
        return None
    ticker = None
    ticker_match = re.search(r"\b[A-Z]{1,5}\b", text)
    if ticker_match:
        ticker = ticker_match.group(0)
    subject = "contract"
    if "partnership" in lower:
        subject = "partnership"
    elif "order" in lower:
        subject = "order"
    return f"{ticker or 'unknown'}:{subject}"


def _status(text: str) -> str | None:
    matches = [name for name, pattern in _STATUS_PATTERNS.items() if pattern.search(text)]
    if len(matches) == 1:
        return matches[0]
    return None


def detect_conflicts(calls: list[Any]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for call in calls:
        if not getattr(call, "ok", False):
            continue
        raw = getattr(call, "output", None)
        text = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, default=str)
        key = _claim_key(text)
        status = _status(text)
        if not key or not status:
            continue
        grouped.setdefault(key, []).append({
            "tool": call.tool,
            "family": _family(call.tool),
            "status": status,
            "claim": text[:1000],
        })

    conflicts: list[dict[str, Any]] = []
    opposites = {
        frozenset(("active", "delayed")),
        frozenset(("active", "terminated")),
        frozenset(("active", "rejected")),
        frozenset(("approved", "rejected")),
    }
    for key, claims in grouped.items():
        statuses = {item["status"] for item in claims}
        if any(pair.issubset(statuses) for pair in opposites):
            conflicts.append({
                "claimKey": key,
                "status": "CONFLICT",
                "severity": "material",
                "needsVerification": True,
                "claims": claims,
            })
    return conflicts


def evidence_health(calls: list[Any]) -> dict[str, Any]:
    freshness = normalize_evidence(calls)
    conflicts = detect_conflicts(calls)
    return {
        "freshness": freshness,
        "staleCount": sum(1 for item in freshness if item["stale"]),
        "conflicts": conflicts,
        "conflictCount": len(conflicts),
        "hasMaterialConflict": any(item["severity"] == "material" for item in conflicts),
    }
