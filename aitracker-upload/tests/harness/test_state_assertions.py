"""Tests for assert_state_at_node — intermediate-state validation via stream().

Uses the hand-built `simple_graph` (double -> tag) for exact, hand-set deltas,
and the real market agent for a production node's delta. Also covers the two
failure modes: a missing key and a node that never fires.
"""
from __future__ import annotations

import pytest

from app.harness import assert_state_at_node


# --- happy path on the mini graph ------------------------------------------
def test_state_at_node_captures_delta(simple_graph):
    # `double` sets doubled = x*2; with x=21 the delta must carry doubled=42.
    captured = assert_state_at_node(
        simple_graph, "double", {"x": 21}, contains={"doubled": 42}
    )
    assert captured["doubled"] == 42


def test_state_at_node_second_node(simple_graph):
    assert_state_at_node(
        simple_graph, "tag", {"x": 7}, contains={"label": "x=7"}
    )


# --- failure modes ----------------------------------------------------------
def test_state_at_node_missing_key_raises(simple_graph):
    with pytest.raises(AssertionError, match="missing key"):
        assert_state_at_node(
            simple_graph, "double", {"x": 1}, contains={"nope": 1}
        )


def test_state_at_node_wrong_value_raises(simple_graph):
    with pytest.raises(AssertionError, match="!= expected"):
        assert_state_at_node(
            simple_graph, "double", {"x": 1}, contains={"doubled": 999}
        )


def test_state_at_node_never_fired_raises(simple_graph):
    with pytest.raises(AssertionError, match="never emitted"):
        assert_state_at_node(
            simple_graph, "ghost_node", {"x": 1}, contains={}
        )


# --- against a real agent's graph ------------------------------------------
def test_state_at_gather_quotes_on_market_graph(market_agent):
    # gather_quotes emits stock_data; assert the node fires and carries the key.
    captured = assert_state_at_node(
        market_agent.graph,
        "gather_quotes",
        {"symbols": ["NVDA"], "steps": []},
        contains={},
    )
    assert "stock_data" in captured
