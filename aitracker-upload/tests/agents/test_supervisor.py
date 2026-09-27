"""SupervisorAgent tests — mapped to the roadmap's 6 multi-agent strategies.

  1. agent isolation        — routing/merge tested with injected FakeAgents
  2. communication protocol — specialist results interpreted correctly; a
                              failed/None specialist degrades the merge
  3. orchestration logic    — classify_question routing table + all dispatch
                              paths reachable end-to-end
  4. emergent behavior      — recursion bound never trips, merge runs exactly
                              once even on fan-out (no double fan-in)
  5. chaos / specialist-down— a raising specialist degrades, survivor still
                              merged (roadmap Strategy 5)
  6. end-to-end orchestration — golden both-path over committed fixtures +
                              termination + supervisor-readiness + live smoke

Parallel fan-out branch order is NOT guaranteed by LangGraph, so the tests
assert classify-first / merge-last + set membership, never a strict order of
the two fan-out nodes.
"""
from __future__ import annotations

import json

import pytest

from app.agents import (
    FilingsAgent,
    MarketAgent,
    SupervisorAgent,
    SupervisorResult,
    build_supervisor_graph,
    classify_question,
    default_combine,
)
from app.agents.schemas import FilingsAgentResult, MarketAgentResult
from app.config import settings
from app.llm.client import LLMClient
from tests.agents.conftest import FakeAgent, MAX_STEPS

MARKET_ONLY = "How did the watchlist move today?"
FILINGS_ONLY = "How much did NVIDIA data center revenue grow?"
BOTH = "How did NVIDIA stock move and how much did its data center revenue grow?"


# --- helper: build a canned, well-formed specialist result -------------------
def _market_result(summary: str = "NVDA gained.", symbols=("NVDA",)) -> MarketAgentResult:
    from app.synthesis.pipeline import MarketSynthesis, TickerInsight

    return MarketAgentResult(
        synthesis=MarketSynthesis(
            date="2026-08-03",
            summary=summary,
            insights=[TickerInsight(ticker=s, move_pct=1.0, reason="test") for s in symbols],
            risks=[],
        ),
        symbols=list(symbols),
    )


def _filings_result(answer: str = "Revenue grew 122%.") -> FilingsAgentResult:
    from mcp_servers.filings.schemas import AnswerResult, Citation

    return FilingsAgentResult(
        question=FILINGS_ONLY,
        routed="generate",
        answer=AnswerResult(
            answer=answer,
            citations=[
                Citation(
                    document_id="nvda_10k_fy2025",
                    chunk_index=0,
                    text="Data center revenue grew.",
                    score=0.5,
                )
            ],
        ),
    )


def _failed_result(kind: str) -> FilingsAgentResult | MarketAgentResult:
    if kind == "market":
        return MarketAgentResult(error="market_down")
    return FilingsAgentResult(question=FILINGS_ONLY, routed="no_answer", error="")


# --- 1. agent isolation ------------------------------------------------------
def test_isolation_routes_to_market_only():
    fake_m = FakeAgent(result=_market_result())
    fake_f = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(MARKET_ONLY)
    assert r.route == "market"
    assert len(fake_m.calls) == 1 and len(fake_f.calls) == 0
    assert "Market: NVDA gained." in r.summary and "Filings:" not in r.summary


def test_isolation_routes_to_filings_only():
    fake_m = FakeAgent(result=_market_result())
    fake_f = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(FILINGS_ONLY)
    assert r.route == "filings"
    assert len(fake_f.calls) == 1 and len(fake_m.calls) == 0
    assert "Filings: Revenue grew 122%." in r.summary and "Market:" not in r.summary


def test_isolation_fans_out_to_both_in_parallel():
    fake_m = FakeAgent(result=_market_result())
    fake_f = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(BOTH)
    assert r.route == "both"
    # both specialists called exactly once
    assert len(fake_m.calls) == 1 and len(fake_f.calls) == 1
    # the filings branch receives the question; the market branch takes none
    assert fake_f.calls[0][0] == (BOTH,)
    assert fake_m.calls[0][0] == ()
    # merge composes both blocks
    assert "Market: NVDA gained." in r.summary
    assert "Filings: Revenue grew 122%." in r.summary


# --- 2. communication protocol ----------------------------------------------
def test_protocol_degrades_when_one_specialist_fails():
    fake_m = FakeAgent(result=_failed_result("market"))  # ok()==False
    fake_f = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(BOTH)
    # the surviving specialist's answer still flows through merge
    assert "Filings: Revenue grew 122%." in r.summary
    assert "Market:" not in r.summary
    assert r.ok()  # at least one specialist succeeded


