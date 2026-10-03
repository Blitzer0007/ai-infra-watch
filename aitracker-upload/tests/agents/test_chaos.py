"""Multi-agent chaos + orchestration tests — Phase 5 (roadmap Strategy 5 & 6).

The roadmap names the hardest multi-agent QA case explicitly (build step 14):
"kill an MCP server mid-execution, verify graceful recovery." This suite proves
that the orchestration layer DEGRADES rather than crashes when the infrastructure
under it fails partway through a run — the property that separates a toy demo
from something you'd run unattended.

Three failure surfaces, one theme (partial failure never aborts the whole run):

  * TOOL LAYER  — an MCP server that connects and lists tools fine, then dies
    mid-run so `call_tool` starts raising a transport error (a crashed
    subprocess, not a clean tool-level error). The ToolRouterAgent must record
    the failed call, keep any surviving calls, and still terminate with a valid
    result + intact trajectory.
  * ORCHESTRATION — a SupervisorAgent whose one specialist throws: the other
    branch's answer must still flow through merge (graceful degradation), and a
    supervisor whose BOTH branches fail must still return a clean not-ok result,
    never raise.
  * HANDOFF     — a SwarmCoordinator whose Data node raises mid-chain must end
    with resolution "error" and a partial path, and an always-refusing Research
    node must trip the hop bound instead of looping forever (emergent-behavior
    guard under a real failure, not a canned one).

All hermetic: the "server" is an in-process session over the SAME
`session_factory` seam the real toolbox uses, so no subprocess is killed — the
session is *made to fail* exactly where a dead subprocess would surface.
"""
from __future__ import annotations

import pytest

from app.agents import (
    FilingsAgentResult,
    HandoffRequest,
    MarketAgentResult,
    RouterAgentResult,
    SupervisorAgent,
    SupervisorResult,
    ToolPlan,
    ToolRouterAgent,
)
from app.agents.handoff import SwarmCoordinator
from app.mcp_client import MCPToolbox
from tests.agents.conftest import MAX_STEPS, FakeAgent
from tests.mcp_fakes import FakeSession
from tests.mcp_fakes import cfg as _cfg
from tests.mcp_fakes import make_factory as _factory


# ---------------------------------------------------------------------------
# A session that connects + lists tools cleanly, then DIES mid-run: after
# `healthy_calls` successful calls, every subsequent call_tool raises a
# transport-level error — what a crashed stdio subprocess surfaces as, distinct
# from a clean tool-level `is_error` result. `healthy_calls=0` kills it from the
# very first call (a server that was already down when execution reached it).
#
# This is the shared FakeSession with `unknown_ok=True` (a call with no canned
# value returns an empty result rather than raising — the None-tolerant chaos
# contract) plus `crash_after=healthy_calls`.
# ---------------------------------------------------------------------------
def CrashableSession(
    specs: list[dict],
    call_returns: dict | None = None,
    healthy_calls: int = 0,
) -> FakeSession:
    return FakeSession(
        specs, call_returns, unknown_ok=True, crash_after=healthy_calls
    )


def _canned(*plans: ToolPlan):
    return lambda question, tools: list(plans)


# Two-tool specs mirroring a stocks + filings server so a plan can touch both.
_STOCKS_SPECS = [
    dict(name="list_watchlist", description="List the tracked watchlist symbols."),
    dict(name="get_snapshot", description="Get quotes for the entire watchlist."),
]
_FILINGS_SPECS = [
    dict(
        name="answer_question",
        description="Answer a question about the filings with citations.",
        input_schema={"properties": {"question": {"type": "string"}}, "required": ["question"]},
    ),
]


def _market_result(summary: str = "NVDA up 2%.") -> MarketAgentResult:
    """A minimal but VALID MarketAgentResult (`.ok()` is True)."""
    from app.synthesis.pipeline import MarketSynthesis

    return MarketAgentResult(
        synthesis=MarketSynthesis(date="2026-08-03", summary=summary, insights=[]),
        symbols=["NVDA"],
    )


