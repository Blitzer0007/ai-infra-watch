"""ToolRouterAgent tests — Phase 5 dynamic MCP tool routing.

Two layers, kept separate on purpose:

  * GRAPH/AGENT tests drive the real `ToolRouterAgent` over an MCPToolbox
    backed by in-process FakeSessions (no subprocess, no stdio). They inject a
    *canned* routing strategy so the plan is fixed and the assertions target
    discovery / execution / trajectory / degradation — exactly the graph's job.
  * STRATEGY tests exercise the pure `keyword_router` function over hand-built
    ToolInfo lists (scoring, floor, arg-building from input_schema, required-
    param honesty, cap, deterministic tie-break). No graph, no toolbox.

Mapped to the roadmap's 5 agent-testing strategies:
  1. schema        — the run validates as RouterAgentResult and ok() holds
  2. behavioral    — discovery precedes any tool execution
  3. tool-call val — the executed tool + args are exactly what was planned
  4. state-machine — the node path is the expected sequence (both branches)
  5. adversarial   — a tool erroring degrades (recorded, no crash); no-match ok

Plus runtime-discovery, a termination bound, and a @pytest.mark.live smoke
against the real stocks+filings servers over stdio through the default router.
"""
from __future__ import annotations

import sys

import pytest

from app.agents import RouterAgentResult, ToolPlan, ToolRouterAgent, keyword_router
from app.mcp_client import MCPToolbox, ServerConfig, ToolInfo
from app.mcp_client.client import MCPClientError
from tests.agents.conftest import MAX_STEPS
from tests.mcp_fakes import FakeSession
from tests.mcp_fakes import cfg as _cfg
from tests.mcp_fakes import make_factory as _factory


# The in-process FakeSession + helpers are shared via tests/mcp_fakes.py. Here
# sessions are built from full spec dicts (name/description/input_schema) so a
# discovered ToolInfo carries the vocabulary + schema the router reads, and the
# default contract holds: an unknown tool RAISES UNKNOWN_TOOL, a name in `boom`
# raises TOOL_ERROR (a clean mid-run tool failure).


def _canned(*plans: ToolPlan):
    """A routing strategy that always returns the given fixed plans."""
    return lambda question, tools: list(plans)


# Two fake servers mirroring the real stocks + filings tool catalogs.
def _stocks_session() -> FakeSession:
    return FakeSession(
        specs=[
            dict(name="list_watchlist", description="List the tracked watchlist symbols."),
            dict(name="get_snapshot", description="Get quotes for the entire watchlist."),
            dict(name="health", description="Stocks server health snapshot for observability."),
            dict(
                name="get_quote",
                description="Get a real-time quote for one stock symbol.",
                input_schema={"properties": {"symbol": {"type": "string"}}, "required": ["symbol"]},
            ),
        ],
        call_returns={
            "list_watchlist": ["NVDA", "MSFT"],
            "get_snapshot": {"quotes": [{"symbol": "NVDA"}]},
            "health": {"server": "mcp-server-stocks"},
            "get_quote": {"symbol": "NVDA", "price": 100.0},
        },
    )


def _filings_session(boom: set[str] | None = None) -> FakeSession:
    return FakeSession(
        specs=[
            dict(
                name="answer_question",
                description="Answer a question about the filings with citations.",
                input_schema={"properties": {"question": {"type": "string"}}, "required": ["question"]},
            ),
            dict(
                name="search_filings",
                description="Hybrid search over the filing corpus; ranked chunks.",
                input_schema={
                    "properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}},
                    "required": ["query"],
                },
            ),
        ],
        call_returns={
            "answer_question": {"answer": "Data-center revenue grew.", "citations": []},
            "search_filings": {"hits": []},
        },
        boom=boom,
    )


@pytest.fixture
def toolbox():
    sessions = {"stocks": _stocks_session(), "filings": _filings_session()}
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions))
    tb.connect()
    tb._sessions = sessions  # expose for call-arg assertions
    try:
        yield tb
    finally:
        tb.close()


# ===========================================================================
# GRAPH / AGENT tests (canned strategy — the plan is fixed on purpose)
# ===========================================================================

# --- 1. schema -------------------------------------------------------------
def test_run_returns_router_result_and_is_ok(toolbox):
    strategy = _canned(ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0))
    result = ToolRouterAgent(toolbox, strategy=strategy).run("show my watchlist")
    assert isinstance(result, RouterAgentResult)
    assert result.ok()
    assert result.routed == "execute"
    assert result.calls and result.calls[0].tool == "stocks.list_watchlist"
    assert result.calls[0].output == ["NVDA", "MSFT"]
    assert result.error == ""


