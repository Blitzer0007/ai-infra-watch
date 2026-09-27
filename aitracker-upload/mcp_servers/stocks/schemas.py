"""Pydantic schemas for mcp-server-stocks.

These are the CONTRACT between the stocks MCP server and any client
(the Market Agent, the dashboard, tests). Every tool returns one of
these models; contract tests assert the server's tool schemas match
them, so an agent can type-check against a stable shape.

Design: prices are floats in the quote currency (USD for the tracked
universe). `as_of` is an ISO-8601 UTC timestamp string — we keep it a
string (not datetime) so the wire form is stable and JSON-native, and
so the timestamp is explicit in every claim (a guardrail requirement:
"every claim cites its source and timestamp").
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Quote(BaseModel):
    """A single point-in-time quote for one symbol."""

    symbol: str = Field(description="Ticker symbol, upper-case, e.g. NVDA")
    price: float = Field(description="Last/current price in quote currency")
    change: float = Field(default=0.0, description="Absolute change vs previous close")
    change_pct: float = Field(default=0.0, description="Percent change vs previous close")
    high: float = Field(default=0.0, description="Session high")
    low: float = Field(default=0.0, description="Session low")
    open: float = Field(default=0.0, description="Session open")
    prev_close: float = Field(default=0.0, description="Previous session close")
    volume: float | None = Field(default=None, description="Session volume if available")
    currency: str = Field(default="USD")
    as_of: str = Field(description="ISO-8601 UTC timestamp the quote was observed")
    source: str = Field(default="finnhub", description="Data source id (finnhub|fixture)")

    def one_line(self) -> str:
        """Human/agent-readable single line with the mandatory timestamp."""
        return (
            f"{self.symbol} {self.price:.2f} {self.currency} "
            f"({self.change_pct:+.2f}%) as of {self.as_of} [{self.source}]"
        )


class QuoteBatch(BaseModel):
    """Quotes for several symbols observed together."""

    quotes: list[Quote] = Field(default_factory=list)
    as_of: str = Field(description="ISO-8601 UTC timestamp of the batch")
    source: str = Field(default="finnhub")

    def symbols(self) -> list[str]:
        return [q.symbol for q in self.quotes]


class Candle(BaseModel):
    """One daily OHLCV bar for one symbol (the unit of price history).

    `date` is an ISO-8601 date string (YYYY-MM-DD) for one trading session —
    kept a string (not date) so the wire form is stable and JSON-native, same
    discipline as Quote.as_of. Only `close` is required; the rotation detector
    reads closes, so open/high/low/volume are best-effort.
    """

    symbol: str = Field(description="Ticker symbol, upper-case, e.g. NVDA")
    date: str = Field(description="ISO-8601 date (YYYY-MM-DD) of the session")
    open: float = Field(default=0.0)
    high: float = Field(default=0.0)
    low: float = Field(default=0.0)
    close: float = Field(description="Session close in quote currency")
    volume: float | None = Field(default=None)
    source: str = Field(default="fixture", description="Data source id (stooq|fixture)")


class CandleSeries(BaseModel):
    """A run of daily candles for one symbol, ORDERED oldest -> newest.

    The multi-day history the rotation detector needs (the live quote feed is
    snapshot-only). `window_return` is the only piece of domain math and lives
    here so both the service and the agent share one implementation.
    """

    symbol: str = Field(description="Ticker symbol, upper-case")
    candles: list[Candle] = Field(default_factory=list)
    source: str = Field(default="fixture")

    def closes(self) -> list[float]:
        return [c.close for c in self.candles]

    def latest_close(self) -> float | None:
        return self.candles[-1].close if self.candles else None

    def window_return(self, window: int) -> float | None:
        """Percent close-to-close change over the last `window` sessions.

        Needs `window + 1` candles (a start bar and an end bar). Returns None
        on insufficient history or a zero start price — an explicit "no signal"
        that the detector treats as a degrade, never a divide-by-zero.
        """
        closes = self.closes()
        if window < 1 or len(closes) < window + 1:
            return None
        start = closes[-1 - window]
        end = closes[-1]
        if start == 0:
            return None
        return (end - start) / start * 100.0


class EarningsEvent(BaseModel):
    """One earnings report for one symbol — past (actuals known) or upcoming.

    Mirrors Candle's discipline: `date` is an ISO-8601 date string (the report
    date) so the wire form is stable and JSON-native. A PAST event carries
    `eps_actual` (and usually `eps_estimate`); an UPCOMING event has
    `eps_actual=None`. `surprise_pct` is (actual-estimate)/|estimate|*100 when
    both are known — an explicit None otherwise, never a divide-by-zero.

    `price_reaction_pct` is the day-before-close -> day-after-close percent move
    around the report, computed by the service from candle history. It is None
    for upcoming events and for past events without enough surrounding history.
    """

    symbol: str = Field(description="Ticker symbol, upper-case, e.g. NVDA")
    date: str = Field(description="ISO-8601 date (YYYY-MM-DD) of the report")
    when: Literal["past", "upcoming"] = Field(
        default="past", description="Whether the report has happened yet"
    )
    period: str | None = Field(
        default=None, description="Fiscal period label if known, e.g. 2026-Q1"
    )
    hour: str | None = Field(
        default=None, description="Session timing if known: bmo|amc|dmh"
    )
    eps_actual: float | None = Field(default=None, description="Reported EPS (past only)")
    eps_estimate: float | None = Field(default=None, description="Consensus EPS estimate")
    revenue_actual: float | None = Field(default=None, description="Reported revenue if known")
    revenue_estimate: float | None = Field(default=None, description="Consensus revenue estimate")
    surprise_pct: float | None = Field(
        default=None, description="EPS surprise %: (actual-estimate)/|estimate|*100"
    )
    price_reaction_pct: float | None = Field(
        default=None,
        description="Day-before-close -> day-after-close % move around the report",
    )
    source: str = Field(default="fixture", description="Data source id (finnhub|fixture)")

    def compute_surprise(self) -> float | None:
        """EPS surprise %, or None if either side is missing / estimate is 0."""
        a, e = self.eps_actual, self.eps_estimate
        if a is None or e is None or e == 0:
            return None
        return (a - e) / abs(e) * 100.0


class EarningsHistory(BaseModel):
    """A symbol's earnings timeline, ORDERED oldest -> newest.

    Holds both past and upcoming events. Convenience accessors let the API and
    the dashboard slice the two without re-implementing the `when` filter.
    """

    symbol: str = Field(description="Ticker symbol, upper-case")
    events: list[EarningsEvent] = Field(default_factory=list)
    source: str = Field(default="fixture")

    def past(self) -> list[EarningsEvent]:
        return [e for e in self.events if e.when == "past"]

    def upcoming(self) -> list[EarningsEvent]:
        return [e for e in self.events if e.when == "upcoming"]

    def next_event(self) -> EarningsEvent | None:
        """The earliest upcoming event (events are oldest->newest)."""
        up = self.upcoming()
        return up[0] if up else None


class FeedMessage(BaseModel):
    """One message on the live feed resource (stocks://quotes/live).

    kind:
      * quote  — a fresh quote (payload = Quote)
      * error  — a fetch error for a symbol (payload carries code/message)
      * status — feed lifecycle (connected / polling / backoff)
    """

    kind: Literal["quote", "error", "status"]
    symbol: str | None = None
    quote: Quote | None = None
    code: str | None = None
    message: str | None = None
    as_of: str = Field(description="ISO-8601 UTC timestamp of the message")


class ServerHealth(BaseModel):
    """Health snapshot for observability + the dashboard's server-status tile."""

    server: str = "mcp-server-stocks"
    mode: Literal["live", "fixture"] = "fixture"
    ok: bool = True
    watchlist: list[str] = Field(default_factory=list)
    last_poll_as_of: str | None = None
    consecutive_errors: int = 0
    detail: str = ""
