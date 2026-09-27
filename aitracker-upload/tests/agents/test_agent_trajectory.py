"""Cross-cutting trajectory tests — the observability substrate itself.

These assert properties that hold for BOTH agents' trajectories, plus the
graph-level guarantees the plan calls out:

  * node-visit ordering invariant — every tool/llm step is preceded by its
    own node-visit step (so a trajectory is always well-formed)
  * reducer correctness — steps accumulate across nodes (operator.add)
  * trace side-effect — a run with TRACE_ENABLED writes an `agent:` line
  * no-infinite-loop — invoke() terminates at END, no GraphRecursionError
  * supervisor-readiness — both agents expose .run() -> model with .trajectory
"""
from __future__ import annotations

import json

import pytest

from app.agents import FilingsAgent, MarketAgent
from app.harness import assert_well_formed as _assert_well_formed
from langgraph.errors import GraphRecursionError

ANSWERABLE = "How much did NVIDIA data center revenue grow?"


# --- node-visit ordering invariant -----------------------------------------
# The well-formed check now lives in the reusable harness (app.harness); this
# suite imports it so the observability substrate and the harness that asserts
# on it stay in lockstep.
def test_market_trajectory_well_formed(market_agent):
    _assert_well_formed(market_agent.run().trajectory)


def test_filings_trajectory_well_formed(filings_agent):
    result = filings_agent.run(ANSWERABLE)
    _assert_well_formed(result.trajectory)


# --- reducer correctness: steps accumulate ---------------------------------
def test_steps_accumulate_across_nodes(market_agent):
    steps = market_agent.run().trajectory.steps
    # 4 node visits + at least the get_quotes tool + the synthesize llm step
    node_steps = [s for s in steps if s.kind == "node"]
    assert len(node_steps) == 4
    assert len(steps) > len(node_steps)  # tool/llm steps were concatenated


# --- intermediate-state ordering (per agent) -------------------------------
def test_market_data_gathered_before_synthesis(market_agent):
    nodes = market_agent.run().trajectory.nodes()
    assert nodes.index("build_data") < nodes.index("synthesize")


def test_filings_retrieve_before_generate(filings_agent):
    nodes = filings_agent.run(ANSWERABLE).trajectory.nodes()
    assert nodes.index("retrieve") < nodes.index("generate")


# --- trace side-effect ------------------------------------------------------
def test_run_emits_agent_trace(tmp_path, monkeypatch, stub_client, stock_service):
    """With tracing on, a run writes an `agent:` JSONL line to TRACES_DIR."""
    from app.config import settings

    monkeypatch.setattr(settings, "TRACES_DIR", tmp_path, raising=False)
    monkeypatch.setattr(settings, "TRACE_ENABLED", True, raising=False)
    MarketAgent(service=stock_service, client=stub_client).run()

    lines = []
    for f in tmp_path.glob("*.jsonl"):
        lines += [json.loads(x) for x in f.read_text(encoding="utf-8").splitlines() if x.strip()]
    kinds = [rec.get("call_kind", "") for rec in lines]
    assert any(k.startswith("agent:") for k in kinds), kinds


# --- no-infinite-loop -------------------------------------------------------
def test_market_graph_terminates(stock_service, stub_client):
    graph = MarketAgent(service=stock_service, client=stub_client).graph
    # A low recursion limit must NOT trip: the graph is a short DAG to END.
    final = graph.invoke({"symbols": [], "steps": []}, {"recursion_limit": 15})
    assert "steps" in final  # reached END with accumulated state


def test_filings_graph_terminates(filings_service, stub_client):
    agent = FilingsAgent(retriever=filings_service._retriever, client=stub_client)
    try:
        final = agent.graph.invoke(
            {"question": ANSWERABLE, "steps": []},
            {"recursion_limit": 15},
        )
    except GraphRecursionError as exc:  # pragma: no cover
        pytest.fail(f"filings graph did not terminate: {exc}")
    assert "steps" in final


# --- supervisor-readiness ---------------------------------------------------
def test_both_agents_expose_serializable_result(market_agent, filings_agent):
    m = market_agent.run()
    f = filings_agent.run(ANSWERABLE)
    for result in (m, f):
        assert hasattr(result, "trajectory")
        # pure-pydantic -> JSON round-trips (ready for MCP / a supervisor)
        blob = result.model_dump_json()
        assert json.loads(blob)["trajectory"]["steps"]
