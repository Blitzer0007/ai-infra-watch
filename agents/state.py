from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    user_query: str
    requested_symbols: list[str]
    market_evidence: dict[str, Any]
    risk_evidence: dict[str, Any]
    synthesis: dict[str, Any]
    sources: list[dict[str, Any]]
    errors: list[str]
    trace: list[str]
    started_at: str
    completed_at: str
