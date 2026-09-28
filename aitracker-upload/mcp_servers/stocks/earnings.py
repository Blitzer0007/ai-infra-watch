"""Earnings calendar + history for mcp-server-stocks.

Past and upcoming earnings per symbol, with the historical PRICE REACTION
around each past report — the "what did the stock do when it reported" signal
the Progress Tracker page surfaces. Same Protocol + Fixture + Live + from_env
shape as providers.py (quotes) and candles.py (price history):

  * EarningsProvider        — the Protocol every source satisfies.
  * FixtureEarningsProvider — offline, deterministic; reads a committed
    fixtures/earnings.json (the default for tests, CI, and the hermetic
    /api/earnings path). Zero network.
  * FinnhubEarningsProvider — live from Finnhub's /calendar/earnings (upcoming
    + recent, with estimates) and /stock/earnings (reported EPS actual vs
    estimate), with the same retry/backoff discipline as FinnhubProvider.
  * EarningsService — best-effort batch (a symbol that errors is omitted, not
    fatal — mirrors StockService.get_quotes) + from_env(mode). When given a
    CandleService it ENRICHES each past event with its price reaction.

REACTION MATH lives in `_reaction_from_series` (pure, unit-tested on a
synthetic labeled candle series): the report date is bracketed by the last
close strictly before it and the first close strictly after it, so the window
captures the move regardless of a bmo/amc report time. Upcoming events, and
past events without enough surrounding history, get price_reaction_pct=None
(explicit "no signal", never a divide-by-zero).
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Protocol

import httpx

from .candles import CandleService
from .providers import QuoteError, _http_retryable
from .schemas import CandleSeries, EarningsEvent, EarningsHistory

EARNINGS_FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "earnings.json"


def _reaction_from_series(series: CandleSeries, date: str) -> float | None:
    """Percent move around `date`: last close strictly before -> first close
    strictly after, as a percent of the before-close.

    Bracketing the report date (rather than using the report-day close) captures
    the reaction whether the company reported before the open or after the close.
    Returns None on insufficient surrounding history or a zero anchor price — an
    explicit "no signal", never a divide-by-zero.
    """
    before = None
    after = None
    for candle in series.candles:  # candles are ordered oldest -> newest
        if candle.date < date:
            before = candle  # keep advancing to the LAST one before the date
        elif candle.date > date and after is None:
            after = candle  # first one after the date
            break
    if before is None or after is None or before.close == 0:
        return None
    return (after.close - before.close) / before.close * 100.0


class EarningsProvider(Protocol):
    def get_earnings(self, symbol: str) -> EarningsHistory: ...
    @property
    def source(self) -> str: ...


# ----------------------------------------------------------------------
# Fixture provider (offline, deterministic)
# ----------------------------------------------------------------------
class FixtureEarningsProvider:
    """Serve earnings history from a committed JSON fixture.

    Fixture shape (mcp_servers/stocks/fixtures/earnings.json):
        {
          "NBIS": [
            {"date": "2026-05-20", "when": "past", "period": "2026-Q1",
             "eps_actual": -0.12, "eps_estimate": -0.18,
             "price_reaction_pct": 8.4},
            {"date": "2026-08-19", "when": "upcoming", "eps_estimate": -0.05}
          ],
          ...
        }
    Missing fields default per the EarningsEvent schema. `surprise_pct` is
    computed from actual/estimate when absent so the fixture need not hard-code
    it. Events are returned in the fixture's order (author them oldest->newest).
    """

    source = "fixture"

    def __init__(self, fixture_path: Path | str | None = None) -> None:
        self.fixture_path = Path(fixture_path) if fixture_path is not None else EARNINGS_FIXTURE_PATH
        self._data: dict[str, list[dict]] | None = None

    def _load(self) -> dict[str, list[dict]]:
        if self._data is None:
            try:
                raw = json.loads(self.fixture_path.read_text(encoding="utf-8"))
            except FileNotFoundError as exc:
                raise QuoteError("NO_DATA", f"earnings fixture not found: {self.fixture_path}") from exc
            except json.JSONDecodeError as exc:
                raise QuoteError("NO_DATA", f"bad earnings fixture JSON: {exc}") from exc
            self._data = {k.upper(): list(v) for k, v in raw.items()}
        return self._data

    def get_earnings(self, symbol: str) -> EarningsHistory:
        symbol = symbol.strip().upper()
        rows = self._load().get(symbol)
        if not rows:
            raise QuoteError("NO_DATA", f"no fixture earnings for {symbol}")
        events: list[EarningsEvent] = []
        for row in rows:
            event = EarningsEvent(symbol=symbol, source=self.source, **row)
            if event.surprise_pct is None:
                event.surprise_pct = event.compute_surprise()
            events.append(event)
        return EarningsHistory(symbol=symbol, events=events, source=self.source)


# ----------------------------------------------------------------------
# Finnhub provider (live)
# ----------------------------------------------------------------------
class FinnhubEarningsProvider:
    """Live earnings from Finnhub. Normalizes to the EarningsHistory schema.

    Two endpoints, merged by report date:
      * /calendar/earnings?symbol=&from=&to= — scheduled reports (past + future)
        with epsEstimate/epsActual/revenueEstimate/revenueActual and `hour`.
      * /stock/earnings?symbol= — the last few REPORTED quarters (actual vs
        estimate + surprise), used to fill actuals the calendar may lag on.
    Retries transient HTTP errors with exponential backoff — same policy as
    FinnhubProvider. Reaction enrichment is done by EarningsService, not here.
    """

    source = "finnhub"
    BASE = "https://finnhub.io/api/v1"

    def __init__(
        self,
        api_key: str | None = None,
        max_retries: int = 4,
        base_delay: float = 1.0,
        timeout: float = 15.0,
        window_days: int = 400,
        clock=time.time,
    ) -> None:
        import os

        self.api_key = api_key if api_key is not None else os.getenv("FINNHUB_API_KEY", "")
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout
        self.window_days = window_days
        self._clock = clock

    def _get(self, path: str, params: dict) -> dict:
        url = f"{self.BASE}{path}"
        params = {**params, "token": self.api_key}
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.get(url, params=params)
                if resp.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("RATE_LIMIT", "Finnhub rate limit (60/min free tier)")
                if resp.status_code >= 400:
                    if _http_retryable(resp.status_code) and attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("HTTP_ERROR", f"Finnhub returned {resp.status_code}")
                return resp.json()
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"Finnhub request failed: {last_exc}")

    def get_earnings(self, symbol: str) -> EarningsHistory:
        if not self.api_key:
            raise QuoteError("NO_KEY", "FINNHUB_API_KEY is not set")
        symbol = symbol.strip().upper()
        today = self._clock()
        frm = time.strftime("%Y-%m-%d", time.gmtime(today - self.window_days * 86400))
        to = time.strftime("%Y-%m-%d", time.gmtime(today + self.window_days * 86400))
        today_str = time.strftime("%Y-%m-%d", time.gmtime(today))

        cal = self._get("/calendar/earnings", {"symbol": symbol, "from": frm, "to": to})
        rows = cal.get("earningsCalendar") or []
        # /stock/earnings backfills reported actuals keyed by report date.
        actuals: dict[str, dict] = {}
        try:
            for rec in self._get("/stock/earnings", {"symbol": symbol}) or []:
                if rec.get("period"):
                    actuals[rec["period"]] = rec
        except QuoteError:
            pass  # calendar alone is enough; actuals are best-effort

        # Normalize the calendar plus the reported-earnings endpoint.
        # Finnhub's calendar can omit EPS actuals for recently completed
        # quarters, while /stock/earnings contains the reported actuals.
        # Merge both sources by report date so past events are not silently
        # classified as upcoming or dropped from event studies.
        merged: dict[str, dict] = {}

        for row in rows:
            date = row.get("date")
            if not date:
                continue
            merged[str(date)] = dict(row)

        for date, rec in actuals.items():
            if not date:
                continue
            row = merged.setdefault(str(date), {})
            if row.get("epsActual") is None:
                row["epsActual"] = rec.get("actual")
            if row.get("epsEstimate") is None:
                row["epsEstimate"] = rec.get("estimate")
            if row.get("quarter") is None and rec.get("quarter") is not None:
                row["quarter"] = rec.get("quarter")
            if row.get("year") is None and rec.get("year") is not None:
                row["year"] = rec.get("year")
            if row.get("hour") is None:
                row["hour"] = rec.get("hour")

        events: list[EarningsEvent] = []
        for date, row in sorted(merged.items()):
            eps_actual = row.get("epsActual")
            eps_estimate = row.get("epsEstimate")

            # /stock/earnings uses actual/estimate; calendar uses
            # epsActual/epsEstimate. Keep a fallback for provider variations.
            if eps_actual is None:
                back = actuals.get(date)
                if back is not None:
                    eps_actual = back.get("actual")
            if eps_estimate is None:
                back = actuals.get(date)
                if back is not None:
                    eps_estimate = back.get("estimate")

            when = "past" if date <= today_str and eps_actual is not None else (
                "past" if date < today_str else "upcoming"
            )
            event = EarningsEvent(
                symbol=symbol,
                date=date,
                when=when,
                hour=row.get("hour") or None,
                period=(
                    row.get("quarter") is not None
                    and row.get("year") is not None
                    and f"{row.get('year')}-Q{row.get('quarter')}"
                    or row.get("period")
                ),
                eps_actual=eps_actual,
                eps_estimate=eps_estimate,
                revenue_actual=row.get("revenueActual"),
                revenue_estimate=row.get("revenueEstimate"),
                source=self.source,
            )
            event.surprise_pct = event.compute_surprise()
            events.append(event)

        if not events:
            raise QuoteError("NO_DATA", f"no earnings data for {symbol}")
        events.sort(key=lambda e: e.date)
        return EarningsHistory(symbol=symbol, events=events, source=self.source)


# ----------------------------------------------------------------------
# Service (best-effort batch + reaction enrichment)
# ----------------------------------------------------------------------
class EarningsService:
    """Transport-independent earnings logic over an EarningsProvider.

    Best-effort batch like StockService.get_quotes / CandleService.get_histories:
    a symbol that errors is omitted, and `get_many` fails as a whole ONLY if
    EVERY symbol errors (total outage) — partial data still reaches the page.

    When constructed with a CandleService, each PAST event whose reaction is not
    already supplied by the provider is enriched with its price reaction from
    candle history (see `_reaction_from_series`). Reaction enrichment is
    best-effort: a candle outage leaves reaction=None, it never fails the event.
    """

    def __init__(
        self,
        provider: EarningsProvider | None = None,
        candle_service: CandleService | None = None,
    ) -> None:
        self.provider = provider or FixtureEarningsProvider()
        self.candle_service = candle_service

    @classmethod
    def from_env(cls, mode: str = "fixture") -> "EarningsService":
        if mode == "live":
            return cls(
                provider=FinnhubEarningsProvider(),
                candle_service=CandleService.from_env("live"),
            )
        return cls(
            provider=FixtureEarningsProvider(fixture_path=EARNINGS_FIXTURE_PATH),
            candle_service=None,  # fixtures carry precomputed reactions
        )

    def _enrich_reactions(self, history: EarningsHistory) -> EarningsHistory:
        """Populate price_reaction_pct for past events lacking one, from candles."""
        if self.candle_service is None:
            return history
        needs = [e for e in history.past() if e.price_reaction_pct is None]
        if not needs:
            return history
        try:
            series = self.candle_service.get_series(history.symbol)
        except QuoteError:
            return history  # no history -> leave reactions None (degrade)
        for event in needs:
            event.price_reaction_pct = _reaction_from_series(series, event.date)
        return history

    def get_earnings(self, symbol: str) -> EarningsHistory:
        """One symbol's earnings (reaction-enriched). Raises QuoteError on failure."""
        history = self.provider.get_earnings(symbol)
        return self._enrich_reactions(history)

    def get_many(self, symbols: list[str]) -> dict[str, EarningsHistory]:
        """Best-effort {symbol: EarningsHistory}. Omits symbols that error.

        Raises only when EVERY requested symbol fails (total outage). An empty
        `symbols` list returns `{}` cleanly — no divide-by-zero, no raise.
        """
        out: dict[str, EarningsHistory] = {}
        errors = 0
        for sym in symbols:
            try:
                out[sym.strip().upper()] = self.get_earnings(sym)
            except QuoteError:
                errors += 1
        if symbols and errors == len(symbols):
            raise QuoteError("NO_DATA", f"all {len(symbols)} symbols failed")
        return out


def from_env(mode: str = "fixture") -> EarningsService:
    """Module-level mirror of EarningsService.from_env."""
    return EarningsService.from_env(mode=mode)
