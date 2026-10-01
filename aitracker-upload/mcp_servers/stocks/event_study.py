"""Event-study analytics for AI Infra Watch.

Computes post-event persistence from an earnings event and daily candles.
The event date is anchored against the last close strictly before the report;
the targets are the first, fifth, and twentieth post-event trading sessions.
For bmo reports the event-date close is eligible; for amc/unknown reports the
first strictly later close is used. Missing history yields None rather than a
guessed number.
"""
from __future__ import annotations

from typing import Any

from .candles import CandleService
from .earnings import EarningsService
from .schemas import CandleSeries, EarningsEvent


def _anchor_and_target_indices(series: CandleSeries, event: EarningsEvent, horizon: int) -> tuple[int, int] | None:
    candles = series.candles
    if not candles or horizon < 1:
        return None

    before = [i for i, c in enumerate(candles) if c.date < event.date]
    if not before:
        return None
    anchor = before[-1]

    # bmo/dmh: event-date close is a valid first post-event close.
    # amc/unknown: use the first strictly later trading session.
    eligible = [
        i for i, c in enumerate(candles)
        if i > anchor and (c.date > event.date or (c.date == event.date and event.hour in {"bmo", "dmh"}))
    ]
    if not eligible:
        return None
    first = eligible[0]
    target = first + (horizon - 1)
    if target >= len(candles):
        return None
    return anchor, target


def _forward_return(series: CandleSeries, event: EarningsEvent, horizon: int) -> float | None:
    pair = _anchor_and_target_indices(series, event, horizon)
    if pair is None:
        return None
    anchor, target = pair
    start = series.candles[anchor].close
    end = series.candles[target].close
    if start == 0:
        return None
    return (end - start) / start * 100.0


class EventStudyService:
    """Earnings-event persistence over 1/5/20 post-event sessions."""

    def __init__(
        self,
        earnings: EarningsService | None = None,
        candles: CandleService | None = None,
    ) -> None:
        self.earnings = earnings or EarningsService.from_env("fixture")
        self.candles = candles or CandleService.from_env("fixture")

    @classmethod
    def from_env(cls, mode: str = "fixture") -> "EventStudyService":
        return cls(
            earnings=EarningsService.from_env(mode),
            candles=CandleService.from_env(mode),
        )

    def get_study(self, symbol: str) -> dict[str, Any]:
        sym = symbol.strip().upper()
        history = self.earnings.get_earnings(sym)
        series = self.candles.get_series(sym, lookback=120)
        events = []
        for event in history.past():
            events.append({
                "date": event.date,
                "period": event.period,
                "hour": event.hour,
                "eps_surprise_pct": event.surprise_pct,
                "t_plus_1_pct": _forward_return(series, event, 1),
                "t_plus_5_pct": _forward_return(series, event, 5),
                "t_plus_20_pct": _forward_return(series, event, 20),
                "source": event.source,
                "candle_source": series.source,
            })
        return {
            "symbol": sym,
            "events": events,
            "source": history.source,
            "candle_source": series.source,
        }


def from_env(mode: str = "fixture") -> EventStudyService:
    return EventStudyService.from_env(mode=mode)
