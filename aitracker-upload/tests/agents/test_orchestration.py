"""End-to-end orchestration tests — Phase 5 (roadmap Strategy 6).

The chaos suite (`test_chaos.py`) proves the multi-agent system DEGRADES under
failure. This suite proves the other half: the full pipeline WORKS end-to-end
and stays observable, bounded, and regression-guarded on the golden path. It is
the "End-to-End Orchestration Testing" strategy (roadmap lines 921-925):

  * GOLDEN PATH — a known-good question through the whole supervisor pipeline,
    asserting BOTH the top-level orchestration trajectory (classify -> fan-out
    -> merge) AND the nested specialist trajectories (market's gather->
    synthesize, filings' retrieve->generate) are well-formed and complete. The
    supervisor test already checks the top level; here we verify the pipeline
    is inspectable all the way DOWN, using the Phase-4 harness assertions.
  * REPLAY / REGRESSION — record a golden supervisor run, replay the SAME
    inputs, diff the trajectory. A clean diff is the baseline; a silent reroute
    (an added/dropped/reordered node from a future refactor) shows up as a
    non-empty diff. The harness replay library was only exercised on a single
    agent (filings) before; this extends it to the MULTI-AGENT pipeline.
  * BUDGET / COST — the roadmap's "does the system stay within token budget?".
    Hermetically, the deterministic proxy for token spend is the count of
    `kind=="llm"` steps across the pipeline (supervisor + both nested
    specialists). A both-path run makes exactly the LLM calls we expect and no
    more — a runaway re-invocation would blow the count.
  * TIMEOUT / DEGRADATION — a specialist that hangs-then-fails (simulated by a
    raising specialist, since a real wall-clock hang would be non-hermetic)
    must not stall the pipeline: the survivor's answer still merges. This is
    the "set max execution time, verify graceful degradation" line, expressed
    as a bounded-step guarantee (the recursion/step ceiling) rather than a
    flaky wall-clock timer.

All hermetic: the supervisor runs over the real fixture-backed specialists
(stub LLM + fixture services), so every run is deterministic and replay diffs
are clean by construction.
"""
from __future__ import annotations

import json

import pytest

from app.agents import SupervisorAgent, SupervisorResult
from app.agents.schemas import FilingsAgentResult, MarketAgentResult
from app.agents.trajectory import AgentTrajectory
from app.harness import (
    assert_no_failed_steps,
    assert_node_order,
    assert_steps_bounded,
    assert_visited,
    assert_well_formed,
    diff_trajectories,
    record_run,
    recorded_trajectory,
    replay_run,
)
from tests.agents.conftest import FakeAgent, MAX_STEPS

# Questions with committed LLM fixtures (same as the supervisor suite, so the
# stub client has the exact prompt-hash fixtures these runs compute).
MARKET_ONLY = "How did the watchlist move today?"
FILINGS_ONLY = "How much did NVIDIA data center revenue grow?"
BOTH = "How did NVIDIA stock move and how much did its data center revenue grow?"


def _market_result(summary: str = "NVDA gained.") -> MarketAgentResult:
    from app.synthesis.pipeline import MarketSynthesis, TickerInsight

    return MarketAgentResult(
        synthesis=MarketSynthesis(
            date="2026-08-03",
            summary=summary,
            insights=[TickerInsight(ticker="NVDA", move_pct=1.0, reason="test")],
        ),
        symbols=["NVDA"],
    )


def _filings_result(answer: str = "Revenue grew 122%.") -> FilingsAgentResult:
    from mcp_servers.filings.schemas import AnswerResult

    return FilingsAgentResult(
        question=FILINGS_ONLY,
        routed="generate",
        answer=AnswerResult(answer=answer, citations=[]),
    )


def _llm_steps(traj: AgentTrajectory) -> int:
    """Count LLM-call steps in a trajectory — the hermetic token-spend proxy."""
    return sum(1 for s in traj.steps if s.kind == "llm")


