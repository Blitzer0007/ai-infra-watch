"""Unit tests for the price-history (candle) store — Phase 3.6 DEPENDENCY 2.

Hermetic: the fixture provider (in-memory closes + committed JSON), no network.
Pins the window-return math the Rotation Detector depends on and the
best-effort batch behavior that mirrors StockService.
"""
from __future__ import annotations

import pytest

from mcp_servers.stocks import (
    CandleSeries,
    CandleService,
    FixtureCandleProvider,
    QuoteError,
    series_from_closes,
)
from mcp_servers.stocks.candles import CANDLES_FIXTURE_PATH


# ----------------------------------------------------------------------
# CandleSeries.window_return — the only domain math
# ----------------------------------------------------------------------
def test_window_return_basic():
    s = series_from_closes("NVDA", [100.0, 110.0])  # +10% one session
    assert s.window_return(1) == pytest.approx(10.0)


def test_window_return_reaches_back_window_sessions():
    # A single step at the last bar over a flat history => every window that
    # spans the step reads the same percent move.
    s = series_from_closes("NVDA", [100.0] * 20 + [97.0])
    assert s.window_return(1) == pytest.approx(-3.0)
    assert s.window_return(5) == pytest.approx(-3.0)
    assert s.window_return(20) == pytest.approx(-3.0)


def test_window_return_insufficient_history_is_none():
    s = series_from_closes("NVDA", [100.0, 101.0, 102.0])
    assert s.window_return(5) is None  # needs 6 candles, has 3
    assert s.window_return(1) is not None


def test_window_return_zero_start_is_none_no_div_by_zero():
    s = series_from_closes("NVDA", [0.0, 50.0])
    assert s.window_return(1) is None


def test_window_return_rejects_nonpositive_window():
    s = series_from_closes("NVDA", [100.0, 101.0])
    assert s.window_return(0) is None


# ----------------------------------------------------------------------
# FixtureCandleProvider
# ----------------------------------------------------------------------
def test_fixture_provider_in_memory_series():
    p = FixtureCandleProvider(series_map={"nvda": [1.0, 2.0, 3.0]})
    s = p.get_series("NVDA")
    assert isinstance(s, CandleSeries)
    assert s.symbol == "NVDA"
    assert s.closes() == [1.0, 2.0, 3.0]
    assert s.source == "fixture"


def test_fixture_provider_lookback_truncates():
    p = FixtureCandleProvider(series_map={"NVDA": list(range(100))})
    s = p.get_series("NVDA", lookback=5)
    # keeps lookback + 1 closes so a `lookback`-window return is computable
    assert len(s.candles) == 6
    assert s.closes()[-1] == 99


def test_fixture_provider_unknown_symbol_raises():
    p = FixtureCandleProvider(series_map={"NVDA": [1.0, 2.0]})
    with pytest.raises(QuoteError) as exc:
        p.get_series("ZZZZ")
    assert exc.value.code == "NO_DATA"


def test_committed_fixture_loads():
    p = FixtureCandleProvider(fixture_path=CANDLES_FIXTURE_PATH)
    s = p.get_series("MSFT")
    assert s.symbol == "MSFT"
    assert len(s.candles) >= 21  # enough history for the 20d window
    assert s.window_return(1) is not None


# ----------------------------------------------------------------------
# CandleService — best-effort batch (mirrors StockService.get_quotes)
# ----------------------------------------------------------------------
@pytest.fixture
def service() -> CandleService:
    return CandleService(
        provider=FixtureCandleProvider(
            series_map={"NVDA": [1.0, 2.0, 3.0], "MSFT": [10.0, 11.0, 12.0]}
        )
    )


def test_get_histories_best_effort(service):
    out = service.get_histories(["NVDA", "ZZZZ", "MSFT"])
    assert set(out) == {"NVDA", "MSFT"}  # unknown dropped, not fatal


def test_get_histories_all_fail_raises(service):
    with pytest.raises(QuoteError) as exc:
        service.get_histories(["ZZZZ", "YYYY"])
    assert exc.value.code == "NO_DATA"


def test_get_histories_empty_is_clean_noop(service):
    assert service.get_histories([]) == {}  # no raise, no divide-by-zero


def test_from_env_defaults_to_fixture():
    assert CandleService.from_env("fixture").provider.source == "fixture"
    assert CandleService.from_env("nonsense").provider.source == "fixture"
    assert CandleService.from_env("live").provider.source == "stooq"


# ----------------------------------------------------------------------
# Live smoke (skipped in CI; run with -m live)
# ----------------------------------------------------------------------
@pytest.mark.live
def test_live_stooq_smoke():
    """Fetch a real daily candle series for NVDA from stooq (no key)."""
    svc = CandleService.from_env("live")
    s = svc.get_series("NVDA", lookback=30)
    assert s.symbol == "NVDA"
    assert len(s.candles) > 1
    assert s.window_return(1) is not None
    assert s.source == "stooq"
