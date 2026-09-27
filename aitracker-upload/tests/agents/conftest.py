"""Shared fixtures for the agent test suite.

Both agents are built offline: a stub `LLMClient` and fixture-backed
`StockService` / `FilingsService` (from_env("fixture")). Every committed
stub fixture in tests/fixtures/llm/ is keyed by the exact prompt hash the
agents compute, so the suite runs hermetic and deterministic.

`MAX_STEPS` is the termination bound asserted across both agents: a healthy
market run visits 4 nodes, a filings run 3, and even the degrade/no-answer
paths stay well under it — so the bound only trips on a real loop.
"""
from __future__ import annotations

import pytest

from app.agents import FilingsAgent, MarketAgent, SupervisorAgent
from app.llm.client import LLMClient
from mcp_servers.filings.service import from_env as filings_from_env
from mcp_servers.stocks.candles import CandleService, FixtureCandleProvider
from mcp_servers.stocks.service import from_env as stocks_from_env

MAX_STEPS = 12


@pytest.fixture
def stub_client() -> LLMClient:
    return LLMClient(provider="stub", model="stub")


@pytest.fixture
def stock_service():
    return stocks_from_env("fixture")


@pytest.fixture
def filings_service():
    return filings_from_env("fixture")


@pytest.fixture
def market_agent(stub_client, stock_service) -> MarketAgent:
    return MarketAgent(service=stock_service, client=stub_client)


@pytest.fixture
def filings_agent(stub_client, filings_service) -> FilingsAgent:
    # Reuse the exact retriever FilingsService builds so the RAG prompt
    # hashes (and the committed fixtures) line up.
    return FilingsAgent(retriever=filings_service._retriever, client=stub_client)


@pytest.fixture
def supervisor_agent(market_agent, filings_agent) -> SupervisorAgent:
    """Supervisor over the REAL specialists (stub client + fixture services).

    Injecting the already-built market/filings agents keeps the whole graph
    hermetic and deterministic — the supervisor adds no LLM call of its own.
    """
    return SupervisorAgent(market_agent=market_agent, filings_agent=filings_agent)


class FakeAgent:
    """A canned specialist for isolation/chaos tests.

    Records how many times (and with what args) it was called, and returns a
    pre-set result — or raises `boom` to simulate a specialist going down
    mid-orchestration. Lets the supervisor's routing/merge be tested in
    isolation from the real agents' behavior.
    """

    def __init__(self, result=None, boom: Exception | None = None) -> None:
        self.result = result
        self.boom = boom
        self.calls: list[tuple] = []

    def run(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        if self.boom is not None:
            raise self.boom
        return self.result


# ----------------------------------------------------------------------
# Rotation-detector helpers (Phase 3.6)
# ----------------------------------------------------------------------
def synthetic_universe():
    """A tiny 4-name universe with two rotation legs, no ai_infra noise.

    Two hardware + two application names is enough to exercise aggregation,
    divergence, and per-bucket degradation while staying trivially auditable.
    """
    from app.universe import Universe, UniverseStock

    def _s(sym, bucket):
        return UniverseStock(
            symbol=sym, name=sym, exchange="NASDAQ", bucket=bucket,
            source="test", in_watchlist=True, in_corpus=False,
        )

    return Universe(
        [
            _s("NVDA", "ai_hardware"),
            _s("AVGO", "ai_hardware"),
            _s("MSFT", "ai_application"),
            _s("META", "ai_application"),
        ],
        schema_version=1,
    )


def candle_service_from(series_map: dict[str, list[float]]) -> CandleService:
    """A hermetic CandleService over in-memory synthetic closes (labeled series)."""
    return CandleService(provider=FixtureCandleProvider(series_map=series_map))


# A step at the LAST bar over an otherwise-flat 21-bar history makes the 1d,
# 5d, AND 20d window returns all equal the step's percent move — labeled
# ground truth for the detector (hardware -3% vs application +2%).
def step_series(pct: float, flat: float = 100.0, length: int = 21) -> list[float]:
    end = round(flat * (1.0 + pct / 100.0), 6)
    return [flat] * (length - 1) + [end]
