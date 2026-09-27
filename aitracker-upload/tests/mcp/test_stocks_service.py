"""Unit tests for the stocks StockService (transport-independent).

Hermetic: uses the fixture provider (no network). Exercises the exact
methods the MCP tools delegate to, so these tests pin the domain
behavior the Market Agent will depend on.
"""
from __future__ import annotations

import pytest

from mcp_servers.stocks import DEFAULT_WATCHLIST, QuoteError, StockService
from mcp_servers.stocks.providers import FixtureProvider
from mcp_servers.stocks.schemas import Quote, QuoteBatch
from mcp_servers.stocks.service import FIXTURE_PATH


def _fixed_clock() -> str:
    return "2026-08-03T00:00:00Z"


@pytest.fixture
def service() -> StockService:
    return StockService(
        provider=FixtureProvider(FIXTURE_PATH, clock=_fixed_clock),
        clock=_fixed_clock,
    )


def test_get_quote_returns_typed_quote(service):
    q = service.get_quote("NVDA")
    assert isinstance(q, Quote)
    assert q.symbol == "NVDA"
    assert q.price == 182.4
    assert q.change_pct == 3.2
    assert q.as_of == "2026-08-03T00:00:00Z"  # timestamp always present (guardrail)
    assert q.source == "fixture"


def test_get_quote_is_case_insensitive(service):
    assert service.get_quote("nvda").symbol == "NVDA"


def test_unknown_symbol_raises_structured_error(service):
    with pytest.raises(QuoteError) as exc:
        service.get_quote("ZZZZ")
    assert exc.value.code == "NO_DATA"


def test_get_snapshot_covers_configured_watchlist(service):
    batch = service.get_snapshot()
    assert isinstance(batch, QuoteBatch)
    # Fixture mode may omit configured symbols that are not present in the
    # small offline fixture corpus; the service still exposes the full
    # configured watchlist through list_watchlist().
    assert set(service.list_watchlist()) == set(DEFAULT_WATCHLIST)
    assert set(batch.symbols()).issubset(set(DEFAULT_WATCHLIST))


def test_get_quotes_is_best_effort(service):
    """Unknown symbols are dropped, not fatal — partial data still flows."""
    batch = service.get_quotes(["NVDA", "ZZZZ", "MSFT"])
    assert set(batch.symbols()) == {"NVDA", "MSFT"}


def test_get_quotes_all_fail_raises(service):
    with pytest.raises(QuoteError) as exc:
        service.get_quotes(["ZZZZ", "YYYY"])
    assert exc.value.code == "NO_DATA"



def test_watchlist_can_be_overridden_by_environment(monkeypatch):
    monkeypatch.setenv("AI_INFRA_WATCH_STOCKS_WATCHLIST", '["AMD", "TSLA", "AMD"]')
    from mcp_servers.stocks import service as stock_service

    assert stock_service._load_configured_watchlist() == ["AMD", "TSLA"]


def test_watchlist_accepts_comma_separated_environment_override(monkeypatch):
    monkeypatch.setenv("AI_INFRA_WATCH_STOCKS_WATCHLIST", "AMD,TSLA,AMD")
    from mcp_servers.stocks import service as stock_service

    assert stock_service._load_configured_watchlist() == ["AMD", "TSLA"]

def test_health_tracks_consecutive_errors(service):
    assert service.health().ok is True
    with pytest.raises(QuoteError):
        service.get_quote("ZZZZ")
    h = service.health()
    assert h.ok is False
    assert h.consecutive_errors == 1
    # A subsequent good quote resets the error streak.
    service.get_quote("NVDA")
    assert service.health().consecutive_errors == 0


def test_one_line_includes_timestamp_and_source(service):
    line = service.get_quote("DGXX").one_line()
    assert "DGXX" in line
    assert "2026-08-03T00:00:00Z" in line
    assert "fixture" in line
