from __future__ import annotations

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


def market_agent(state: AgentState) -> dict[str, Any]:
    symbols = state.get("requested_symbols") or DEFAULT_SYMBOLS
    payload = fetch_live_data(symbols)
    prices = payload["stockPrices"]

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

    portfolio = ["DGXX","DRAM","SOXL","NVDA","MSFT","NBIS","VIVO","META","NOW","PHVS"]
    portfolio_values = [
        prices[s]["changePct"]
        for s in portfolio
        if s in prices and isinstance(prices[s].get("changePct"), (int, float))
    ]

    evidence = {
        "prices": prices,
        "groups": groups,
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
        "sources": [{
            "agent": "Market Agent",
            "type": "market_data",
            "source": payload["source"],
            "asOf": payload["timestamp"],
        }],
        "trace": state.get("trace", []) + ["market_agent"],
    }
