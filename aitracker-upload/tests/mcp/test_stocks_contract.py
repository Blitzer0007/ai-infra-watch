"""Contract tests for the stocks MCP server.

These drive the REAL MCP dispatch path (server.list_tools / call_tool,
both async) rather than calling the service directly — so they prove the
wire contract an agent sees:

  * the exact tool set is registered
  * each tool's input_schema advertises the params agents pass
  * call_tool results round-trip back into the pydantic schemas
  * structured errors surface as tool errors, not crashes

If a future refactor drops a tool or changes a field name, these fail —
which is the point (contract = schema matches what agents expect).
"""
from __future__ import annotations

import asyncio
import json

import pytest

from mcp.server.mcpserver.exceptions import ToolError

from mcp_servers.stocks import StockService, build_server
from mcp_servers.stocks.providers import FixtureProvider
from mcp_servers.stocks.schemas import Quote, QuoteBatch
from mcp_servers.stocks.service import FIXTURE_PATH

EXPECTED_TOOLS = {"get_quote", "get_quotes", "get_snapshot", "list_watchlist", "health"}


def _clock() -> str:
    return "2026-08-03T00:00:00Z"


@pytest.fixture
def server():
    svc = StockService(provider=FixtureProvider(FIXTURE_PATH, clock=_clock), clock=_clock)
    return build_server(svc)


def _run(coro):
    return asyncio.run(coro)


def _text(result) -> str:
    """Extract the text payload from a CallToolResult."""
    assert not result.is_error, f"tool errored: {result}"
    return result.content[0].text


# ---- tool registration -------------------------------------------------
def test_expected_tools_are_registered(server):
    tools = _run(server.list_tools())
    names = {t.name for t in tools}
    assert names == EXPECTED_TOOLS


def test_get_quote_input_schema_advertises_symbol(server):
    tools = _run(server.list_tools())
    tool = next(t for t in tools if t.name == "get_quote")
    props = (tool.input_schema or {}).get("properties", {})
    assert "symbol" in props, "get_quote must advertise a `symbol` param"


def test_get_quotes_input_schema_advertises_symbols(server):
    tools = _run(server.list_tools())
    tool = next(t for t in tools if t.name == "get_quotes")
    props = (tool.input_schema or {}).get("properties", {})
    assert "symbols" in props


# ---- call round-trips into the schemas ---------------------------------
def test_get_quote_result_roundtrips_to_quote(server):
    result = _run(server.call_tool("get_quote", {"symbol": "NVDA"}))
    quote = Quote.model_validate_json(_text(result))
    assert quote.symbol == "NVDA"
    assert quote.as_of  # timestamp guardrail: never empty


def test_get_snapshot_result_roundtrips_to_batch(server):
    result = _run(server.call_tool("get_snapshot", {}))
    batch = QuoteBatch.model_validate_json(_text(result))
    assert len(batch.quotes) == 6
    assert all(q.as_of for q in batch.quotes)


def test_list_watchlist_returns_symbols(server):
    # A tool returning list[str] renders one TextContent per element.
    result = _run(server.call_tool("list_watchlist", {}))
    assert not result.is_error
    symbols = {block.text for block in result.content}
    assert "NVDA" in symbols
    assert "AVGO" in symbols


def test_health_tool_reports_fixture_mode(server):
    result = _run(server.call_tool("health", {}))
    payload = json.loads(_text(result))
    assert payload["server"] == "mcp-server-stocks"
    assert payload["mode"] == "fixture"


# ---- error contract ----------------------------------------------------
def test_unknown_symbol_surfaces_as_tool_error(server):
    # The SDK raises ToolError for an unhandled tool exception; the point
    # is that a bad symbol is a controlled protocol error, not a crash.
    with pytest.raises(ToolError):
        _run(server.call_tool("get_quote", {"symbol": "ZZZZ"}))


# ---- resource ----------------------------------------------------------
def test_live_resource_serves_batch_json(server):
    resources = _run(server.list_resources())
    uris = {str(r.uri) for r in resources}
    assert "stocks://quotes/live" in uris
    contents = _run(server.read_resource("stocks://quotes/live"))
    # read_resource returns a list of ReadResourceContents; .content is text.
    batch = QuoteBatch.model_validate_json(contents[0].content)
    assert batch.quotes