# --- 2. behavioral: discover before execute --------------------------------
def test_discovery_precedes_execution(toolbox):
    strategy = _canned(ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0))
    result = ToolRouterAgent(toolbox, strategy=strategy).run("watchlist")
    tools = result.trajectory.tools()
    assert tools[0] == "mcp.discover"
    assert "stocks.list_watchlist" in tools
    assert tools.index("mcp.discover") < tools.index("stocks.list_watchlist")


# --- 3. tool-call validation: planned tool + args reach the server ---------
def test_planned_tool_and_args_are_executed_verbatim(toolbox):
    strategy = _canned(
        ToolPlan(tool="filings.answer_question", arguments={"question": "revenue?"}, score=2.0)
    )
    result = ToolRouterAgent(toolbox, strategy=strategy).run("revenue?")
    # The fake filings session recorded exactly the planned call.
    assert toolbox._sessions["filings"].calls == [("answer_question", {"question": "revenue?"})]
    assert toolbox._sessions["stocks"].calls == []  # never touched the other server
    assert result.calls[0].output == {"answer": "Data-center revenue grew.", "citations": []}


# --- 4. state-machine: exact node paths -------------------------------------
def test_happy_path_node_sequence(toolbox):
    strategy = _canned(ToolPlan(tool="stocks.get_snapshot", arguments={}, score=1.0))
    result = ToolRouterAgent(toolbox, strategy=strategy).run("how is the market")
    assert result.trajectory.nodes() == ["discover", "route", "execute", "finalize"]


def test_no_match_routes_straight_to_finalize(toolbox):
    result = ToolRouterAgent(toolbox, strategy=_canned()).run("unanswerable by any tool")
    assert result.trajectory.nodes() == ["discover", "route", "finalize"]
    assert result.routed == "no_route"
    assert result.plan == []
    assert result.calls == []
    assert not result.ok()
    assert result.error == ""  # a clean no-match, not an error


# --- 5. adversarial / graceful degradation ---------------------------------
def test_tool_error_is_recorded_not_raised():
    sessions = {"stocks": _stocks_session(), "filings": _filings_session(boom={"answer_question"})}
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions))
    tb.connect()
    try:
        strategy = _canned(
            ToolPlan(tool="filings.answer_question", arguments={"question": "x"}, score=1.0)
        )
        result = ToolRouterAgent(tb, strategy=strategy).run("x")
    finally:
        tb.close()
    assert not result.ok()
    assert result.routed == "execute"
    assert result.calls[0].ok is False
    assert "blew up" in result.calls[0].error
    # The failure is a recorded, failed tool step — the run still terminated.
    failed = [s for s in result.trajectory.steps if s.kind == "tool" and not s.ok]
    assert failed and failed[0].tool == "filings.answer_question"


def test_partial_failure_keeps_the_surviving_call():
    sessions = {"stocks": _stocks_session(), "filings": _filings_session(boom={"answer_question"})}
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory(sessions))
    tb.connect()
    try:
        strategy = _canned(
            ToolPlan(tool="filings.answer_question", arguments={"question": "x"}, score=1.0),
            ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0),
        )
        result = ToolRouterAgent(tb, strategy=strategy).run("x")
    finally:
        tb.close()
    assert not result.ok()  # all-must-succeed for ok()
    assert len(result.calls) == 2
    # The good call survived and its output is retrievable.
    assert result.outputs() == {"stocks.list_watchlist": ["NVDA", "MSFT"]}


# --- runtime discovery: no hardcoded deps ----------------------------------
def test_discovered_catalog_reflects_connected_servers(toolbox):
    result = ToolRouterAgent(toolbox, strategy=_canned()).run("anything")
    assert set(result.discovered) == {
        "stocks.list_watchlist", "stocks.get_snapshot", "stocks.health", "stocks.get_quote",
        "filings.answer_question", "filings.search_filings",
    }


# --- default strategy end-to-end (real keyword_router over the toolbox) -----
def test_default_keyword_router_routes_watchlist_question(toolbox):
    result = ToolRouterAgent(toolbox).run("show me the current watchlist symbols")
    assert result.ok()
    assert result.routed == "execute"
    called = {c.tool for c in result.calls}
    assert "stocks.list_watchlist" in called
    # It must NOT route to get_quote — that requires a `symbol` it can't supply.
    assert "stocks.get_quote" not in called


# --- termination -----------------------------------------------------------
def test_run_terminates_within_bound(toolbox):
    strategy = _canned(
        ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0),
        ToolPlan(tool="stocks.get_snapshot", arguments={}, score=1.0),
    )
    result = ToolRouterAgent(toolbox, strategy=strategy).run("watchlist")
    assert len(result.trajectory.steps) <= MAX_STEPS


