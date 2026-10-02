"""MCP server: real-time stock quotes as tools + a live resource.

Run (stdio transport, the MCP default):
    python -m mcp_servers.stocks.server
or
    python -c "import mcp_servers.stocks.server as s; s.main()"

Tools:
    get_quote(symbol)          -> Quote             (single symbol)
    get_quotes(symbols)        -> QuoteBatch        (best-effort batch)
    get_snapshot()             -> QuoteBatch        (whole watchlist)
    list_watchlist()           -> list[str]
    health()                   -> ServerHealth      (observability)

Resource:
    stocks://quotes/live       -> latest QuoteBatch as JSON text

Every tool delegates to StockService (service.py) — the SAME methods
the unit + contract tests exercise directly, so the tested API and the
wire API cannot drift.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from mcp.server import MCPServer
from mcp.types import ToolResultContent  # noqa: F401  (re-export for contract tests)

from .providers import QuoteError
from .schemas import QuoteBatch, ServerHealth
from .research_sources import AnalystService, IssuerOfficialService
from .service import StockService, from_env as _from_env


def build_server(service: StockService | None = None) -> MCPServer:
    """Construct the MCPServer shell around a StockService.

    `service` is injectable so tests can hand in a fixture-backed
    service; production uses from_env(mode=...).
    """
    svc = service or _from_env()

    server = MCPServer(
        name="mcp-server-stocks",
        title="Stocks",
        description="Real-time US stock quotes (Finnhub) + live feed resource.",
    )

    @server.tool(name="get_quote", description="Get a real-time quote for one stock symbol.")
    def get_quote(symbol: str) -> dict:
        try:
            return svc.get_quote(symbol).model_dump()
        except QuoteError as exc:
            raise ValueError(exc.message) from exc

    @server.tool(name="get_quotes", description="Get real-time quotes for several symbols (best-effort).")
    def get_quotes(symbols: list[str]) -> dict:
        return svc.get_quotes(symbols).model_dump()

    @server.tool(name="get_snapshot", description="Get quotes for the entire watchlist.")
    def get_snapshot() -> dict:
        return svc.get_snapshot().model_dump()

    @server.tool(
        name="get_earnings",
        description="Get past and upcoming earnings for one symbol, including EPS/revenue surprise and historical price reaction when available.",
    )
    def get_earnings(symbol: str) -> dict:
        from .earnings import EarningsService
        import os

        mode = os.getenv("STOCKS_MODE", "fixture") or "fixture"
        history = EarningsService.from_env(mode).get_earnings(symbol)
        return history.model_dump()

    @server.tool(
        name="get_rotation",
        description="Detect hardware-versus-application AI capital-rotation signals over 1d, 5d, and 20d windows using the curated AI universe.",
    )
    def get_rotation() -> dict:
        import os

        from app.agents.rotation import RotationAgent

        mode = os.getenv("STOCKS_MODE", "fixture") or "fixture"
        from mcp_servers.stocks.candles import CandleService

        result = RotationAgent(service=CandleService.from_env(mode)).run()
        return result.model_dump()

    @server.tool(
        name="get_event_study",
        description="Compute earnings-event T+1, T+5, and T+20 session returns for one symbol, using reported earnings dates and daily candles.",
    )
    def get_event_study(symbol: str) -> dict:
        import os

        from .event_study import EventStudyService

        mode = os.getenv("STOCKS_MODE", "fixture") or "fixture"
        return EventStudyService.from_env(mode).get_study(symbol)

    @server.tool(
        name="get_analyst_expectations",
        description="Get secondary analyst expectations for a US stock: recommendation trends, price-target data, EPS estimates, and revenue estimates when available.",
    )
    def get_analyst_expectations(symbol: str) -> dict:
        return AnalystService().get(symbol).model_dump()

    @server.tool(
        name="get_issuer_official",
        description="Get company/issuer-primary web evidence: issuer profile plus recent company-news items whose URLs are hosted on the issuer's own official domain.",
    )
    def get_issuer_official(symbol: str, days: int = 14) -> dict:
        return IssuerOfficialService().get(symbol, days=days).model_dump()

    @server.tool(
        name="get_relationships",
        description="Resolve a symbol's configured AI Infra Watch peer, theme, group, and geography relationships.",
    )
    def get_relationships(symbol: str) -> dict:
        from .relationships import from_env

        return from_env().get(symbol)

    @server.tool(name="list_watchlist", description="List the tracked watchlist symbols.")
    def list_watchlist() -> list[str]:
        return svc.list_watchlist()

    @server.tool(name="health", description="Stocks server health snapshot for observability.")
    def health() -> dict:
        return svc.health().model_dump()

    @server.resource(
        uri="stocks://quotes/live",
        name="live_quotes",
        description="Latest watchlist quotes (JSON text).",
        mime_type="application/json",
    )
    def live_quotes() -> str:
        batch = svc.get_snapshot()
        return json.dumps(batch.model_dump(), ensure_ascii=False)

    return server


def from_env(mode: str = "fixture") -> StockService:
    """Fixture or live service selected by the caller (usually via env)."""
    return _from_env(mode)


def main() -> None:
    import os

    mode = os.getenv("STOCKS_MODE", "fixture")
    server = build_server(_from_env(mode=mode))
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
