from __future__ import annotations

from operator import add
from typing import Annotated, Any, TypedDict


class AgentState(TypedDict, total=False):
    user_query: str
    requested_symbols: list[str]
    market_evidence: dict[str, Any]
    risk_evidence: dict[str, Any]
    synthesis: dict[str, Any]
    sources: Annotated[list[dict[str, Any]], add]
    errors: Annotated[list[str], add]
    trace: Annotated[list[str], add]
    started_at: str
    completed_at: str