def test_protocol_handles_none_result():
    fake_m = FakeAgent(result=None)  # returns nothing usable
    fake_f = FakeAgent(result=None)
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(BOTH)
    assert r.summary == "No specialist produced a usable answer."
    assert not r.ok()


# --- 2b. degraded(): ok() overall, but not a fully-clean run -----------------
# `ok()` is a partial-success contract (a survivor's answer is real). `degraded()`
# is the additive signal that tells a clean answer from a usable-but-partial one,
# so a caller/UI can flag the difference without overloading `ok()`.
def test_degraded_true_when_a_returned_branch_is_unsuccessful():
    # market RETURNS a result whose own ok() is False (no crash) -> it is stored
    # on r.market, so degraded() must see the failed branch even though r.error
    # is empty (this is the live stub-mode filings case).
    fake_m = FakeAgent(result=_failed_result("market"))  # present, ok()==False
    fake_f = FakeAgent(result=_filings_result())
    r = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f).run(BOTH)
    assert r.market is not None and not r.market.ok()
    assert r.error == ""  # a returned-but-failed branch records no error string
    assert r.ok()         # survivor still delivered a usable answer
    assert r.degraded()   # ...but the run was not fully clean


def test_degraded_true_when_a_branch_crashes():
    # market CRASHES -> r.market is None and r.error carries market_failed.
    fake_m = FakeAgent(boom=RuntimeError("m down"))
    fake_f = FakeAgent(result=_filings_result())
    r = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f).run(BOTH)
    assert r.market is None and "market_failed" in r.error
    assert r.ok()
    assert r.degraded()


def test_not_degraded_on_fully_clean_fan_out():
    fake_m = FakeAgent(result=_market_result())
    fake_f = FakeAgent(result=_filings_result())
    r = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f).run(BOTH)
    assert r.ok() and not r.degraded()


def test_not_degraded_on_clean_single_route():
    # Only one specialist is engaged and it succeeds -> clean, not degraded.
    fake_m = FakeAgent(result=_market_result())
    fake_f = FakeAgent(result=_filings_result())
    r = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f).run(MARKET_ONLY)
    assert r.filings is None
    assert r.ok() and not r.degraded()


def test_total_failure_is_not_degraded():
    # Nothing succeeded -> not ok(); "degraded" is reserved for usable-but-partial,
    # so a total failure is explicitly NOT degraded.
    fake_m = FakeAgent(result=None)
    fake_f = FakeAgent(result=None)
    r = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f).run(BOTH)
    assert not r.ok() and not r.degraded()


# --- 3. orchestration logic --------------------------------------------------
@pytest.mark.parametrize(
    ("question", "expected"),
    [
        (MARKET_ONLY, "market"),
        (FILINGS_ONLY, "filings"),
        (BOTH, "both"),
        ("Tell me something", "market"),  # neutral defaults to market overview
    ],
)
def test_classifier_routing_table(question, expected):
    assert classify_question(question) == expected


def test_all_dispatch_paths_reachable():
    """Every route dispatches to the right node set — the state-machine paths
    are all reachable end-to-end (injected specialists, so this isolates the
    supervisor's routing from the real agents' behavior)."""
    fake_m = FakeAgent(result=_market_result())
    fake_f = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    for q, nodes in [
        (MARKET_ONLY, ["classify", "market", "merge"]),
        (FILINGS_ONLY, ["classify", "filings", "merge"]),
        (BOTH, None),  # membership asserted separately (parallel order)
    ]:
        r = sup.run(q)
        if nodes is not None:
            assert r.trajectory.nodes() == nodes, q
        else:
            n = r.trajectory.nodes()
            assert n[0] == "classify" and n[-1] == "merge"
            assert {"market", "filings"} <= set(n)


def test_unknown_route_degrades_to_market(monkeypatch):
    """A swapped/upgraded classifier that emits a route the edge map doesn't
    wire (here 'analysis') must NOT raise KeyError on the unknown branch — the
    router clamps it to the market overview so the supervisor degrades."""
    import app.agents.supervisor as sup_mod

    # The classify node looks up classify_question at module scope, so patching
    # it makes the classifier emit an out-of-band route the edge map lacks.
    monkeypatch.setattr(sup_mod, "classify_question", lambda q: "analysis")
    graph = sup_mod.build_supervisor_graph(
        FakeAgent(result=_market_result()),
        FakeAgent(result=_filings_result()),
        default_combine,
    )
    final = graph.invoke(
        {"question": "anything", "steps": []},
        {"recursion_limit": 15},
    )
    nodes = [s.node for s in final["steps"] if s.kind == "node"]
    assert "market" in nodes  # clamped to the real market destination
    assert "filings" not in nodes
    assert "summary" in final  # reached END, no crash


