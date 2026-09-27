"""Tests for NodeCoverage — the state-machine coverage metric.

The market graph has 4 nodes but the happy path visits all 4, so to show
`uncovered` shrinking we use the FILINGS graph: its answerable path visits
{retrieve, generate, finalize} leaving `no_answer` uncovered, and the
out-of-corpus path visits {retrieve, no_answer, finalize} leaving `generate`
uncovered. Recording both drives coverage to 100%.
"""
from __future__ import annotations

from app.harness import NodeCoverage, graph_node_names
from tests.harness.conftest import ANSWERABLE, OUT_OF_CORPUS

FILINGS_NODES = {"retrieve", "generate", "no_answer", "finalize"}


def test_graph_node_names_excludes_sentinels(market_agent):
    names = graph_node_names(market_agent.graph)
    assert names == {"gather_quotes", "build_data", "synthesize", "finalize"}
    assert not any(n.startswith("__") for n in names)


def test_single_run_partial_coverage(filings_agent):
    cov = NodeCoverage()
    cov.record(filings_agent.run(ANSWERABLE).trajectory)
    # answerable path never hits no_answer
    assert cov.uncovered(filings_agent.graph) == {"no_answer"}
    assert cov.runs == 1


def test_two_paths_reach_full_coverage(filings_agent):
    cov = NodeCoverage()
    cov.record(filings_agent.run(ANSWERABLE).trajectory)      # generate path
    cov.record(filings_agent.run(OUT_OF_CORPUS).trajectory)   # no_answer path
    assert cov.uncovered(filings_agent.graph) == set()
    report = cov.report(filings_agent.graph)
    assert report["pct"] == 100.0
    assert set(report["covered"]) == FILINGS_NODES
    assert report["uncovered"] == []
    assert report["runs"] == 2


def test_report_percentage_is_fraction_of_nodes(filings_agent):
    cov = NodeCoverage()
    cov.record(filings_agent.run(ANSWERABLE).trajectory)  # 3 of 4 nodes
    report = cov.report(filings_agent.graph)
    assert report["pct"] == 75.0
    assert "no_answer" in report["uncovered"]


def test_covered_accumulates_across_runs(market_agent):
    cov = NodeCoverage()
    cov.record(market_agent.run().trajectory)
    cov.record(market_agent.run().trajectory)
    # same path twice -> covered set is stable, run count climbs
    assert cov.covered() == graph_node_names(market_agent.graph)
    assert cov.runs == 2
