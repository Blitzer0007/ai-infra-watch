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
    "analyst_consensus": (24, 24 * 7),
    "congress": (24 * 30, 24 * 180),
    "macro": (24 * 7, 24 * 30),
    "executive": (48, 24 * 7),
    "web_search": (72, 24 * 14),
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