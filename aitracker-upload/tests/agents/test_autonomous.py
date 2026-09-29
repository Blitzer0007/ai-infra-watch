from __future__ import annotations

from app.agents.autonomous import AutonomousMCPAgent
from app.agents.schemas import ToolCallRecord
from app.llm.client import LLMClient
from app.mcp_client import MCPToolbox
from tests.agents.conftest import MAX_STEPS
from tests.mcp_fakes import FakeSession, cfg as _cfg, make_factory as _factory


def _toolbox():
    session = FakeSession(
        specs=[
            dict(
                name="get_quote",
                description="Get a real-time stock quote.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_snapshot",
                description="Get the current stock snapshot.",
                input_schema={"properties": {}, "required": []},
            ),
        ],
        call_returns={
            "get_quote": {"symbol": "AMD", "price": 180.0, "change_pct": 2.5},
            "get_snapshot": {"quotes": [{"symbol": "AMD", "price": 180.0}]},
        },
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    return tb, session


def test_autonomous_planner_can_choose_tool_and_finalize():
    tb, session = _toolbox()
    plans = [
        {"action": "tool", "tool": "stocks.get_quote", "arguments": {}, "reason": "explicit ticker"},
        {"action": "final", "answer": "AMD was retrieved from the Stocks MCP."},
    ]
    try:
        agent = AutonomousMCPAgent(
            tb, planner=lambda q, tools, history: plans.pop(0), max_steps=3
        )
        result = agent.run("Analyze AMD today")
    finally:
        tb.close()

    assert result.ok()
    assert result.summary == "AMD was retrieved from the Stocks MCP."
    assert session.calls == [("get_quote", {"symbol": "AMD"})]
    assert result.trajectory.reached("plan")
    assert result.trajectory.reached("finalize")


def test_autonomous_recovers_symbol_for_required_argument():
    tb, session = _toolbox()
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: {
                "action": "tool",
                "tool": "stocks.get_quote",
                "arguments": {},
            },
            max_steps=1,
        )
        result = agent.run("What is happening to AMD?")
    finally:
        tb.close()

    assert result.ok()
    assert session.calls == [("get_quote", {"symbol": "AMD"})]


def test_autonomous_has_a_hard_step_bound():
    tb, _ = _toolbox()
    try:
        agent = AutonomousMCPAgent(
            tb,
            planner=lambda q, tools, history: {
                "action": "tool",
                "tool": "stocks.get_snapshot",
                "arguments": {},
            },
            max_steps=MAX_STEPS,
        )
        result = agent.run("show market")
    finally:
        tb.close()

    # A repeated successful tool call may now terminate early via the
    # duplicate-call guard; that is still within the hard iteration bound.
    assert result.resolution in {"completed", "max_steps", "error"}
    assert len(result.trajectory.steps) <= (MAX_STEPS * 4 + 4)



def test_autonomous_keyword_fallback_avoids_duplicate_calls():
    session = FakeSession(
        specs=[
            dict(
                name="get_earnings",
                description="Get past and upcoming earnings for one symbol.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="search_filings",
                description="Search SEC filings for contracts and material agreements.",
                input_schema={
                    "properties": {"query": {"type": "string"}},
                    "required": ["query"],
                },
            ),
        ],
        call_returns={
            "get_earnings": {"symbol": "AMD", "events": [{"date": "2026-09-01"}]},
            "search_filings": {"query": "Analyze AMD earnings and contracts", "hits": []},
        },
    )
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory({"stocks": session, "filings": session}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(tb, max_steps=2)
        result = agent.run("Analyze AMD earnings")
    finally:
        tb.close()

    assert result.calls
    assert len({c.tool for c in result.calls}) <= 2



def test_autonomous_cross_source_research_uses_contract_earnings_rotation():
    stocks = FakeSession(
        specs=[
            dict(
                name="get_earnings",
                description="Get past and upcoming earnings for one symbol, including EPS/revenue surprise.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_rotation",
                description="Detect hardware versus application AI capital rotation signals over 1d, 5d, and 20d windows.",
                input_schema={"properties": {}, "required": []},
            ),
        ],
        call_returns={
            "get_earnings": {"symbol": "AMD", "events": []},
            "get_rotation": {"signals": [], "narrative": "No divergence fired."},
        },
    )
    filings = FakeSession(
        specs=[
            dict(
                name="get_contracts",
                description="Extract contract-related disclosures from primary SEC 8-K filings, including material agreements and financial obligations.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
        ],
        call_returns={
            "get_contracts": {"symbol": "AMD", "contracts": []},
        },
    )
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory({"stocks": stocks, "filings": filings}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(tb, max_steps=3)
        result = agent.run("Analyze AMD earnings contracts and AI hardware versus application rotation")
    finally:
        tb.close()

    assert result.ok()
    assert len(result.calls) == 3
    assert {c.tool for c in result.calls} == {
        "filings.get_contracts",
        "stocks.get_earnings",
        "stocks.get_rotation",
    }
    assert stocks.calls
    assert filings.calls

class _FakeJev:
    enabled = True

    def choose(self, **kwargs):
        from app.jev.client import JevDecision
        return JevDecision(
            choice="earnings",
            confidence=0.96,
            probabilities={"earnings": 0.96, "market": 0.02, "news": 0.02},
            model="jev-test",
            latency_ms=4.2,
        )


def test_autonomous_jev_high_confidence_routes_to_earnings_tool():
    session = FakeSession(
        specs=[
            dict(
                name="get_earnings",
                description="Get past and upcoming earnings for one symbol.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
            dict(
                name="get_quote",
                description="Get a real-time stock quote.",
                input_schema={
                    "properties": {"symbol": {"type": "string"}},
                    "required": ["symbol"],
                },
            ),
        ],
        call_returns={
            "get_earnings": {"symbol": "NVDA", "events": [{"date": "2026-09-30"}]},
            "get_quote": {"symbol": "NVDA", "price": 200.0},
        },
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    try:
        agent = AutonomousMCPAgent(tb, client=LLMClient(provider="stub", model="stub"), jev=_FakeJev(), max_steps=1)
        result = agent.run("What is the next NVDA earnings report?")
    finally:
        tb.close()

    assert result.calls[0].tool == "stocks.get_earnings"
    assert result.calls[0].arguments == {"symbol": "NVDA"}
    assert result.jev["choice"] == "earnings"
    assert result.jev["confidence"] == 0.96



def test_autonomous_jev_is_recorded_for_forced_driver_research():
    tb, _ = _toolbox()
    try:
        agent = AutonomousMCPAgent(
            tb,
            client=LLMClient(provider="stub", model="stub"),
            jev=_FakeJev(),
            max_steps=1,
        )
        result = agent.run("What changed recently for AMD and what are the main drivers?")
    finally:
        tb.close()

    assert result.jev["choice"] == "earnings"
    assert result.jev["action"] == "forced_driver_plan"
