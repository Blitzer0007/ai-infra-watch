"""Unit tests for the earnings calendar + history store.

Hermetic: the fixture provider (committed earnings.json) and pure reaction math
on a synthetic labeled candle series — no network. Pins:
  * EarningsEvent.compute_surprise — the EPS-surprise math
  * _reaction_from_series          — day-before -> day-after % around a report
  * FixtureEarningsProvider        — load + surprise backfill + unknown symbol
  * EarningsService                — reaction enrichment + best-effort batch
  * from_env                       — fixture default, live wiring
"""
from __future__ import annotations

import pytest

from mcp_servers.stocks import (
    EarningsEvent,
    EarningsHistory,
    EarningsService,
    FixtureEarningsProvider,
    QuoteError,
)
from mcp_servers.stocks.candles import CandleService, FixtureCandleProvider, series_from_closes
from mcp_servers.stocks.earnings import EARNINGS_FIXTURE_PATH, _reaction_from_series


# ----------------------------------------------------------------------
# EarningsEvent.compute_surprise — EPS surprise math
# ----------------------------------------------------------------------
def test_surprise_positive_beat():
    e = EarningsEvent(symbol="X", date="2026-01-01", eps_actual=0.12, eps_estimate=0.10)
    assert e.compute_surprise() == pytest.approx(20.0)


def test_surprise_uses_abs_estimate_for_negative_eps():
    # A smaller loss than expected is a POSITIVE surprise, even though both are
    # negative: (-0.12 - -0.18)/|−0.18| = +33.3%.
    e = EarningsEvent(symbol="X", date="2026-01-01", eps_actual=-0.12, eps_estimate=-0.18)
    assert e.compute_surprise() == pytest.approx(33.333, rel=1e-3)


def test_surprise_none_when_estimate_missing():
    e = EarningsEvent(symbol="X", date="2026-01-01", eps_actual=0.12, eps_estimate=None)
    assert e.compute_surprise() is None


def test_surprise_none_when_estimate_zero_no_div_by_zero():
    e = EarningsEvent(symbol="X", date="2026-01-01", eps_actual=0.12, eps_estimate=0.0)
    assert e.compute_surprise() is None


# ----------------------------------------------------------------------
# _reaction_from_series — price reaction around a report date
# ----------------------------------------------------------------------
def test_reaction_brackets_report_date():
    # Synthetic dates from series_from_closes are 2026-01-01, -02, -03.
    # A report "on" 2026-01-02.5 falls between close[1]=100 and close[2]=110.
    s = series_from_closes("X", [90.0, 100.0, 110.0])
    assert _reaction_from_series(s, "2026-01-02.5") == pytest.approx(10.0)


def test_reaction_uses_last_before_and_first_after():
    # Report between the 2nd and 3rd sessions: last-before=101, first-after=99.
    s = series_from_closes("X", [100.0, 101.0, 99.0, 105.0])  # -01,-02,-03,-04
    # date between -02 and -03 -> (99-101)/101*100
    assert _reaction_from_series(s, "2026-01-02.5") == pytest.approx(-1.980, rel=1e-3)


def test_reaction_none_when_no_candle_after():
    s = series_from_closes("X", [100.0, 101.0])  # -01, -02
    assert _reaction_from_series(s, "2026-06-01") is None  # nothing after


def test_reaction_none_when_no_candle_before():
    s = series_from_closes("X", [100.0, 101.0])  # -01, -02
    assert _reaction_from_series(s, "2025-01-01") is None  # nothing before


def test_reaction_none_on_zero_anchor_no_div_by_zero():
    s = series_from_closes("X", [0.0, 50.0])  # -01, -02
    assert _reaction_from_series(s, "2026-01-01.5") is None