def _pipeline_llm_calls(result: SupervisorResult) -> int:
    """Total LLM calls across the whole pipeline: the supervisor's own
    trajectory (deterministic, zero LLM calls) plus each nested specialist's."""
    total = _llm_steps(result.trajectory)
    if result.market is not None:
        total += _llm_steps(result.market.trajectory)
    if result.filings is not None:
        total += _llm_steps(result.filings.trajectory)
    return total


# ===========================================================================
# GOLDEN PATH — the full pipeline works and is inspectable top-to-bottom.
# ===========================================================================
def test_golden_pipeline_top_and_nested_trajectories_well_formed(supervisor_agent):
    r = supervisor_agent.run(BOTH)
    assert isinstance(r, SupervisorResult) and r.ok()

    # Top-level orchestration path: classify first, merge last, both specialists.
    top = r.trajectory
    assert_well_formed(top)
    assert top.nodes()[0] == "classify" and top.nodes()[-1] == "merge"
    assert_node_order(top, "classify", "merge")
    assert_no_failed_steps(top)

    # Nested specialist trajectories are complete and well-formed too — the
    # pipeline is observable all the way down, not just at the supervisor.
    assert r.market is not None and r.filings is not None
    assert_well_formed(r.market.trajectory)
    assert_visited(r.market.trajectory, "synthesize")
    assert_node_order(r.market.trajectory, "gather_quotes", "finalize")
    assert_well_formed(r.filings.trajectory)
    assert_visited(r.filings.trajectory, "generate")
    assert_node_order(r.filings.trajectory, "retrieve", "generate")


def test_golden_single_route_paths_reach_their_specialist(supervisor_agent):
    # Market-only question exercises only the market branch end-to-end.
    m = supervisor_agent.run(MARKET_ONLY)
    assert m.route == "market" and m.ok()
    assert m.market is not None and m.market.ok()
    assert m.filings is None
    assert_visited(m.market.trajectory, "synthesize")

    # Filings-only question exercises only the filings branch end-to-end.
    f = supervisor_agent.run(FILINGS_ONLY)
    assert f.route == "filings" and f.ok()
    assert f.filings is not None and f.filings.ok()
    assert f.market is None
    assert_visited(f.filings.trajectory, "generate")


# ===========================================================================
# REPLAY / REGRESSION — record a golden run, replay, diff the trajectory.
# ===========================================================================
def test_replay_of_pipeline_is_deterministic(tmp_path, supervisor_agent):
    path = tmp_path / "supervisor_both.json"
    original = record_run(supervisor_agent, BOTH, path=path)
    replayed = replay_run(supervisor_agent, path)

    # Same inputs -> identical top-level node path (the state machine is stable).
    assert original.trajectory.nodes() == replayed.trajectory.nodes()
    diff = diff_trajectories(recorded_trajectory(path), replayed.trajectory)
    assert diff["changed"] is False
    assert diff["added"] == [] and diff["removed"] == [] and diff["reordered"] is False
    # Replay reproduces the merged answer too, not just the path.
    assert original.summary == replayed.summary
    assert replayed.ok()


def test_replay_diff_flags_a_rerouted_pipeline(tmp_path, supervisor_agent):
    # Record a both-path run, then replay a DIFFERENT route and diff: the diff
    # must flag the changed node set (a reroute is exactly what replay guards).
    both_path = tmp_path / "both.json"
    record_run(supervisor_agent, BOTH, path=both_path)
    market_only = supervisor_agent.run(MARKET_ONLY)
    diff = diff_trajectories(recorded_trajectory(both_path), market_only.trajectory)
    assert diff["changed"] is True
    assert "filings" in diff["removed"]  # the both-run visited filings; market-only didn't


