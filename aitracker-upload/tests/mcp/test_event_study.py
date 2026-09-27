from __future__ import annotations

import pytest

from mcp_servers.stocks.candles import CandleService, FixtureCandleProvider, series_from_closes
from mcp_servers.stocks.earnings import EarningsService, EarningsProvider
from mcp_servers.stocks.event_study import EventStudyService, _forward_return
from mcp_servers.stocks.schemas import EarningsEvent, EarningsHistory


class _Provider:
    source = "fixture"

    def get_earnings(self, symbol: str) -> EarningsHistory:
        return EarningsHistory(
            symbol=symbol.upper(),
            events=[
                EarningsEvent(
                    symbol=symbol.upper(),
                    date="2026-01-02",
                    when="past",
                    period="2026-Q1",
                    hour="bmo",
                    eps_actual=1.1,
                    eps_estimate=1.0,
                    source="fixture",
                )
            ],
            source="fixture",
        )


def test_forward_return_uses_event_close_for_bmo():
    series = series_from_closes("X", [100, 110, 115, 120, 125, 130, 135])
    event = EarningsEvent(symbol="X", date="2026-01-02", when="past", hour="bmo")
    assert _forward_return(series, event, 1) == pytest.approx(10.0)


def test_forward_return_returns_none_when_horizon_is_unavailable():
    series = series_from_closes("X", [100, 110, 115])
    event = EarningsEvent(symbol="X", date="2026-01-02", when="past", hour="amc")
    assert _forward_return(series, event, 5) is None


def test_event_study_builds_t1_t5_t20_fields():
    closes = list(range(100, 141))
    svc = EventStudyService(
        earnings=EarningsService(provider=_Provider(), candle_service=None),
        candles=CandleService(provider=FixtureCandleProvider(series_map={"X": closes})),
    )
    out = svc.get_study("X")
    assert out["symbol"] == "X"
    assert len(out["events"]) == 1
    event = out["events"][0]
    assert {"t_plus_1_pct", "t_plus_5_pct", "t_plus_20_pct"} <= set(event)
    assert event["t_plus_1_pct"] is not None
    assert event["t_plus_5_pct"] is not None
    assert event["t_plus_20_pct"] is not None
