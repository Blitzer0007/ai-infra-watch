"""Fixtures for the harness suite — real fixture-backed agents as test subjects.

The harness has no throwaway demo agent: the five production agents already
carry trajectories, so they ARE the subjects. These fixtures build the two
simplest (market, filings) plus a rotation agent over synthetic labeled series,
all hermetic (stub LLM + fixture services). `simple_graph` is a tiny hand-built
StateGraph used to exercise `assert_state_at_node` without leaning on any real
agent's internals.
"""
from __future__ import annotations

import operator
from typing import Annotated, TypedDict

import pytest
from langgraph.graph import END, START, StateGraph

from app.agents import FilingsAgent, MarketAgent, RotationAgent
from app.llm.client import LLMClient
from mcp_servers.filings.service import from_env as filings_from_env
from mcp_servers.stocks.service import from_env as stocks_from_env
from tests.agents.conftest import (
    candle_service_from,
    step_series,
    synthetic_universe,
)

# A question the committed corpus can answer (routes retrieve -> generate).
ANSWERABLE = "How much did NVIDIA data center revenue grow?"
# A question with nothing in the corpus (routes retrieve -> no_answer):
# scores below the relevance floor, same question the filings suite uses.
OUT_OF_CORPUS = "Who won the 2010 FIFA World Cup?"

HARDWARE = ("NVDA", "AVGO")
APPLICATION = ("MSFT", "META")


@pytest.fixture
def stub_client() -> LLMClient:
    return LLMClient(provider="stub", model="stub")


@pytest.fixture
def market_agent(stub_client) -> MarketAgent:
    return MarketAgent(service=stocks_from_env("fixture"), client=stub_client)


@pytest.fixture
def filings_agent(stub_client) -> FilingsAgent:
    service = filings_from_env("fixture")
    return FilingsAgent(retriever=service._retriever, client=stub_client)


@pytest.fixture
def rotation_agent() -> RotationAgent:
    """Synthetic labeled legs: hardware -3% vs application +2% (fires)."""
    series = {s: step_series(-3.0) for s in HARDWARE}
    series.update({s: step_series(+2.0) for s in APPLICATION})
    return RotationAgent(
        service=candle_service_from(series),
        universe=synthetic_universe(),
    )


class _MiniState(TypedDict, total=False):
    x: int
    doubled: int
    label: str
    steps: Annotated[list, operator.add]


@pytest.fixture
def simple_graph():
    """A tiny 2-node graph: `double` sets `doubled`, `tag` sets `label`.

    Lets the state-at-node assertion be tested against known, hand-set deltas
    with no dependence on a real agent's node names or fixtures.
    """

    def double(state: _MiniState) -> dict:
        return {"doubled": (state.get("x") or 0) * 2}

    def tag(state: _MiniState) -> dict:
        return {"label": f"x={state.get('x')}"}

    g = StateGraph(_MiniState)
    g.add_node("double", double)
    g.add_node("tag", tag)
    g.add_edge(START, "double")
    g.add_edge("double", "tag")
    g.add_edge("tag", END)
    return g.compile()
