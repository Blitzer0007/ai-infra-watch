from __future__ import annotations

import os
from typing import Any

from .mcp_client import call_tool_sync, load_mcp_config
from .state import AgentState
from .tools import utc_now


RISK_CHANNELS = {
    "taiwan_semiconductor_supply": {
        "level": "high",
        "affected": ["NVDA", "AMD", "TSM", "MU", "000660.KS", "SOXX", "SOXL"],
        "transmission": "Geopolitical disruption -> foundry/packaging supply -> accelerator and memory availability.",
    },
    "ai_chip_export_controls": {
        "level": "high",
        "affected": ["NVDA", "AMD", "QCOM", "TSM", "MSFT", "META", "GOOGL"],
        "transmission": "Trade policy -> addressable market/product mix -> revenue and relative market response.",
    },
    "data_center_power": {
        "level": "medium",
        "affected": ["DGXX", "NBIS", "VIVO", "IREN", "CIFR"],
        "transmission": "Power availability -> deployable compute capacity -> hosting/colocation growth.",
    },
}


def _get_mcp_evidence(requested: set[str]) -> tuple[Any | None, dict[str, Any] | None, str | None]:
    config = load_mcp_config("risk")
    tool_name = os.getenv("AI_INFRA_WATCH_RISK_MCP_TOOL", "").strip()
    if not config or not tool_name:
        return None, None, None

    try:
        result = call_tool_sync(
            config,
            tool_name,
            {
                "symbols": sorted(requested),
                "query": "current geopolitical and macro risks affecting the requested portfolio/watchlist symbols",
            },
        )
        source = {
            "agent": "Risk Agent",
            "type": "mcp_risk_retrieval",
            "source": f"MCP:{config.name}/{tool_name}",
            "asOf": utc_now(),
        }
        return result, source, None
    except Exception as exc:
        return None, None, f"Risk MCP call failed: {type(exc).__name__}: {exc}"


def risk_agent(state: AgentState) -> dict[str, Any]:
    requested = set(state.get("requested_symbols") or [])
    relevant = {
        key: value
        for key, value in RISK_CHANNELS.items()
        if not requested or requested.intersection(value["affected"])
    }

    mcp_result, mcp_source, mcp_error = _get_mcp_evidence(requested)

    evidence: dict[str, Any] = {
        "channels": relevant,
        "mcpEvidence": mcp_result,
        "mcpConfigured": mcp_result is not None,
        "asOf": utc_now(),
        "confidence": "mcp_retrieved" if mcp_result is not None else "taxonomy",
        "note": (
            "Risk MCP evidence was retrieved and attached."
            if mcp_result is not None
            else "Current geopolitical facts are not available from MCP in this run; taxonomy is only a routing fallback."
        ),
    }

    if mcp_error:
        evidence["mcpError"] = mcp_error

    sources = state.get("sources", []) + [{
        "agent": "Risk Agent",
        "type": "risk_mcp" if mcp_result is not None else "risk_taxonomy",
        "source": mcp_source["source"] if mcp_source else "ai-infra-watch risk mapping",
        "asOf": evidence["asOf"],
    }]

    return {
        "risk_evidence": evidence,
        "sources": sources,
        "errors": state.get("errors", []) + ([mcp_error] if mcp_error else []),
        "trace": state.get("trace", []) + ["risk_agent"],
    }
