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
