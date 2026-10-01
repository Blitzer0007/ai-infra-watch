"""Vercel-safe in-process MCP tool catalog.

Serverless functions should not depend on long-lived stdio child processes.
This adapter exposes the same logical tool names as the MCP servers while
calling the existing transport-independent services directly in-process.

Local development/tests keep the real stdio MCP transport unless
MCP_TRANSPORT=inprocess is explicitly selected.
"""
from __future__ import annotations

import os
from typing import Any

from app.mcp_client.client import MCPClientError, ToolInfo
from mcp_servers.stocks.service import StockService
from mcp_servers.stocks.earnings import EarningsService
from mcp_servers.stocks.event_study import EventStudyService
from mcp_servers.stocks.candles import CandleService
from mcp_servers.stocks.relationships import from_env as relationships_from_env
from mcp_servers.filings.service import FilingsService
from mcp_servers.filings.milestones import MilestoneService
from mcp_servers.filings.contracts import ContractService
from mcp_servers.news.service import NewsService

def _live_default() -> bool:
    raw = os.getenv("AI_INFRA_AGENT_LIVE_DATA")
    if raw is not None:
        return raw.strip().lower() in {"1", "true", "yes", "on"}
    return bool(os.getenv("VERCEL"))

class InProcessMCPToolbox:
    """Drop-in synchronous facade matching MCPToolbox's public surface."""

    def __init__(self, live: bool | None = None) -> None:
        self.live = _live_default() if live is None else bool(live)
        mode = "live" if self.live else "fixture"
        self._stocks = StockService.from_env(mode)
        self._earnings = EarningsService.from_env(mode)
        self._candles = CandleService.from_env(mode)
        self._event_study = EventStudyService(earnings=self._earnings, candles=self._candles)
        self._filings = FilingsService.from_env(mode)
        self._milestones = MilestoneService.from_env("live")
        self._contracts = ContractService.from_env("live")
        self._news = NewsService.from_env("live" if self.live else "fixture")
        self._tool_map: dict[str, ToolInfo] = {}
        self._register()

    def _register(self) -> None:
        definitions = {
            "stocks": [
                ("get_quote", "Get a real-time quote for one stock symbol."),
                ("get_quotes", "Get real-time quotes for several stock symbols."),
                ("get_snapshot", "Get quotes for the configured watchlist."),
                ("get_earnings", "Get past and upcoming earnings and historical price reaction."),
                ("get_rotation", "Detect AI infrastructure capital-rotation signals."),
                ("get_event_study", "Compute earnings-event T+1, T+5 and T+20 session returns."),
                ("get_relationships", "Resolve configured AI Infra Watch peer relationships."),
                ("list_watchlist", "List tracked watchlist symbols."),
                ("health", "Stocks service health snapshot."),
            ],
            "filings": [
                ("search_filings", "Search the SEC filing corpus."),
                ("answer_question", "Answer a question about filings with citations."),
                ("get_milestones", "Get recent SEC 8-K milestones for a symbol."),
                ("get_catalysts", "Get current SEC 8-K material-event and contract evidence."),
                ("get_contracts", "Get contract-related primary SEC disclosures."),
                ("list_documents", "List filing document IDs."),
                ("get_document", "Return one filing document."),
                ("health", "Filings service health snapshot."),
            ],
            "news": [
                ("search", "Search recent market news by keywords."),
                ("company", "Get recent company news for one symbol."),
                ("sector", "Get recent news for an AI infrastructure sector."),
                ("global", "Get latest general market news."),
                ("geopolitical", "Search recent geopolitical news."),
                ("health", "News service health snapshot."),
            ],
        }
        for server, items in definitions.items():
            for name, description in items:
                info = ToolInfo(server=server, name=name, description=description, input_schema={})
                self._tool_map[info.qualified_name] = info

    def tools(self) -> list[ToolInfo]:
        return list(self._tool_map.values())

    def tool_names(self) -> list[str]:
        return list(self._tool_map)

    def servers(self) -> list[str]:
        return ["stocks", "filings", "news"]

    def close(self) -> None:
        return None

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        args = arguments or {}
        info = self._resolve(name)
        key = info.qualified_name

        if key == "stocks.get_quote":
            return self._stocks.get_quote(str(args.get("symbol", ""))).model_dump()
        if key == "stocks.get_quotes":
            return self._stocks.get_quotes([str(x) for x in args.get("symbols", [])]).model_dump()
        if key == "stocks.get_snapshot":
            return self._stocks.get_snapshot().model_dump()
        if key == "stocks.get_earnings":
            return self._earnings.get_earnings(str(args.get("symbol", ""))).model_dump()
        if key == "stocks.get_rotation":
            from app.agents.rotation import RotationAgent
            return RotationAgent(service=self._candles).run().model_dump()
        if key == "stocks.get_event_study":
            return self._event_study.get_study(str(args.get("symbol", "")))
        if key == "stocks.get_relationships":
            return relationships_from_env().get(str(args.get("symbol", "")).strip().upper())
        if key == "stocks.list_watchlist":
            return self._stocks.list_watchlist()
        if key == "stocks.health":
            return self._stocks.health().model_dump()

        if key == "filings.search_filings":
            return self._filings.search_filings(str(args.get("query", "")), top_k=int(args.get("top_k", 5))).model_dump()
        if key == "filings.answer_question":
            return self._filings.answer_question(str(args.get("question", ""))).model_dump()
        if key == "filings.get_milestones":
            return self._milestones.get_timeline(str(args.get("symbol", ""))).model_dump()
        if key == "filings.get_catalysts":
            symbols = [str(x).strip().upper() for x in args.get("symbols", []) if str(x).strip()]
            result: dict[str, dict[str, Any]] = {}
            for symbol in symbols:
                row: dict[str, Any] = {"milestones": [], "contracts": []}
                try:
                    row["milestones"] = self._milestones.get_timeline(symbol).model_dump().get("events", [])
                except Exception as exc:
                    row["milestones_error"] = f"{type(exc).__name__}: {exc}"
                try:
                    row["contracts"] = self._contracts.get_timeline(symbol).model_dump().get("contracts", [])
                except Exception as exc:
                    row["contracts_error"] = f"{type(exc).__name__}: {exc}"
                result[symbol] = row
            return {"symbols": result, "source": "sec-edgar-primary"}
        if key == "filings.get_contracts":
            return self._contracts.get_timeline(str(args.get("symbol", ""))).model_dump()
        if key == "filings.list_documents":
            return self._filings.list_documents()
        if key == "filings.get_document":
            return self._filings.get_document(str(args.get("document_id", "")))
        if key == "filings.health":
            return self._filings.health().model_dump()

        if key == "news.search":
            return self._news.search(str(args.get("query", "")), days=int(args.get("days", 7))).model_dump()
        if key == "news.company":
            return self._news.company(str(args.get("symbol", "")), days=int(args.get("days", 7))).model_dump()
        if key == "news.sector":
            return self._news.sector(str(args.get("sector", "")), days=int(args.get("days", 3))).model_dump()
        if key == "news.global":
            return self._news.global_news(days=int(args.get("days", 3))).model_dump()
        if key == "news.geopolitical":
            return self._news.geopolitical(str(args.get("topic", "geopolitics")), days=int(args.get("days", 3))).model_dump()
        if key == "news.health":
            return self._news.health().model_dump()
        raise MCPClientError("UNKNOWN_TOOL", f"no in-process tool {name!r}")

    def _resolve(self, name: str) -> ToolInfo:
        if "." in name:
            if name in self._tool_map:
                return self._tool_map[name]
            raise MCPClientError("UNKNOWN_TOOL", f"no tool {name!r}")
        matches = [info for info in self._tool_map.values() if info.name == name]
        if not matches:
            raise MCPClientError("UNKNOWN_TOOL", f"no tool named {name!r}")
        if len(matches) > 1:
            servers = ", ".join(sorted(info.server for info in matches))
            raise MCPClientError("AMBIGUOUS_TOOL", f"tool {name!r} exported by multiple servers ({servers}); use a qualified name")
        return matches[0]

__all__ = ["InProcessMCPToolbox"]
