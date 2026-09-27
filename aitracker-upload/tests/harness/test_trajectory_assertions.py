"""Tests for the trajectory assertion helpers — the harness's core vocabulary.

Each helper is checked both ways: it PASSES on a trajectory that satisfies the
property, and RAISES AssertionError on one that violates it. The subjects are
the real fixture-backed market/filings agents, so the asserted node/tool names
are the production ones (`gather_quotes`, `stocks.get_quotes`, ...).
"""
from __future__ import annotations

import pytest

from app.agents.trajectory import AgentTrajectory, Step
from app.harness import (
    assert_no_failed_steps,
    assert_node_order,
    assert_not_visited,
    assert_steps_bounded,
    assert_tool_called,
    assert_visited,
    assert_visited_nodes,
    assert_well_formed,
)
from tests.harness.conftest import ANSWERABLE


# --- well-formed ------------------------------------------------------------
def test_well_formed_passes_on_real_run(market_agent):
    assert_well_formed(market_agent.run().trajectory)


def test_well_formed_raises_on_orphan_tool_step():
    # A tool step whose node was never visited by a preceding node step.
    bad = AgentTrajectory(steps=[Step(node="ghost", kind="tool", tool="t")])
    with pytest.raises(AssertionError, match="not been visited"):
        assert_well_formed(bad)


# --- exact node path --------------------------------------------------------
def test_visited_nodes_exact_market_happy_path(market_agent):
    assert_visited_nodes(
        market_agent.run().trajectory,
        ["gather_quotes", "build_data", "synthesize", "finalize"],
    )


def test_visited_nodes_raises_on_mismatch(market_agent):
    with pytest.raises(AssertionError, match="!= expected"):
        assert_visited_nodes(market_agent.run().trajectory, ["gather_quotes"])


# --- membership -------------------------------------------------------------
def test_visited_and_not_visited(filings_agent):
    traj = filings_agent.run(ANSWERABLE).trajectory
    assert_visited(traj, "generate")
    assert_not_visited(traj, "no_answer")


def test_not_visited_raises_when_present(market_agent):
    with pytest.raises(AssertionError, match="should not be"):
        assert_not_visited(market_agent.run().trajectory, "synthesize")


# --- relative ordering ------------------------------------------------------
def test_node_order_market(market_agent):
    assert_node_order(market_agent.run().trajectory, "build_data", "synthesize")


def test_node_order_raises_when_reversed(market_agent):
    with pytest.raises(AssertionError, match="expected"):
        assert_node_order(market_agent.run().trajectory, "synthesize", "gather_quotes")


# --- tool called (search-before-answer invariant) --------------------------
def test_tool_called_before_llm_node(market_agent):
    # The quotes tool must run before the synthesize (llm) node is reached.
    assert_tool_called(
        market_agent.run().trajectory, "stocks.get_quotes", before="synthesize"
    )


def test_tool_called_after_node(market_agent):
    assert_tool_called(
        market_agent.run().trajectory, "stocks.get_quotes", after="gather_quotes"
    )


def test_tool_called_raises_when_absent(market_agent):
    with pytest.raises(AssertionError, match="never called"):
        assert_tool_called(market_agent.run().trajectory, "nonexistent.tool")


def test_tool_called_before_raises_when_order_wrong(market_agent):
    # The tool runs AFTER gather_quotes, so asserting it ran before must fail.
    with pytest.raises(AssertionError, match="before node"):
        assert_tool_called(
            market_agent.run().trajectory, "stocks.get_quotes", before="gather_quotes"
        )


# --- bounded steps (anti-infinite-loop) ------------------------------------
def test_steps_bounded_passes(market_agent):
    assert_steps_bounded(market_agent.run().trajectory, 12)


def test_steps_bounded_raises(market_agent):
    with pytest.raises(AssertionError, match="exceeds bound"):
        assert_steps_bounded(market_agent.run().trajectory, 1)


# --- failed steps -----------------------------------------------------------
def test_no_failed_steps_on_happy_path(market_agent):
    assert_no_failed_steps(market_agent.run().trajectory)


def test_no_failed_steps_raises_on_failure():
    bad = AgentTrajectory(
        steps=[
            Step(node="n", kind="node"),
            Step(node="n", kind="tool", tool="t", ok=False),
        ]
    )
    with pytest.raises(AssertionError, match="failed steps"):
        assert_no_failed_steps(bad)