# ===========================================================================
# BUDGET / COST — the pipeline makes exactly the LLM calls we expect.
# ===========================================================================
def test_pipeline_stays_within_llm_budget(supervisor_agent):
    r = supervisor_agent.run(BOTH)
    calls = _pipeline_llm_calls(r)
    # Market synthesizes once, filings generates once, supervisor merges with no
    # LLM call of its own: exactly 2 LLM calls for a both-path run. The bound is
    # a hard ceiling — a runaway re-invocation would exceed it.
    assert calls == 2, f"expected 2 LLM calls in the both-pipeline, got {calls}"


def test_fanout_costs_more_than_single_route(supervisor_agent):
    # Quality/cost trade-off (roadmap "does multi-agent outperform single?"):
    # the both-path pipeline spends strictly more LLM calls than either single
    # route, because it runs both specialists — the cost of the extra coverage.
    both = _pipeline_llm_calls(supervisor_agent.run(BOTH))
    market = _pipeline_llm_calls(supervisor_agent.run(MARKET_ONLY))
    filings = _pipeline_llm_calls(supervisor_agent.run(FILINGS_ONLY))
    assert both > market and both > filings
    assert both == market + filings  # fan-out cost is exactly the sum of its legs


def test_pipeline_terminates_within_step_bound(supervisor_agent):
    # The "max execution time" guarantee, expressed hermetically as a step
    # ceiling: top-level AND nested trajectories are all bounded (no runaway).
    r = supervisor_agent.run(BOTH)
    assert_steps_bounded(r.trajectory, MAX_STEPS)
    assert_steps_bounded(r.market.trajectory, MAX_STEPS)
    assert_steps_bounded(r.filings.trajectory, MAX_STEPS)


# ===========================================================================
# TIMEOUT / DEGRADATION — a hanging-then-failing specialist doesn't stall the
# pipeline; the survivor still merges (bounded, not blocked).
# ===========================================================================
def test_pipeline_degrades_and_stays_bounded_when_a_branch_fails():
    # A specialist that fails (the hermetic stand-in for one that hung past its
    # deadline) must not stall the run: the survivor's answer still merges and
    # the whole pipeline stays within the step bound.
    market = FakeAgent(boom=TimeoutError("market specialist exceeded deadline"))
    filings = FakeAgent(result=_filings_result("Revenue grew on data-center demand."))
    sup = SupervisorAgent(market_agent=market, filings_agent=filings)
    r = sup.run(BOTH)

    assert r.ok()  # degraded, not dead — survivor carried it
    assert "market_failed" in r.error
    assert "Revenue grew on data-center demand." in r.summary
    assert_steps_bounded(r.trajectory, MAX_STEPS)


def test_pipeline_readiness_survives_json_round_trip(supervisor_agent):
    # The whole orchestration record (nested trajectories included) serializes
    # and reloads intact — ready to hand to an MCP client or a further layer.
    r = supervisor_agent.run(BOTH)
    reloaded = SupervisorResult.model_validate(json.loads(r.model_dump_json()))
    assert reloaded.route == "both" and reloaded.ok()
    assert reloaded.market.trajectory.nodes() == r.market.trajectory.nodes()
    assert reloaded.filings.trajectory.nodes() == r.filings.trajectory.nodes()


@pytest.mark.live
def test_live_pipeline_golden_path():
    from app.agents import FilingsAgent, MarketAgent
    from app.config import settings
    from app.llm.client import LLMClient
    from mcp_servers.filings.service import from_env as filings_from_env
    from mcp_servers.stocks.service import from_env as stocks_from_env

    if settings.STUB_MODE or settings.LLM_PROVIDER == "stub":
        pytest.skip("live golden path needs a real LLM provider")
    client = LLMClient()
    ma = MarketAgent(service=stocks_from_env("fixture"), client=client)
    fa = FilingsAgent(retriever=filings_from_env("fixture")._retriever, client=client)
    r = SupervisorAgent(market_agent=ma, filings_agent=fa).run(BOTH)
    assert r.ok() and r.route == "both"
