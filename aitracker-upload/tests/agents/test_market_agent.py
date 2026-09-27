"""MarketAgent tests — mapped to the roadmap's 5 agent-testing strategies.

  1. schema          — the result validates as MarketSynthesis
  2. behavioral      — a tool step (get_quotes) precedes any llm step
  3. tool-call valid — stock_data symbols + change_pct match the snapshot
  4. state-machine   — the node path is exactly the expected sequence
  5. adversarial     — total-outage service degrades (no crash, error set)

Plus a termination bound and a `@pytest.mark.live` smoke against a real model.
All non-live tests are hermetic (stub LLM + fixture provider).
"""
from __future__ import annotations

import pytest

from app.agents import MarketAgent
from app.config import settings
from app.llm.client import LLMClient
from app.synthesis.pipeline import MarketSynthesis
from mcp_servers.stocks.service import StockService
from tests.agents.conftest import MAX_STEPS


# --- 1. schema -------------------------------------------------------------
def test_result_is_market_synthesis(market_agent):
    result = market_agent.run()
    assert result.ok()
    assert isinstance(result.synthesis, MarketSynthesis)
    assert result.synthesis.insights  # non-empty
    assert result.error == ""


# --- 2. behavioral: search (quotes) before synthesis ----------------------
def test_quotes_tool_precedes_llm(market_agent):
    result = market_agent.run()
    kinds = [s.kind for s in result.trajectory.steps]
    first_tool = next(i for i, k in enumerate(kinds) if k == "tool")
    first_llm = next(i for i, k in enumerate(kinds) if k == "llm")
    assert first_tool < first_llm
    assert "stocks.get_quotes" in result.trajectory.tools()


# --- 3. tool-call validation: model input matches provider data -----------
def test_stock_data_matches_snapshot(market_agent, stock_service):
    result = market_agent.run()
    batch = stock_service.get_snapshot()
    by_symbol = {q.symbol: q for q in batch.quotes}
    # The synthesis insights must reference only real snapshot symbols with
    # the real change_pct — the agent cannot invent tickers or moves.
    for ins in result.synthesis.insights:
        assert ins.ticker in by_symbol
        assert ins.move_pct == pytest.approx(by_symbol[ins.ticker].change_pct)


# --- 4. state-machine: exact node path --------------------------------------
def test_happy_path_node_sequence(market_agent):
    result = market_agent.run()
    assert result.trajectory.nodes() == [
        "gather_quotes",
        "build_data",
        "synthesize",
        "finalize",
    ]


# --- 5. adversarial / graceful degradation ---------------------------------
def test_total_outage_degrades_without_crash(stub_client):
    # A watchlist of symbols the fixture provider has no data for: every
    # get_quote raises NO_DATA, so get_quotes raises QuoteError. The agent
    # must catch it, skip synthesis, and finalize with an error set.
    service = StockService.from_env("fixture", watchlist=["ZZZZ", "QQQQ"])
    agent = MarketAgent(service=service, client=stub_client)
    result = agent.run()
    assert not result.ok()
    assert result.synthesis is None
    assert result.error  # a QuoteError code was recorded
    # Router skipped synthesis entirely: no LLM node was visited.
    assert result.trajectory.nodes() == ["gather_quotes", "build_data", "finalize"]
    assert "synthesize" not in result.trajectory.nodes()


def test_degraded_run_records_failed_tool_step(stub_client):
    service = StockService.from_env("fixture", watchlist=["ZZZZ"])
    result = MarketAgent(service=service, client=stub_client).run()
    tool_steps = [s for s in result.trajectory.steps if s.kind == "tool"]
    assert tool_steps and any(not s.ok for s in tool_steps)


# --- grounding -------------------------------------------------------------
def test_summary_is_grounded_in_data(market_agent, stock_service):
    """The summary must not name tickers absent from the snapshot."""
    result = market_agent.run()
    symbols = {q.symbol for q in stock_service.get_snapshot().quotes}
    # Any 3-5 uppercase token that looks like a ticker must be a real one.
    import re

    for tok in re.findall(r"\b[A-Z]{3,5}\b", result.synthesis.summary):
        # allow non-ticker acronyms only if they aren't ticker-shaped noise;
        # here every all-caps token in the stub summary is a real symbol.
        assert tok in symbols or tok in {"GPU", "AI", "CEO", "USD"}


# --- termination -----------------------------------------------------------
def test_run_terminates_within_bound(market_agent):
    result = market_agent.run()
    assert len(result.trajectory.steps) <= MAX_STEPS


# --- live smoke ------------------------------------------------------------
@pytest.mark.live
def test_market_agent_live_smoke():
    if settings.STUB_MODE or settings.LLM_PROVIDER == "stub":
        pytest.skip("live smoke needs a real LLM provider")
    agent = MarketAgent(service=StockService.from_env("fixture"), client=LLMClient())
    result = agent.run()
    assert result.ok()
    assert result.synthesis.insights
