from __future__ import annotations

from app.agents.autonomous import AutonomousMCPAgent
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

    assert result.resolution in {"max_steps", "error"}
    assert len(result.trajectory.steps) <= (MAX_STEPS * 4 + 4)
