from __future__ import annotations

import json
import os
from pathlib import Path
from statistics import mean
from typing import Any

from .mcp_client import call_tool_sync, load_mcp_config
from .state import AgentState
from .tools import DEFAULT_SYMBOLS, fetch_live_data, utc_now


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


def _unwrap_mcp_payload(result: Any) -> Any:
    """Handle structured_content shapes returned by different MCP SDK versions."""
    if isinstance(result, dict) and set(result) == {"result"}:
        return result["result"]
    return result


def _quote_to_frontend(symbol: str, quote: dict[str, Any]) -> dict[str, Any]:
    return {
        "price": quote.get("price", 0),
        "change": quote.get("change", 0),
        "changePct": quote.get("change_pct", quote.get("changePct", 0)),
        "high": quote.get("high"),
        "low": quote.get("low"),
        "open": quote.get("open"),
        "prevClose": quote.get("prev_close", quote.get("prevClose")),
        "volume": quote.get("volume"),
    }


def _get_mcp_quotes(symbols: list[str]) -> tuple[dict[str, dict[str, Any]], dict[str, Any] | None, str | None]:
    config = load_mcp_config("stocks")
    if not config:
        return {}, None, None

    tool_name = os.getenv("AI_INFRA_WATCH_STOCKS_MCP_TOOL", "get_quotes").strip() or "get_quotes"
    raw_args = os.getenv("AI_INFRA_WATCH_STOCKS_MCP_ARGS_JSON", "").strip()

    try:
        if raw_args:
            arguments = json.loads(raw_args)
            if not isinstance(arguments, dict):
                raise ValueError("AI_INFRA_WATCH_STOCKS_MCP_ARGS_JSON must be a JSON object")
        elif tool_name == "get_snapshot":
            arguments = {}
        else:
            arguments = {"symbols": symbols}

        result = _unwrap_mcp_payload(call_tool_sync(config, tool_name, arguments))

        if not isinstance(result, dict):
            raise ValueError("stocks MCP returned a non-object result")
        quotes = result.get("quotes")
        if not isinstance(quotes, list):
            raise ValueError("stocks MCP result does not contain a quotes list")

        normalized: dict[str, dict[str, Any]] = {}
        for quote in quotes:
            if not isinstance(quote, dict) or not quote.get("symbol"):
                continue
            symbol = str(quote["symbol"]).upper()
            normalized[symbol] = _quote_to_frontend(symbol, quote)

        source = {
            "agent": "Market Agent",
            "type": "mcp_market_data",
            "source": f"MCP:{config.name}/{tool_name}",
            "asOf": utc_now(),
            "serverMode": config.env.get("STOCKS_MODE") if config.env else None,
            "symbols": sorted(normalized),
        }
        return normalized, source, None
    except Exception as exc:
        return {}, None, f"Stocks MCP call failed: {type(exc).__name__}: {exc}"


def market_agent(state: AgentState) -> dict[str, Any]:
    symbols = state.get("requested_symbols") or DEFAULT_SYMBOLS
    payload = fetch_live_data(symbols)
    prices = payload["stockPrices"]

    mcp_prices, mcp_source, mcp_error = _get_mcp_quotes(symbols)
    if mcp_prices:
        prices = {**prices, **mcp_prices}

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
        "mcpEvidence": {
            "quotes": mcp_prices,
            "configured": mcp_source is not None,
            "source": mcp_source,
            "error": mcp_error,
        },
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
            *([mcp_source] if mcp_source else []),
        ],
        "errors": state.get("errors", []) + ([mcp_error] if mcp_error else []),
        "trace": state.get("trace", []) + ["market_agent"],
    }