# ===========================================================================
# STRATEGY tests — pure keyword_router over hand-built ToolInfo lists
# ===========================================================================
def _info(server: str, name: str, description: str = "", schema: dict | None = None) -> ToolInfo:
    return ToolInfo(server=server, name=name, description=description, input_schema=schema or {})


_WATCHLIST = _info("stocks", "list_watchlist", "List the tracked watchlist symbols.")
_SNAPSHOT = _info("stocks", "get_snapshot", "Get quotes for the entire watchlist.")
_HEALTH = _info("stocks", "health", "Stocks server health snapshot for observability.")
_GET_QUOTE = _info(
    "stocks", "get_quote", "Get a real-time quote for one stock symbol.",
    {"properties": {"symbol": {"type": "string"}}, "required": ["symbol"]},
)
_ANSWER = _info(
    "filings", "answer_question", "Answer a question about the filings with citations.",
    {"properties": {"question": {"type": "string"}}, "required": ["question"]},
)
_SEARCH = _info(
    "filings", "search_filings", "Hybrid search over the filing corpus; ranked chunks.",
    {"properties": {"query": {"type": "string"}, "top_k": {"type": "integer"}}, "required": ["query"]},
)


def test_router_scores_by_keyword_overlap():
    plan = keyword_router("show my watchlist symbols", [_WATCHLIST, _SNAPSHOT, _HEALTH])
    names = {p.tool for p in plan}
    assert "stocks.list_watchlist" in names  # matches watchlist + symbols
    assert "stocks.health" not in names      # no overlap


def test_router_skips_tool_with_unsatisfiable_required_param():
    # 'quote' + 'symbol' overlap get_quote, but its required `symbol` cannot be
    # filled from the question, so the router must NOT plan it.
    plan = keyword_router("get a real-time quote for a symbol", [_GET_QUOTE])
    assert plan == []


def test_router_fills_question_arg_from_schema():
    q = "answer a question about the filings"
    plan = keyword_router(q, [_ANSWER])
    assert len(plan) == 1
    assert plan[0].tool == "filings.answer_question"
    assert plan[0].arguments == {"question": q}


def test_router_fills_query_but_omits_optional_param():
    q = "search the corpus for guidance"
    plan = keyword_router(q, [_SEARCH])
    assert len(plan) == 1
    # `query` is fillable; `top_k` is optional and left out (not guessed).
    assert plan[0].arguments == {"query": q}


def test_router_returns_empty_below_floor():
    assert keyword_router("completely unrelated banana", [_WATCHLIST, _ANSWER]) == []


def test_router_caps_at_max_tools():
    tools = [_WATCHLIST, _SNAPSHOT, _ANSWER, _SEARCH]
    plan = keyword_router("watchlist filings corpus symbols", tools, max_tools=2)
    assert len(plan) <= 2


def test_router_tiebreak_is_deterministic_by_qualified_name():
    # Two tools that tie on score must come back in a stable, name-sorted order.
    a = _info("zserver", "watchlist_tool", "the watchlist")
    b = _info("aserver", "watchlist_tool", "the watchlist")
    plan = keyword_router("watchlist", [a, b])
    assert [p.tool for p in plan] == ["aserver.watchlist_tool", "zserver.watchlist_tool"]


# ===========================================================================
# Live smoke — real stocks + filings servers over stdio, default router
# ===========================================================================
@pytest.mark.live
def test_live_router_over_real_servers():
    """The default keyword router, over two REAL MCP servers, routes a market
    question to a stocks tool and a filings question to a filings tool — with
    zero hardcoded service deps in the agent."""
    stocks = ServerConfig(name="stocks", command=sys.executable, args=["-m", "mcp_servers.stocks.server"])
    filings = ServerConfig(name="filings", command=sys.executable, args=["-m", "mcp_servers.filings.server"])
    with MCPToolbox([stocks, filings]) as tb:
        agent = ToolRouterAgent(tb)

        # Market question -> stocks tools (list_watchlist/get_snapshot: no LLM,
        # so the whole run is cleanly ok).
        market = agent.run("show me the current watchlist symbols")
        assert market.ok()
        assert any(c.ok and c.tool.startswith("stocks.") for c in market.calls)

        # Filings question -> filings tools. The router (greedy) plans both
        # search_filings (BM25, no LLM -> succeeds) and answer_question (needs
        # an LLM fixture/key, expected to no-op in stub mode). Routing to the
        # right server with at least one real successful call is the point here,
        # not RAG answer quality.
        docs = agent.run("search the filings for data center revenue")
        assert docs.routed == "execute"
        assert any(c.ok and c.tool.startswith("filings.") for c in docs.calls)
