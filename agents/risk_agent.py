from __future__ import annotations

import json
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


def _risk_question(state: AgentState, requested: set[str]) -> str:
    user_query = (state.get("user_query") or "").strip()
    symbols = ", ".join(sorted(requested)) if requested else "the tracked portfolio"
    query = (
        f"For {symbols}, identify material risk factors disclosed in the available company filings, "
        "especially semiconductor supply-chain concentration, export controls/trade restrictions, "
        "geopolitical exposure, data-center power constraints, customer concentration, and financing "
        "or deployment dependencies. Return concise evidence with the filing source citations. "
        "Do not infer current events that are not in the filings."
    )
    if user_query:
        query += f" User question: {user_query}"
    return query


def _unwrap_mcp_payload(result: Any) -> Any:
    if isinstance(result, dict) and set(result) == {"result"}:
        return result["result"]
    return result


def _get_mcp_evidence(state: AgentState, requested: set[str]) -> tuple[Any | None, dict[str, Any] | None, str | None]:
    # A future dedicated risk MCP can be configured explicitly. Until then,
    # use the committed filings MCP for company-specific risk evidence.
    risk_config = load_mcp_config("risk")
    if risk_config:
        namespace = "risk"
        default_tool = "answer_question"
        env_tool = "AI_INFRA_WATCH_RISK_MCP_TOOL"
        env_args = "AI_INFRA_WATCH_RISK_MCP_ARGS_JSON"
    else:
        risk_config = load_mcp_config("filings")
        if not risk_config:
            return None, None, None
        namespace = "filings"
        default_tool = "answer_question"
        env_tool = "AI_INFRA_WATCH_FILINGS_MCP_TOOL"
        env_args = "AI_INFRA_WATCH_FILINGS_MCP_ARGS_JSON"

    tool_name = os.getenv(env_tool, default_tool).strip() or default_tool
    raw_args = os.getenv(env_args, "").strip()

    try:
        if raw_args:
            arguments = json.loads(raw_args)
            if not isinstance(arguments, dict):
                raise ValueError(f"{env_args} must be a JSON object")
        elif tool_name == "answer_question":
            arguments = {"question": _risk_question(state, requested)}
        else:
            raise ValueError(
                f"{env_tool}={tool_name!r} requires {env_args} because the tool schema is not known locally"
            )

        result = _unwrap_mcp_payload(call_tool_sync(risk_config, tool_name, arguments))
        source = {
            "agent": "Risk Agent",
            "type": "mcp_risk_retrieval" if namespace == "risk" else "mcp_filings_context",
            "source": f"MCP:{risk_config.name}/{tool_name}",
            "asOf": utc_now(),
        }
        return result, source, None
    except Exception as exc:
        return None, None, f"{namespace.capitalize()} MCP call failed: {type(exc).__name__}: {exc}"


def risk_agent(state: AgentState) -> dict[str, Any]:
    requested = set(state.get("requested_symbols") or [])
    relevant = {
        key: value
        for key, value in RISK_CHANNELS.items()
        if not requested or requested.intersection(value["affected"])
    }

    mcp_result, mcp_source, mcp_error = _get_mcp_evidence(state, requested)

    evidence: dict[str, Any] = {
        "channels": relevant,
        "mcpEvidence": mcp_result,
        "mcpConfigured": mcp_result is not None,
        "asOf": utc_now(),
        "confidence": "mcp_retrieved" if mcp_result is not None else "taxonomy",
        "note": (
            "MCP evidence was retrieved from the configured risk server."
            if mcp_result is not None and mcp_source and mcp_source["type"] == "mcp_risk_retrieval"
            else (
                "Company-specific filing risk context was retrieved from the filings MCP; "
                "current geopolitical facts still require a current macro/policy source."
                if mcp_result is not None
                else "Current geopolitical facts are not available from MCP in this run; taxonomy is only a routing fallback."
            )
        ),
    }

    if mcp_error:
        evidence["mcpError"] = mcp_error

    sources = state.get("sources", []) + [{
        "agent": "Risk Agent",
        "type": mcp_source["type"] if mcp_source else "risk_taxonomy",
        "source": mcp_source["source"] if mcp_source else "ai-infra-watch risk mapping",
        "asOf": evidence["asOf"],
    }]

    return {
        "risk_evidence": evidence,
        "sources": sources,
        "errors": state.get("errors", []) + ([mcp_error] if mcp_error else []),
        "trace": state.get("trace", []) + ["risk_agent"],
    }