def _filings_result(answer: str = "Data-center revenue grew.") -> FilingsAgentResult:
    """A minimal but VALID FilingsAgentResult (`.ok()` is True)."""
    from mcp_servers.filings.schemas import AnswerResult

    return FilingsAgentResult(
        question="revenue?",
        answer=AnswerResult(answer=answer, citations=[]),
        routed="generate",
    )


# ===========================================================================
# SURFACE 1 — TOOL LAYER: an MCP server that dies mid-execution.
#
# The roadmap's named case (build step 14): "kill an MCP server mid-execution,
# verify graceful recovery." The ToolRouterAgent plans several calls; the
# server serves the first, then the subprocess dies and every further call
# raises a transport error. The run must record the failed call, keep the
# survivor, and still terminate with a valid result + intact trajectory.
# ===========================================================================
def test_router_survives_server_death_midplan():
    # Two planned calls against ONE server; it serves 1 healthy call, then dies.
    session = CrashableSession(
        _STOCKS_SPECS,
        call_returns={"list_watchlist": ["NVDA", "MSFT"], "get_snapshot": {"quotes": []}},
        healthy_calls=1,
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    try:
        strategy = _canned(
            ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0),
            ToolPlan(tool="stocks.get_snapshot", arguments={}, score=0.9),
        )
        result = ToolRouterAgent(tb, strategy=strategy).run("watchlist then snapshot")
    finally:
        tb.close()

    # The run did NOT raise; it produced a valid, inspectable record.
    assert isinstance(result, RouterAgentResult)
    assert result.routed == "execute"
    # First call survived, second hit the dead server and degraded — recorded,
    # not raised. The plan was NOT aborted at the crash: both calls attempted.
    assert len(result.calls) == 2
    assert result.calls[0].ok and result.calls[0].output == ["NVDA", "MSFT"]
    assert not result.calls[1].ok
    assert "SERVER_DOWN" in result.calls[1].error or "server lost" in result.calls[1].error
    # Trajectory stays intact and bounded — discovery still recorded, no loop.
    nodes = result.trajectory.nodes()
    assert nodes == ["discover", "route", "execute", "finalize"]
    assert len(result.trajectory.steps) <= MAX_STEPS


def test_router_survives_server_dead_from_first_call():
    # The server lists tools fine (discovery succeeds) but is already dead by
    # the time execute reaches it: healthy_calls=0 -> the very first call raises.
    session = CrashableSession(_STOCKS_SPECS, call_returns={}, healthy_calls=0)
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    try:
        strategy = _canned(ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0))
        result = ToolRouterAgent(tb, strategy=strategy).run("watchlist")
    finally:
        tb.close()

    # Discovery succeeded (the catalog was read before the crash) but the one
    # planned call failed. A single all-failed call => not a usable answer, but
    # a CLEAN record, never an exception.
    assert result.discovered == ["stocks.list_watchlist", "stocks.get_snapshot"]
    assert len(result.calls) == 1 and not result.calls[0].ok
    assert result.outputs() == {}  # no successful output
    assert result.trajectory.nodes() == ["discover", "route", "execute", "finalize"]


def test_router_keeps_healthy_server_when_a_peer_dies():
    # Two servers, one healthy, one dead-on-first-call. A plan spanning both
    # must keep the healthy server's output and only degrade the dead one.
    stocks = CrashableSession(
        _STOCKS_SPECS, call_returns={"list_watchlist": ["NVDA"]}, healthy_calls=99
    )
    filings = CrashableSession(_FILINGS_SPECS, call_returns={}, healthy_calls=0)
    tb = MCPToolbox([_cfg("stocks"), _cfg("filings")], _factory({"stocks": stocks, "filings": filings}))
    tb.connect()
    try:
        strategy = _canned(
            ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0),
            ToolPlan(tool="filings.answer_question", arguments={"question": "x"}, score=0.8),
        )
        result = ToolRouterAgent(tb, strategy=strategy).run("both servers")
    finally:
        tb.close()

    outs = result.outputs()
    assert outs == {"stocks.list_watchlist": ["NVDA"]}  # only the survivor
    assert any(not c.ok and c.tool == "filings.answer_question" for c in result.calls)