# --- 4. emergent behavior ----------------------------------------------------
def test_no_recursion_error(supervisor_agent):
    """Low recursion limit must NOT trip — the graph is a short DAG, so a
    limit that only trips on a real loop is the no-infinite-loop guard."""
    final = supervisor_agent.graph.invoke(
        {"question": BOTH, "steps": []},
        {"recursion_limit": 15},
    )
    assert "summary" in final  # reached END with accumulated state


def test_merge_runs_exactly_once_on_fanout(supervisor_agent):
    """The fan-in point must not double-fire: merge appears exactly once even
    though both parallel branches edge into it."""
    r = supervisor_agent.run(BOTH)
    nodes = r.trajectory.nodes()
    assert nodes[0] == "classify" and nodes[-1] == "merge"
    assert nodes.count("merge") == 1
    # one delegation tool per specialist, no more
    assert [s.tool for s in r.trajectory.steps if s.kind == "tool"].count("agent:market") == 1
    assert [s.tool for s in r.trajectory.steps if s.kind == "tool"].count("agent:filings") == 1


def test_trajectory_well_formed(supervisor_agent):
    """Every delegation (tool/llm) step is preceded by its node visit."""
    seen: set[str] = set()
    for s in supervisor_agent.run(BOTH).trajectory.steps:
        if s.kind == "node":
            seen.add(s.node)
        else:
            assert s.node in seen, f"{s.kind} step for {s.node!r} preceded its node visit"


# --- 5. chaos / specialist-down ----------------------------------------------
def test_chaos_specialist_crash_degrades():
    fake_m = FakeAgent(boom=RuntimeError("specialist down"))
    fake_f = FakeAgent(result=_filings_result())
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(BOTH)
    # branch error recorded, failed delegation step present, supervisor does not crash
    assert "market_failed" in r.error
    failed = [s for s in r.trajectory.steps if not s.ok]
    assert [(s.tool, s.note) for s in failed] == [("agent:market", "RuntimeError")]
    # the survivor still makes it through merge
    assert "Filings: Revenue grew 122%." in r.summary
    assert r.market is None and r.filings is not None
    assert r.ok()


def test_chaos_both_down_returns_no_answer():
    fake_m = FakeAgent(boom=RuntimeError("m down"))
    fake_f = FakeAgent(boom=RuntimeError("f down"))
    sup = SupervisorAgent(market_agent=fake_m, filings_agent=fake_f)
    r = sup.run(BOTH)
    assert "market_failed" in r.error and "filings_failed" in r.error
    assert r.summary == "No specialist produced a usable answer."
    assert not r.ok()


# --- 6. end-to-end orchestration ---------------------------------------------
def test_e2e_both_path_over_fixtures(supervisor_agent):
    r = supervisor_agent.run(BOTH)
    assert r.route == "both"
    assert r.market is not None and r.market.ok()
    assert r.filings is not None and r.filings.ok()
    assert r.ok()
    # merged summary carries both specialist blocks
    assert r.summary.startswith("Market:")
    assert "\n\nFilings:" in r.summary
    nodes = r.trajectory.nodes()
    assert nodes[0] == "classify" and nodes[-1] == "merge"
    assert {"market", "filings"} <= set(nodes)


def test_e2e_termination_within_bound(supervisor_agent):
    assert len(supervisor_agent.run(BOTH).trajectory.steps) <= MAX_STEPS


def test_e2e_supervisor_readiness(supervisor_agent):
    """SupervisorResult is pure pydantic -> JSON round-trips with nested
    specialist trajectories intact (ready for MCP / further orchestration)."""
    r = supervisor_agent.run(BOTH)
    blob = json.loads(r.model_dump_json())
    assert blob["route"] == "both"
    assert blob["market"]["trajectory"]["steps"]  # nested specialist trajectory
    assert blob["filings"]["trajectory"]["steps"]
    assert blob["trajectory"]["steps"]  # top-level orchestration trajectory


@pytest.mark.live
def test_supervisor_live_smoke():
    if settings.STUB_MODE or settings.LLM_PROVIDER == "stub":
        pytest.skip("live smoke needs a real LLM provider")
    from mcp_servers.filings.service import from_env as filings_from_env
    from mcp_servers.stocks.service import from_env as stocks_from_env

    client = LLMClient()
    ma = MarketAgent(service=stocks_from_env("fixture"), client=client)
    fa = FilingsAgent(retriever=filings_from_env("fixture")._retriever, client=client)
    r = SupervisorAgent(market_agent=ma, filings_agent=fa).run(BOTH)
    assert r.ok()
    assert r.route == "both"
