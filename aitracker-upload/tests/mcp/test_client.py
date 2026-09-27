"""MCPClient tests — Phase 5 MCP client layer.

Hermetic: a FakeSession drives all routing/discovery/namespacing tests
(no subprocess, no stdio). A @pytest.mark.live smoke exercises the real
stdio path against mcp_servers.stocks.server.

Strategies:
  1. Discovery — tools from N servers are all visible after connect
  2. Routing — call_tool dispatches to the correct server
  3. Namespacing — duplicate tool name across servers requires qualified form
  4. Unknown / ambiguous tool — clear MCPClientError
  5. read_resource — URI routed to the right server
  6. Lifecycle — __aexit__ clears sessions + tools
  7. unwrap_result unit tests
  8. @pytest.mark.live — real stdio smoke against stocks server
"""
from __future__ import annotations

import asyncio
import sys
from unittest.mock import MagicMock

import pytest

from app.mcp_client import MCPClient, ServerConfig, ToolInfo
from app.mcp_client.client import MCPClientError, unwrap_result
from tests.mcp_fakes import FakeSession
from tests.mcp_fakes import call_result as _call_result
from tests.mcp_fakes import cfg as _cfg
from tests.mcp_fakes import make_factory as _factory


# The in-process FakeSession + helpers live in tests/mcp_fakes.py (shared with
# the toolbox / router / chaos suites). This file's contract is the default one:
# an unknown tool RAISES UNKNOWN_TOOL, and `read_resource` embeds the serving
# server's name (`@stocks`) so a routing test can prove WHO answered.


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# 1. Discovery
# ---------------------------------------------------------------------------
def test_discovers_tools_from_all_servers():
    sessions = {
        "stocks": FakeSession(["get_quote", "get_snapshot"]),
        "filings": FakeSession(["search_filings", "answer_question"]),
    }

    async def _go():
        async with MCPClient([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as c:
            names = {t.name for t in c.tools()}
            assert names == {"get_quote", "get_snapshot", "search_filings", "answer_question"}
            assert c.servers() == ["stocks", "filings"]

    _run(_go())


def test_tool_info_carries_server_name():
    sessions = {"stocks": FakeSession(["get_quote"])}

    async def _go():
        async with MCPClient([_cfg("stocks")], _factory(sessions)) as c:
            t = c.tools()[0]
            assert isinstance(t, ToolInfo)
            assert t.server == "stocks"
            assert t.name == "get_quote"
            assert t.qualified_name == "stocks.get_quote"

    _run(_go())


# ---------------------------------------------------------------------------
# 2. Routing
# ---------------------------------------------------------------------------
def test_call_tool_routes_to_correct_server():
    stocks_session = FakeSession(["get_quote"], {"get_quote": "NVDA_DATA"})
    filings_session = FakeSession(["search_filings"], {"search_filings": "HITS"})
    sessions = {"stocks": stocks_session, "filings": filings_session}

    async def _go():
        async with MCPClient([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as c:
            result = await c.call_tool("get_quote", {"symbol": "NVDA"})
            assert result == "NVDA_DATA"
            assert stocks_session.calls == [("get_quote", {"symbol": "NVDA"})]
            assert filings_session.calls == []

    _run(_go())


def test_call_tool_qualified_name_routes_correctly():
    sessions = {
        "stocks": FakeSession(["health"], {"health": "stocks_health"}),
        "filings": FakeSession(["health"], {"health": "filings_health"}),
    }

    async def _go():
        async with MCPClient([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as c:
            assert await c.call_tool("stocks.health") == "stocks_health"
            assert await c.call_tool("filings.health") == "filings_health"

    _run(_go())


# ---------------------------------------------------------------------------
# 3. Namespacing — duplicate bare name requires qualified form
# ---------------------------------------------------------------------------
def test_ambiguous_bare_name_raises():
    sessions = {
        "stocks": FakeSession(["health"]),
        "filings": FakeSession(["health"]),
    }

    async def _go():
        async with MCPClient([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as c:
            with pytest.raises(MCPClientError) as exc:
                await c.call_tool("health")
            assert exc.value.code == "AMBIGUOUS_TOOL"
            assert "stocks" in exc.value.message and "filings" in exc.value.message

    _run(_go())


def test_unique_bare_name_resolves_without_prefix():
    sessions = {
        "stocks": FakeSession(["get_quote"], {"get_quote": 42}),
        "filings": FakeSession(["search_filings"]),
    }

    async def _go():
        async with MCPClient([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as c:
            assert await c.call_tool("get_quote") == 42

    _run(_go())


# ---------------------------------------------------------------------------
# 4. Unknown tool
# ---------------------------------------------------------------------------
def test_unknown_tool_raises_mcp_client_error():
    sessions = {"stocks": FakeSession(["get_quote"])}

    async def _go():
        async with MCPClient([_cfg("stocks")], _factory(sessions)) as c:
            with pytest.raises(MCPClientError) as exc:
                await c.call_tool("nonexistent")
            assert exc.value.code == "UNKNOWN_TOOL"

    _run(_go())


def test_unknown_qualified_tool_raises():
    sessions = {"stocks": FakeSession(["get_quote"])}

    async def _go():
        async with MCPClient([_cfg("stocks")], _factory(sessions)) as c:
            with pytest.raises(MCPClientError) as exc:
                await c.call_tool("stocks.nonexistent")
            assert exc.value.code == "UNKNOWN_TOOL"

    _run(_go())


# ---------------------------------------------------------------------------
# 5. read_resource
# ---------------------------------------------------------------------------
def test_read_resource_routes_by_uri_scheme():
    sessions = {
        "stocks": FakeSession([], name="stocks"),
        "filings": FakeSession([], name="filings"),
    }

    async def _go():
        async with MCPClient([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as c:
            text = await c.read_resource("stocks://quotes/live")
            assert "stocks://quotes/live" in text
            # Routed to the STOCKS server by scheme, not filings — the payload
            # carries the serving session's identity, so a mis-route is caught.
            assert text.endswith("@stocks")
            assert "@filings" not in text

    _run(_go())


def test_read_resource_explicit_server():
    sessions = {"stocks": FakeSession([], name="stocks")}

    async def _go():
        async with MCPClient([_cfg("stocks")], _factory(sessions)) as c:
            text = await c.read_resource("stocks://quotes/live", server="stocks")
            assert "stocks://quotes/live" in text
            assert text.endswith("@stocks")

    _run(_go())


# ---------------------------------------------------------------------------
# 6. Lifecycle
# ---------------------------------------------------------------------------
def test_exit_clears_sessions_and_tools():
    sessions = {"stocks": FakeSession(["get_quote"])}
    client = MCPClient([_cfg("stocks")], _factory(sessions))

    async def _go():
        async with client:
            assert client.tools()
            assert client.servers()
        assert client.tools() == []
        assert client.servers() == []

    _run(_go())


# ---------------------------------------------------------------------------
# 7. unwrap_result unit tests (sync — no async needed)
# ---------------------------------------------------------------------------
def test_unwrap_structured_envelope():
    r = _call_result(["NVDA", "MSFT"])
    assert unwrap_result(r) == ["NVDA", "MSFT"]


def test_unwrap_plain_structured():
    r = MagicMock()
    r.is_error = False
    r.structured_content = {"key": "val"}
    assert unwrap_result(r) == {"key": "val"}


def test_unwrap_error_raises():
    r = MagicMock()
    r.is_error = True
    r.structured_content = None
    block = MagicMock()
    block.text = "tool blew up"
    r.content = [block]
    with pytest.raises(MCPClientError) as exc:
        unwrap_result(r)
    assert exc.value.code == "TOOL_ERROR"


def test_unwrap_dict_return_parses_json_text():
    # A dict-returning tool arrives over stdio with structured_content=None and
    # its JSON serialized into a single text block (unlike scalars/lists, which
    # the SDK envelopes). unwrap_result must recover the dict, not a raw string.
    r = MagicMock()
    r.is_error = False
    r.structured_content = None
    block = MagicMock(spec=["text"])
    block.text = '{\n  "delivered": true,\n  "channel": "alerts"\n}'
    r.content = [block]
    out = unwrap_result(r)
    assert out == {"delivered": True, "channel": "alerts"}


def test_unwrap_plain_string_text_is_not_json_parsed():
    # A tool returning a plain string must round-trip unchanged — no speculative
    # json.loads mangling it (guards on the leading { / [).
    r = MagicMock()
    r.is_error = False
    r.structured_content = None
    block = MagicMock(spec=["text"])
    block.text = "just a plain answer"
    r.content = [block]
    assert unwrap_result(r) == "just a plain answer"


# ---------------------------------------------------------------------------
# 8. Live smoke — real stdio subprocess
# ---------------------------------------------------------------------------
@pytest.mark.live
def test_live_stocks_server_discovery_and_call():
    """Connect to mcp_servers.stocks.server over real stdio; discover + call."""
    cfg = ServerConfig(
        name="stocks",
        command=sys.executable,
        args=["-m", "mcp_servers.stocks.server"],
    )

    async def _go():
        async with MCPClient([cfg]) as c:
            names = {t.name for t in c.tools()}
            assert "get_snapshot" in names
            assert "list_watchlist" in names
            result = await c.call_tool("list_watchlist")
            assert isinstance(result, list) and len(result) > 0
            text = await c.read_resource("stocks://quotes/live")
            assert text

    _run(_go())
