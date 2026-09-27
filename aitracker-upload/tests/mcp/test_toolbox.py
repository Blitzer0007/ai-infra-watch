"""MCPToolbox tests — Phase 5 sync bridge over MCPClient.

Hermetic: FakeSessions drive every routing/lifecycle test (no subprocess, no
stdio). A @pytest.mark.live smoke exercises the real stdio path against
mcp_servers.stocks.server through the synchronous facade.

Strategies:
  1. Connect/discover — tools from N servers visible after connect (sync)
  2. Sync call — call() routes and returns a plain value with no await
  3. Namespacing — duplicate name across servers requires qualified form
  4. read — resource routed by URI scheme (sync)
  5. Lifecycle — close() tears down; re-connect is idempotent; not-connected guard
  6. Context manager — with-block connects and closes
  7. Loop isolation — two toolboxes don't fight over one event loop
  8. @pytest.mark.live — real stdio smoke through the sync facade
"""
from __future__ import annotations

import asyncio
import sys

import pytest

from app.mcp_client import MCPToolbox, ServerConfig, ToolInfo
from app.mcp_client.client import MCPClientError
from tests.mcp_fakes import FakeSession
from tests.mcp_fakes import cfg as _cfg
from tests.mcp_fakes import make_factory as _factory


# The in-process FakeSession + helpers are shared via tests/mcp_fakes.py. This
# suite constructs sessions without a `name=`, so read_resource returns a bare
# `resource:{uri}` (no `@server` suffix) — the toolbox tests only assert the URI
# round-trips through the sync facade, not which server served it.


# ---------------------------------------------------------------------------
# 1. Connect / discover (synchronous)
# ---------------------------------------------------------------------------
def test_connect_discovers_tools_from_all_servers():
    sessions = {
        "stocks": FakeSession(["get_quote", "get_snapshot"]),
        "filings": FakeSession(["search_filings"]),
    }
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions))
    tb.connect()
    try:
        names = {t.name for t in tb.tools()}
        assert names == {"get_quote", "get_snapshot", "search_filings"}
        assert tb.servers() == ["stocks", "filings"]
        assert set(tb.tool_names()) == {
            "stocks.get_quote", "stocks.get_snapshot", "filings.search_filings"
        }
        assert all(isinstance(t, ToolInfo) for t in tb.tools())
    finally:
        tb.close()


# ---------------------------------------------------------------------------
# 2. Synchronous call — no await at the call site
# ---------------------------------------------------------------------------
def test_call_returns_plain_value_synchronously():
    stocks = FakeSession(["get_quote"], {"get_quote": "NVDA_DATA"})
    filings = FakeSession(["search_filings"], {"search_filings": "HITS"})
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory({"stocks": stocks, "filings": filings}))
    with tb:
        result = tb.call("get_quote", {"symbol": "NVDA"})
        assert result == "NVDA_DATA"  # a plain value, not a coroutine
        assert not asyncio.iscoroutine(result)
        assert stocks.calls == [("get_quote", {"symbol": "NVDA"})]
        assert filings.calls == []


def test_call_no_args():
    stocks = FakeSession(["list_watchlist"], {"list_watchlist": ["NVDA", "MSFT"]})
    with MCPToolbox([_cfg("stocks")], _factory({"stocks": stocks})) as tb:
        assert tb.call("list_watchlist") == ["NVDA", "MSFT"]


# ---------------------------------------------------------------------------
# 3. Namespacing — duplicate bare name requires qualified form
# ---------------------------------------------------------------------------
def test_qualified_name_disambiguates_duplicate_tool():
    sessions = {
        "stocks": FakeSession(["health"], {"health": "stocks_health"}),
        "filings": FakeSession(["health"], {"health": "filings_health"}),
    }
    with MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as tb:
        assert tb.call("stocks.health") == "stocks_health"
        assert tb.call("filings.health") == "filings_health"


def test_ambiguous_bare_name_raises_through_facade():
    sessions = {"stocks": FakeSession(["health"]), "filings": FakeSession(["health"])}
    with MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as tb:
        with pytest.raises(MCPClientError) as exc:
            tb.call("health")
        assert exc.value.code == "AMBIGUOUS_TOOL"


