from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .state import AgentState


def synthesis_agent(state: AgentState) -> dict[str, Any]:
    market = state.get("market_evidence", {})
    risk = state.get("risk_evidence", {})
    groups = market.get("groups", {})

    ranked = sorted(
        groups.items(),
        key=lambda item: item[1].get("relativeToUniverse", 0),
        reverse=True,
    )

    rotation = [
        {
            "group": name,
            "avgChangePct": data["avgChangePct"],
            "breadth": data["breadth"],
            "relativeToUniverse": data["relativeToUniverse"],
        }
        for name, data in ranked
    ]

    market_mcp = market.get("mcpEvidence", {})
    risk_mcp = risk.get("mcpEvidence")

    return {
        "synthesis": {
            "topObservedGroup": ranked[0][0] if ranked else None,
            "bottomObservedGroup": ranked[-1][0] if ranked else None,
            "portfolioAverageChangePct": market.get("portfolioAverageChangePct"),
            "portfolioBreadth": market.get("portfolioBreadth"),
            "rotationSignal": rotation,
            "riskChannels": list(risk.get("channels", {}).keys()),
            "mcpEvidence": {
                "marketQuotesRetrieved": bool(market_mcp.get("quotes")),
                "riskEvidenceRetrieved": risk_mcp is not None,
                "riskSource": risk.get("mcpEvidence") and (
                    "filings_mcp" if risk.get("note", "").startswith("Company-specific") else "risk_mcp"
                ),
            },
            "interpretation": (
                "Observed relative-strength signal from the current market snapshot; "
                "this does not establish literal capital flows or causality."
            ),
            "confidence": "descriptive",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "trace": state.get("trace", []) + ["synthesis_agent"],
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
