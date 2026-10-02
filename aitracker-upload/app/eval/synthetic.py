"""Synthetic evaluation case generation from the live MCP catalog.

The generator is deterministic and dependency-light. It turns the currently
available tool schemas into a coverage matrix, so new MCP tools automatically
produce evaluation cases instead of relying on a hand-maintained list.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from app.mcp_client.client import ToolInfo


@dataclass(frozen=True)
class SyntheticCase:
    id: str
    category: str
    question: str
    expected_family: str
    expected_tool: str
    required_arguments: tuple[str, ...] = ()


QUESTION_BY_FAMILY = {
    "web_search": "What current web evidence is available for AI infrastructure?",
    "executive": "What are senior executives saying about AI infrastructure?",
    "market": "What is the current market state for NVDA?",
    "news": "What recent news is available for NVDA?",
    "issuer_primary": "What recent official issuer information is available for NVIDIA?",
    "regulatory_primary": "What recent SEC or regulatory evidence is available for NVDA?",
    "analyst_consensus": "What are analysts currently expecting for NVDA?",
    "earnings": "What is the latest and upcoming earnings information for NVDA?",
    "event_study": "How has NVDA reacted historically around earnings?",
    "congress": "What recent congressional stock trades are available for NVDA?",
    "macro": "What macro or political-policy risks does the application currently track?",
    "portfolio": "What does the application know about my current portfolio?",
    "forecast": "What does Forecast Track show for NVDA verification history?",
    "quality": "What does AI Quality Lab show about recent research quality?",
    "relationship": "What peer and relationship context is configured for NVDA?",
}


def _family(tool_name: str) -> str:
    name = tool_name.lower()
    if "get_executive_signals" in name or "executive" in name:
        return "executive"
    if "search_web" in name or name.startswith("web."):
        return "web_search"
    if name.startswith("news."):
        return "news"
    if any(x in name for x in ("analyst", "price_target", "target_price", "consensus", "recommendation", "rating")):
        return "analyst_consensus"
    if any(x in name for x in ("issuer_official", "company_official", "investor_relations", "company_docs", "press_release", "official.")):
        return "issuer_primary"
    if name.startswith("filings.") or "sec" in name or "edgar" in name:
        return "regulatory_primary"
    if "earnings" in name:
        return "earnings"
    if "event_study" in name:
        return "event_study"
    if "congress" in name:
        return "congress"
    if "forecast" in name or "verification" in name:
        return "forecast"
    if "portfolio" in name or "holdings" in name:
        return "portfolio"
    if "quality" in name or "red_team" in name or "red-team" in name:
        return "quality"
    if "macro" in name or "political" in name or "risk" in name:
        return "macro"
    if "rotation" in name or "relationship" in name:
        return "relationship"
    if any(x in name for x in (".get_quote", ".get_quotes", ".get_snapshot")):
        return "market"
    return ""


def generate_synthetic_cases(tools: Iterable[ToolInfo]) -> list[SyntheticCase]:
    """Generate one question-driven routing case for every represented evidence family."""
    selected: dict[str, ToolInfo] = {}
    for tool in tools:
        family = _family(tool.qualified_name)
        if not family or family in selected:
            continue
        selected[family] = tool

    cases: list[SyntheticCase] = []
    for family in QUESTION_BY_FAMILY:
        tool = selected.get(family)
        if tool is None:
            continue
        schema = tool.input_schema or {}
        required = schema.get("required") if isinstance(schema.get("required"), list) else []
        cases.append(
            SyntheticCase(
                id=f"synthetic-routing-{family}",
                category="tool-routing",
                question=QUESTION_BY_FAMILY[family],
                expected_family=family,
                expected_tool=tool.qualified_name,
                required_arguments=tuple(str(x) for x in required),
            )
        )
    return cases


def validate_catalog(tools: Iterable[ToolInfo]) -> dict[str, Any]:
    """Validate that every discovered tool has a usable description/schema."""
    rows = []
    for tool in tools:
        schema = tool.input_schema or {}
        properties = schema.get("properties") if isinstance(schema, dict) else None
        required = schema.get("required") if isinstance(schema, dict) else None
        required = required if isinstance(required, list) else []
        missing_required = [str(name) for name in required if str(name) not in (properties or {})]
        rows.append({
            "tool": tool.qualified_name,
            "descriptionPresent": bool(str(tool.description or "").strip()),
            "schemaValid": isinstance(schema, dict),
            "requiredFieldsPresent": not missing_required,
            "missingRequired": missing_required,
        })
    failures = [
        row for row in rows
        if not row["descriptionPresent"] or not row["schemaValid"] or not row["requiredFieldsPresent"]
    ]
    return {
        "toolCount": len(rows),
        "passed": len(failures) == 0,
        "failures": failures,
        "rows": rows,
    }


def coverage(cases: Iterable[SyntheticCase]) -> dict[str, Any]:
    rows = list(cases)
    families = sorted({case.expected_family for case in rows})
    return {
        "case_count": len(rows),
        "families": families,
        "family_count": len(families),
    }


__all__ = ["SyntheticCase", "generate_synthetic_cases", "coverage", "validate_catalog"]
