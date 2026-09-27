from __future__ import annotations

import json
from pathlib import Path
from statistics import mean
from typing import Any

from .state import AgentState
from .tools import DEFAULT_SYMBOLS, fetch_live_data


GROUPS = {
    "AI Infrastructure": ["DGXX", "NBIS", "VIVO", "IREN", "CIFR"],
    "AI Compute": ["NVDA", "AMD", "CBRS", "QCOM"],
    "AI Platform": ["MSFT", "META", "GOOGL", "AMZN", "AAPL"],
    "Enterprise Software": ["NOW", "CRM", "TEAM", "IBM"],
    "Memory": ["DRAM", "MU", "SNDK", "000660.KS"],
    "Semiconductors": ["SOXL", "SOXX", "TSM", "INTC"],
}


def _load_portfolio_snapshot() -> dict[str, Any]:
    path = Path(__file__).resolve().parents[1] / "data" / "portfolio_snapshot.json"
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def market_agent(state: AgentState) -> dict[str, Any]:
    symbols = state.get("requested_symbols") or DEFAULT_SYMBOLS
    payload = fetch_live_data(symbols)
    prices = payload["stockPrices"]

    # The broker snapshot is shared with the React dashboard through one JSON file.
    # It is contextual evidence, not a live broker API position feed.
    portfolio_snapshot = _load_portfolio_snapshot()
    positions = {
        item["symbol"]: item
        for item in portfolio_snapshot.get("positions", [])
        if item.get("symbol") in symbols
    }

    returns = [
        item["changePct"]
        for item in prices.values()
        if isinstance(item, dict) and isinstance(item.get("changePct"), (int, float))
    ]
    universe_avg = mean(returns) if returns else 0.0

    groups: dict[str, Any] = {}
    for name, members in GROUPS.items():
        values = [
            prices[s]["changePct"]
            for s in members
            if s in prices and isinstance(prices[s].get("changePct"), (int, float))
        ]
        if not values:
            continue
        avg_change = mean(values)
        breadth = sum(v >= 0 for v in values) / len(values)
        groups[name] = {
            "members": members,
            "avgChangePct": round(avg_change, 4),
            "breadth": round(breadth, 4),
            "relativeToUniverse": round(avg_change - universe_avg, 4),
        }

    portfolio_values = [
        prices[s]["changePct"]
        for s in positions
        if s in prices and isinstance(prices[s].get("changePct"), (int, float))
    ]

    evidence = {
        "prices": prices,
        "groups": groups,
        "portfolio": portfolio_snapshot.get("portfolio", {}),
        "positions": positions,
        "portfolioSource": "data/portfolio_snapshot.json",
        "universeAverageChangePct": round(universe_avg, 4),
        "portfolioAverageChangePct": round(mean(portfolio_values), 4) if portfolio_values else None,
        "portfolioBreadth": (
            round(sum(v >= 0 for v in portfolio_values) / len(portfolio_values), 4)
            if portfolio_values else None
        ),
        "news": payload["news"],
        "contracts": payload["contracts"],
        "asOf": payload["timestamp"],
        "source": payload["source"],
    }

    return {
        "market_evidence": evidence,
        "sources": [
            {
                "agent": "Market Agent",
                "type": "market_data",
                "source": payload["source"],
                "asOf": payload["timestamp"],
            },
            {
                "agent": "Market Agent",
                "type": "portfolio_snapshot",
                "source": "data/portfolio_snapshot.json",
                "asOf": portfolio_snapshot.get("asOf"),
            },
        ],
        "trace": state.get("trace", []) + ["market_agent"],
    }