# ---------------------------------------------------------------------------
# 4. read — resource routed by URI scheme (synchronous)
# ---------------------------------------------------------------------------
def test_read_resource_synchronously():
    sessions = {"stocks": FakeSession([]), "filings": FakeSession([])}
    with MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions)) as tb:
        text = tb.read("stocks://quotes/live")
        assert "stocks://quotes/live" in text
        assert isinstance(text, str)


# ---------------------------------------------------------------------------
# 5. Lifecycle
# ---------------------------------------------------------------------------
def test_call_before_connect_raises():
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": FakeSession(["get_quote"])}))
    with pytest.raises(MCPClientError) as exc:
        tb.call("get_quote")
    assert exc.value.code == "NOT_CONNECTED"


def test_connect_is_idempotent():
    sessions = {"stocks": FakeSession(["get_quote"], {"get_quote": 1})}
    tb = MCPToolbox([_cfg("stocks")], _factory(sessions))
    tb.connect()
    loop_after_first = tb._loop
    tb.connect()  # second connect is a no-op
    try:
        assert tb._loop is loop_after_first
        assert tb.call("get_quote") == 1
    finally:
        tb.close()


def test_close_tears_down_and_is_safe_to_repeat():
    sessions = {"stocks": FakeSession(["get_quote"])}
    tb = MCPToolbox([_cfg("stocks")], _factory(sessions))
    tb.connect()
    tb.close()
    assert tb._client is None and tb._loop is None
    tb.close()  # double close must not raise
    # After close, use is guarded.
    with pytest.raises(MCPClientError) as exc:
        tb.call("get_quote")
    assert exc.value.code == "NOT_CONNECTED"


def test_reconnect_after_close():
    sessions = {"stocks": FakeSession(["get_quote"], {"get_quote": 7})}
    tb = MCPToolbox([_cfg("stocks")], _factory(sessions))
    tb.connect()
    tb.close()
    tb.connect()  # fresh loop + client
    try:
        assert tb.call("get_quote") == 7
    finally:
        tb.close()


# ---------------------------------------------------------------------------
# 6. Context manager
# ---------------------------------------------------------------------------
def test_context_manager_connects_and_closes():
    sessions = {"stocks": FakeSession(["get_quote"], {"get_quote": "OK"})}
    tb = MCPToolbox([_cfg("stocks")], _factory(sessions))
    with tb as t:
        assert t is tb
        assert t.call("get_quote") == "OK"
    # exited -> torn down
    assert tb._client is None and tb._loop is None


# ---------------------------------------------------------------------------
# 7. Loop isolation — two toolboxes each own their own loop
# ---------------------------------------------------------------------------
def test_two_toolboxes_have_independent_loops():
    a = MCPToolbox([_cfg("stocks")], _factory({"stocks": FakeSession(["get_quote"], {"get_quote": "A"})}))
    b = MCPToolbox([_cfg("filings")], _factory({"filings": FakeSession(["answer"], {"answer": "B"})}))
    a.connect()
    b.connect()
    try:
        assert a._loop is not b._loop
        assert a.call("get_quote") == "A"
        assert b.call("answer") == "B"
    finally:
        a.close()
        b.close()


# ---------------------------------------------------------------------------
# 8. Live smoke — real stdio subprocess through the sync facade
# ---------------------------------------------------------------------------
@pytest.mark.live
def test_live_toolbox_over_stdio():
    """Drive mcp_servers.stocks.server over real stdio via the sync facade."""
    cfg = ServerConfig(
        name="stocks",
        command=sys.executable,
        args=["-m", "mcp_servers.stocks.server"],
    )
    with MCPToolbox([cfg]) as tb:
        names = {t.name for t in tb.tools()}
        assert "list_watchlist" in names
        watchlist = tb.call("list_watchlist")
        assert isinstance(watchlist, list) and watchlist
        text = tb.read("stocks://quotes/live")
        assert text