# ===========================================================================
# SURFACE 2 — ORCHESTRATION: a specialist crashes under the supervisor.
#
# Hub-and-spoke degradation: one specialist throwing must not sink the run —
# the other branch's answer still flows through merge. And a supervisor whose
# BOTH branches fail must return a clean not-ok result, never raise.
# ===========================================================================
def test_supervisor_degrades_when_one_specialist_crashes():
    # Cross-domain question -> fan out to BOTH; market booms, filings answers.
    market = FakeAgent(boom=RuntimeError("market subprocess died"))
    filings = FakeAgent(result=_filings_result("Revenue grew on data-center demand."))
    sup = SupervisorAgent(market_agent=market, filings_agent=filings)
    result = sup.run("how did the stock move and what did the filing say about revenue?")

    assert result.route == "both"
    # The surviving branch's answer flowed through merge (graceful degradation).
    assert result.ok()
    assert "Revenue grew on data-center demand." in result.summary
    # The crash is recorded for observability, not swallowed silently.
    assert "market_failed" in result.error
    assert market.calls and filings.calls  # both were actually invoked
    assert len(result.trajectory.steps) <= MAX_STEPS


def test_supervisor_returns_clean_not_ok_when_both_specialists_crash():
    market = FakeAgent(boom=RuntimeError("market down"))
    filings = FakeAgent(boom=RuntimeError("filings down"))
    sup = SupervisorAgent(market_agent=market, filings_agent=filings)
    result = sup.run("stock move and revenue filing")  # both -> fan out to both

    # No specialist succeeded: not ok, but a valid record — never an exception.
    assert not result.ok()
    assert "market_failed" in result.error and "filings_failed" in result.error
    # Both branch errors accumulated through the concurrent-write reducer.
    assert result.market is None and result.filings is None
    assert isinstance(result, SupervisorResult)


def test_supervisor_survives_specialist_returning_none():
    # A misbehaving specialist that returns None (not an exception) must also
    # degrade, not crash on the missing `.ok()`.
    market = FakeAgent(result=None)
    filings = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=market, filings_agent=filings)
    result = sup.run("stock move and revenue")

    assert result.ok()  # filings carried it
    assert "market_failed: no result" in result.error


# ===========================================================================
# SURFACE 3 — HANDOFF: a swarm node fails, and the emergent-behavior guard.
#
# A Data node raising mid-chain must end resolution "error" with a partial
# path (the swarm degrades, it doesn't crash). And an always-refusing chain
# must trip the hop bound rather than loop forever — the guard proven under a
# REAL failure (a node that genuinely can't answer), not a canned request.
# ===========================================================================
class _SettleNode:
    """A node that always settles with a fixed answer (no handoff)."""

    def __init__(self, name: str, answer: str) -> None:
        self.name = name
        self._answer = answer

    def invoke(self, context):
        return {"answer": self._answer}, None

    def render(self, result) -> str:
        return result["answer"]


class _HandoffNode:
    """A node that always hands off to `to`, carrying `context` forward."""

    def __init__(self, name: str, to: str, context: dict | None = None) -> None:
        self.name = name
        self._to = to
        self._context = context or {}

    def invoke(self, context):
        return None, HandoffRequest(to=self._to, reason="always", context=dict(self._context))

    def render(self, result) -> str:
        return ""


class _BoomNode:
    """A node that raises the moment it is invoked (a crashed agent)."""

    def __init__(self, name: str, exc: Exception) -> None:
        self.name = name
        self._exc = exc

    def invoke(self, context):
        raise self._exc

    def render(self, result) -> str:  # pragma: no cover - never settles here
        return ""


def test_swarm_node_crash_ends_error_with_partial_path():
    # research hands to data; data BOOMS. The swarm must record the partial
    # path and end resolution "error", never propagate the exception.
    nodes = {
        "research": _HandoffNode("research", to="data"),
        "data": _BoomNode("data", RuntimeError("ingest subprocess died")),
    }
    swarm = SwarmCoordinator(nodes, entry="research")
    result = swarm.run("fetch and answer")

    assert result.resolution == "error"
    assert not result.ok()
    assert result.path == ["research", "data"]  # got as far as data, then failed
    assert "ingest subprocess died" in result.error
    # The failed hop is recorded (observability) and the trajectory is bounded.
    assert result.hops[-1].agent == "data" and not result.hops[-1].ok
    assert len(result.trajectory.steps) <= MAX_STEPS