# ----------------------------------------------------------------------
# FixtureEarningsProvider
# ----------------------------------------------------------------------
def test_committed_fixture_loads_and_splits_past_upcoming():
    p = FixtureEarningsProvider(fixture_path=EARNINGS_FIXTURE_PATH)
    h = p.get_earnings("NBIS")
    assert isinstance(h, EarningsHistory)
    assert h.symbol == "NBIS"
    assert h.past(), "expected past earnings on record"
    assert h.upcoming(), "expected an upcoming report"
    assert h.source == "fixture"


def test_fixture_backfills_surprise_when_absent():
    # earnings.json does not hard-code surprise_pct; the provider computes it.
    p = FixtureEarningsProvider(fixture_path=EARNINGS_FIXTURE_PATH)
    e = p.get_earnings("NBIS").past()[-1]
    assert e.eps_actual is not None and e.eps_estimate is not None
    assert e.surprise_pct == pytest.approx(e.compute_surprise())


def test_fixture_upcoming_has_no_actual():
    p = FixtureEarningsProvider(fixture_path=EARNINGS_FIXTURE_PATH)
    nxt = p.get_earnings("DGXX").next_event()
    assert nxt is not None
    assert nxt.when == "upcoming"
    assert nxt.eps_actual is None


def test_fixture_unknown_symbol_raises():
    p = FixtureEarningsProvider(fixture_path=EARNINGS_FIXTURE_PATH)
    with pytest.raises(QuoteError) as exc:
        p.get_earnings("ZZZZ")
    assert exc.value.code == "NO_DATA"


# ----------------------------------------------------------------------
# EarningsService — reaction enrichment + best-effort batch
# ----------------------------------------------------------------------
def _provider_with(events_by_symbol):
    """A tiny in-memory EarningsProvider for enrichment/batch tests."""

    class _P:
        source = "fixture"

        def get_earnings(self, symbol):
            symbol = symbol.strip().upper()
            rows = events_by_symbol.get(symbol)
            if not rows:
                raise QuoteError("NO_DATA", f"no earnings for {symbol}")
            return EarningsHistory(
                symbol=symbol,
                events=[EarningsEvent(symbol=symbol, **r) for r in rows],
                source="fixture",
            )

    return _P()


def test_service_enriches_reaction_from_candles():
    # A past event with no reaction gets one computed from candle history.
    # Synthetic dates are 2026-01-01/-02/-03; a report on -02.5 brackets
    # close[1]=100 (last-before) and close[2]=120 (first-after) -> +20%.
    provider = _provider_with(
        {"X": [{"date": "2026-01-02.5", "when": "past", "eps_actual": 1.0, "eps_estimate": 0.9}]}
    )
    candles = CandleService(
        provider=FixtureCandleProvider(series_map={"X": [100.0, 100.0, 120.0]})
    )
    svc = EarningsService(provider=provider, candle_service=candles)
    e = svc.get_earnings("X").past()[0]
    # between close[1]=100 and close[2]=120 -> +20%
    assert e.price_reaction_pct == pytest.approx(20.0)


def test_service_does_not_overwrite_provider_reaction():
    provider = _provider_with(
        {"X": [{"date": "2026-01-01.5", "when": "past", "eps_actual": 1.0,
                "eps_estimate": 0.9, "price_reaction_pct": 5.0}]}
    )
    candles = CandleService(
        provider=FixtureCandleProvider(series_map={"X": [100.0, 100.0, 120.0]})
    )
    svc = EarningsService(provider=provider, candle_service=candles)
    e = svc.get_earnings("X").past()[0]
    assert e.price_reaction_pct == pytest.approx(5.0)  # kept, not recomputed


def test_service_reaction_degrades_when_no_candles():
    provider = _provider_with(
        {"X": [{"date": "2026-01-01.5", "when": "past", "eps_actual": 1.0, "eps_estimate": 0.9}]}
    )
    candles = CandleService(provider=FixtureCandleProvider(series_map={"OTHER": [1.0, 2.0]}))
    svc = EarningsService(provider=provider, candle_service=candles)
    e = svc.get_earnings("X").past()[0]
    assert e.price_reaction_pct is None  # no candles for X -> None, not a raise


