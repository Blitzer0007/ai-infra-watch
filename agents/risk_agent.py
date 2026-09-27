from __future__ import annotations

from typing import Any

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


def risk_agent(state: AgentState) -> dict[str, Any]:
    requested = set(state.get("requested_symbols") or [])
    relevant = {
        key: value
        for key, value in RISK_CHANNELS.items()
        if not requested or requested.intersection(value["affected"])
    }

    evidence: dict[str, Any] = {
        "channels": relevant,
        "asOf": utc_now(),
        "confidence": "taxonomy",
        "note": "Current geopolitical facts should be attached by a dedicated risk retrieval/MCP tool.",
    }

    return {
        "risk_evidence": evidence,
        "sources": state.get("sources", []) + [{
            "agent": "Risk Agent",
            "type": "risk_taxonomy",
            "source": "ai-infra-watch risk mapping",
            "asOf": evidence["asOf"],
        }],
        "trace": state.get("trace", []) + ["risk_agent"],
    }