def test_swarm_always_refusing_chain_trips_hop_bound_not_infinite_loop():
    # research and data each ALWAYS hand off to the other but carry NO one-shot
    # flag — a genuine circular delegation. A guard must terminate it; either
    # bound (cycle or max_hops) is acceptable, an infinite loop is not.
    nodes = {
        "research": _HandoffNode("research", to="data"),
        "data": _HandoffNode("data", to="research"),
    }
    swarm = SwarmCoordinator(nodes, entry="research", max_hops=4)
    result = swarm.run("loop forever?")

    assert result.resolution in {"cycle", "max_hops"}
    assert not result.ok()
    # Terminated cleanly and well within the step bound (no runaway).
    assert len(result.path) <= 4
    assert len(result.trajectory.steps) <= MAX_STEPS


def test_swarm_handoff_to_unknown_target_degrades():
    # A node hands off to a name that isn't wired — degrade, don't crash.
    nodes = {"research": _HandoffNode("research", to="nonexistent")}
    swarm = SwarmCoordinator(nodes, entry="research")
    result = swarm.run("go nowhere")

    assert result.resolution == "unknown_target"
    assert not result.ok()
    assert "nonexistent" in result.error


def test_swarm_healthy_partner_still_settles_after_one_hop():
    # Control: research hands to data, data settles with a real answer. Proves
    # the chaos tests above aren't masking a swarm that can't complete at all.
    nodes = {
        "research": _HandoffNode("research", to="data"),
        "data": _SettleNode("data", "the answer"),
    }
    swarm = SwarmCoordinator(nodes, entry="research")
    result = swarm.run("hand off then answer")

    assert result.resolution == "settled"
    assert result.ok()
    assert result.answer == "the answer"
    assert result.path == ["research", "data"]


# ===========================================================================
# TRAJECTORY CONTRACT — malformed traces must be detectable deterministically.
# ===========================================================================

def test_agent_trajectory_validates_node_tool_order_and_duration():
    from app.agents.trajectory import AgentTrajectory, Step

    valid = AgentTrajectory(
        steps=[
            Step(node="plan", kind="node", duration_ms=1.0),
            Step(node="plan", kind="tool", tool="stocks.get_quote", duration_ms=0.2),
            Step(node="finalize", kind="node", duration_ms=0.4),
            Step(node="finalize", kind="llm", tool="synthesis", duration_ms=0.1),
        ]
    )
    assert valid.is_valid()
    assert valid.validate() == []


def test_agent_trajectory_flags_orphan_and_cross_node_steps():
    from app.agents.trajectory import AgentTrajectory, Step

    malformed = AgentTrajectory(
        steps=[
            Step(node="", kind="tool", tool="stocks.get_quote"),
            Step(node="route", kind="node", duration_ms=1.0),
            Step(node="execute", kind="tool", tool="stocks.get_quote", duration_ms=-1.0),
        ]
    )
    violations = malformed.validate()
    assert any("missing node" in item for item in violations)
    assert any("invalid duration" in item for item in violations)
    assert any("belongs to 'execute'" in item for item in violations)
    assert not malformed.is_valid()


def test_router_trajectory_is_audit_valid_after_partial_server_failure():
    session = CrashableSession(
        _STOCKS_SPECS,
        call_returns={"list_watchlist": ["NVDA"]},
        healthy_calls=1,
    )
    tb = MCPToolbox([_cfg("stocks")], _factory({"stocks": session}))
    tb.connect()
    try:
        strategy = _canned(
            ToolPlan(tool="stocks.list_watchlist", arguments={}, score=1.0),
            ToolPlan(tool="stocks.get_snapshot", arguments={}, score=0.9),
        )
        result = ToolRouterAgent(tb, strategy=strategy).run("watchlist then snapshot")
    finally:
        tb.close()

    assert result.trajectory.is_valid()
    assert not result.calls[-1].ok