def test_service_no_candle_service_leaves_reaction_untouched():
    provider = _provider_with(
        {"X": [{"date": "2026-01-01.5", "when": "past", "eps_actual": 1.0,
                "eps_estimate": 0.9, "price_reaction_pct": 7.0}]}
    )
    svc = EarningsService(provider=provider, candle_service=None)
    assert svc.get_earnings("X").past()[0].price_reaction_pct == pytest.approx(7.0)


@pytest.fixture
def batch_service() -> EarningsService:
    return EarningsService(
        provider=_provider_with(
            {
                "NBIS": [{"date": "2026-05-20", "when": "past", "eps_actual": -0.12, "eps_estimate": -0.18}],
                "DGXX": [{"date": "2026-05-14", "when": "past", "eps_actual": 0.05, "eps_estimate": 0.03}],
            }
        ),
        candle_service=None,
    )


def test_get_many_best_effort(batch_service):
    out = batch_service.get_many(["NBIS", "ZZZZ", "DGXX"])
    assert set(out) == {"NBIS", "DGXX"}  # unknown dropped, not fatal


def test_get_many_all_fail_raises(batch_service):
    with pytest.raises(QuoteError) as exc:
        batch_service.get_many(["ZZZZ", "YYYY"])
    assert exc.value.code == "NO_DATA"


def test_get_many_empty_is_clean_noop(batch_service):
    assert batch_service.get_many([]) == {}  # no raise, no divide-by-zero


# ----------------------------------------------------------------------
# from_env
# ----------------------------------------------------------------------
def test_from_env_defaults_to_fixture():
    assert EarningsService.from_env("fixture").provider.source == "fixture"
    assert EarningsService.from_env("nonsense").provider.source == "fixture"
    # fixture mode carries precomputed reactions, so no candle service needed.
    assert EarningsService.from_env("fixture").candle_service is None


def test_from_env_live_wires_finnhub_and_candles():
    svc = EarningsService.from_env("live")
    assert svc.provider.source == "finnhub"
    assert svc.candle_service is not None  # reaction enrichment enabled


# ----------------------------------------------------------------------
# Live smoke (skipped in CI; run with -m live)
# ----------------------------------------------------------------------
@pytest.mark.live
def test_live_finnhub_smoke():
    """Fetch real earnings for NVDA from Finnhub (needs FINNHUB_API_KEY)."""
    svc = EarningsService.from_env("live")
    h = svc.get_earnings("NVDA")
    assert h.symbol == "NVDA"
    assert h.events
    assert h.source == "finnhub"

def test_service_uses_fallback_provider_when_primary_fails():
    class Primary:
        source = "finnhub"
        def get_earnings(self, symbol):
            raise QuoteError("NO_DATA", "primary unavailable")

    class Fallback:
        source = "fmp"
        def get_earnings(self, symbol):
            return EarningsHistory(
                symbol=symbol,
                events=[EarningsEvent(symbol=symbol, date="2026-10-20", when="upcoming")],
                source="fmp",
            )

    svc = EarningsService(
        provider=Primary(),
        fallback_provider=Fallback(),
        candle_service=None,
    )
    result = svc.get_earnings("NVDA")
    assert result.source == "fmp"
    assert result.next_event() is not None


def test_service_does_not_call_fallback_when_primary_is_usable():
    class Primary:
        source = "finnhub"
        def get_earnings(self, symbol):
            return EarningsHistory(
                symbol=symbol,
                events=[EarningsEvent(symbol=symbol, date="2026-10-20", when="upcoming")],
                source="finnhub",
            )

    class Fallback:
        source = "fmp"
        def get_earnings(self, symbol):
            raise AssertionError("fallback should not be called")

    svc = EarningsService(
        provider=Primary(),
        fallback_provider=Fallback(),
        candle_service=None,
    )
    result = svc.get_earnings("NVDA")
    assert result.source == "finnhub"
