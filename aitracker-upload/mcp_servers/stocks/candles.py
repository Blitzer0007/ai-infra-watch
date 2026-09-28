"""Price-history (candle) store for mcp-server-stocks — Phase 3.6 DEPENDENCY 2.

The live quote feed (providers.py) is snapshot-only: one Quote per symbol. The
Rotation Detector needs multi-day history to compute rolling 1d/5d/20d returns,
so this module adds a small daily-candle store behind the same Protocol +
Fixture + Live + from_env pattern as the quote providers.

  * CandleProvider   — the Protocol every source satisfies.
  * FixtureCandleProvider — offline, deterministic. Accepts an in-memory
    {symbol: [closes...]} map (hermetic synthetic-series tests) OR a committed
    JSON fixture. The default for tests and CI; zero network.
  * StooqCandleProvider — live daily candles from stooq.com's free CSV endpoint
    (no key), with the same retry/backoff discipline as FinnhubProvider.
  * CandleService — best-effort batch over a provider (mirrors StockService):
    a symbol that errors is omitted, not fatal, so a partial outage still
    yields partial history.

EVAL INTEGRITY: the fixture provider serves *synthetic labeled* series with
known ground truth. The detector is tested against those, never fit to real
NVDA-vs-MSFT history — same discipline as the golden set.
"""
from __future__ import annotations

import csv
import io
import json
import time
from pathlib import Path
from typing import Protocol

import httpx

from .providers import QuoteError, _http_retryable
from .schemas import Candle, CandleSeries

CANDLES_FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "candles.json"

# A fixed anchor so synthetic {symbol: [closes]} series get deterministic,
# monotonically-increasing session dates without a wall clock (Date.now is
# banned in this codebase's deterministic layers). Dates are cosmetic — the
# detector reads closes by position, not by calendar.
_ANCHOR_YEAR = 2026
_ANCHOR_MONTH = 1


def _synthetic_dates(n: int) -> list[str]:
    """n ISO dates, oldest -> newest, one per (pseudo) session day."""
    # Simple day counter from a fixed anchor; not calendar-accurate (no
    # weekend/holiday skips) because position, not date, drives the math.
    out: list[str] = []
    day = 1
    month = _ANCHOR_MONTH
    year = _ANCHOR_YEAR
    for _ in range(n):
        out.append(f"{year:04d}-{month:02d}-{day:02d}")
        day += 1
        if day > 28:  # keep every month valid without calendar tables
            day = 1
            month += 1
            if month > 12:
                month = 1
                year += 1
    return out


def series_from_closes(symbol: str, closes: list[float], source: str = "fixture") -> CandleSeries:
    """Build a CandleSeries from a bare list of closes (oldest -> newest).

    The workhorse for synthetic labeled tests: `[100, 101, 98]` becomes three
    dated candles whose only meaningful field is `close`. open/high/low mirror
    close (flat bars) so the series is well-formed without inventing intrabar
    structure the detector never reads.
    """
    symbol = symbol.strip().upper()
    dates = _synthetic_dates(len(closes))
    candles = [
        Candle(symbol=symbol, date=d, open=c, high=c, low=c, close=c, source=source)
        for d, c in zip(dates, closes)
    ]
    return CandleSeries(symbol=symbol, candles=candles, source=source)


class CandleProvider(Protocol):
    def get_series(self, symbol: str, lookback: int) -> CandleSeries: ...
    @property
    def source(self) -> str: ...


# ----------------------------------------------------------------------
# Fixture provider (offline, deterministic)
# ----------------------------------------------------------------------
class FixtureCandleProvider:
    """Serve candle series from in-memory closes or a committed JSON fixture.

    Two construction modes:
      * `series_map={"NVDA": [100, 97, ...]}` — synthetic labeled series built
        in the test, fully hermetic (the primary Phase-3.6 test vehicle).
      * `fixture_path=...` — a committed JSON file of the same shape, for the
        service-layer unit tests and `from_env("fixture")`.

    Fixture JSON shape (fixtures/candles.json):
        {"NVDA": [180.1, 179.4, ...], "MSFT": [...]}   # closes, oldest->newest
    """

    source = "fixture"

    def __init__(
        self,
        series_map: dict[str, list[float]] | None = None,
        fixture_path: Path | str | None = None,
    ) -> None:
        if series_map is None and fixture_path is None:
            fixture_path = CANDLES_FIXTURE_PATH
        self.fixture_path = Path(fixture_path) if fixture_path is not None else None
        self._series_map = series_map
        self._data: dict[str, list[float]] | None = (
            {k.upper(): list(v) for k, v in series_map.items()} if series_map is not None else None
        )

    def _load(self) -> dict[str, list[float]]:
        if self._data is None:
            try:
                raw = json.loads(self.fixture_path.read_text(encoding="utf-8"))
            except FileNotFoundError as exc:
                raise QuoteError("NO_DATA", f"candle fixture not found: {self.fixture_path}") from exc
            except json.JSONDecodeError as exc:
                raise QuoteError("NO_DATA", f"bad candle fixture JSON: {exc}") from exc
            self._data = {k.upper(): list(v) for k, v in raw.items()}
        return self._data

    def get_series(self, symbol: str, lookback: int = 60) -> CandleSeries:
        symbol = symbol.strip().upper()
        closes = self._load().get(symbol)
        if not closes:
            raise QuoteError("NO_DATA", f"no fixture candles for {symbol}")
        if lookback > 0:
            closes = closes[-(lookback + 1):]  # keep enough for a `lookback`-window return
        return series_from_closes(symbol, closes, source=self.source)


# ----------------------------------------------------------------------
# Stooq provider (live, free, no key)
# ----------------------------------------------------------------------
class StooqCandleProvider:
    """Live daily candles from stooq.com's free CSV endpoint (no API key).

    stooq serves `https://stooq.com/q/d/l/?s=<symbol>.us&i=d` as CSV with a
    header `Date,Open,High,Low,Close,Volume`. US tickers take a `.us` suffix.
    Invalid symbols return the body `N/D` (not an HTTP error), which we map to
    NO_DATA. Transient HTTP errors retry with exponential backoff — same policy
    as FinnhubProvider.
    """

    source = "stooq"
    BASE = "https://stooq.com/q/d/l/"

    def __init__(
        self,
        clock=None,
        max_retries: int = 4,
        base_delay: float = 1.0,
        timeout: float = 15.0,
    ) -> None:
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout

    def get_series(self, symbol: str, lookback: int = 60) -> CandleSeries:
        symbol = symbol.strip().upper()
        params = {"s": f"{symbol}.us", "i": "d"}
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.get(self.BASE, params=params)
                if resp.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("RATE_LIMIT", "stooq rate limit")
                if resp.status_code >= 400:
                    if _http_retryable(resp.status_code) and attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("HTTP_ERROR", f"stooq returned {resp.status_code}")
                return self._parse(symbol, resp.text, lookback)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"stooq request failed: {last_exc}")

    def _parse(self, symbol: str, body: str, lookback: int) -> CandleSeries:
        text = (body or "").strip()
        if not text or text.upper().startswith("N/D"):
            raise QuoteError("NO_DATA", f"no data for symbol {symbol}")
        rows = list(csv.DictReader(io.StringIO(text)))
        candles: list[Candle] = []
        for row in rows:
            close_raw = row.get("Close") or row.get("close")
            date_raw = row.get("Date") or row.get("date")
            if not close_raw or not date_raw:
                continue
            try:
                candles.append(
                    Candle(
                        symbol=symbol,
                        date=date_raw,
                        open=float(row.get("Open") or 0.0),
                        high=float(row.get("High") or 0.0),
                        low=float(row.get("Low") or 0.0),
                        close=float(close_raw),
                        volume=float(row["Volume"]) if row.get("Volume") else None,
                        source=self.source,
                    )
                )
            except ValueError:
                continue  # skip a malformed row, keep the rest (degrade)
        if not candles:
            raise QuoteError("NO_DATA", f"no parseable candles for {symbol}")
        if lookback > 0:
            candles = candles[-(lookback + 1):]
        return CandleSeries(symbol=symbol, candles=candles, source=self.source)


# ----------------------------------------------------------------------
# Finnhub provider (live, uses the same API key as quotes/earnings)
# ----------------------------------------------------------------------
class FinnhubCandleProvider:
    """Live daily candles from Finnhub's /stock/candle endpoint."""

    source = "finnhub"

    def __init__(
        self,
        api_key: str | None = None,
        max_retries: int = 4,
        base_delay: float = 1.0,
        timeout: float = 15.0,
    ) -> None:
        import os
        self.api_key = api_key if api_key is not None else os.getenv("FINNHUB_API_KEY", "")
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout

    def get_series(self, symbol: str, lookback: int = 60) -> CandleSeries:
        if not self.api_key:
            raise QuoteError("NO_KEY", "FINNHUB_API_KEY is not set")
        symbol = symbol.strip().upper()
        # Request a generous daily window so recent earnings have enough
        # pre/post-event sessions for T+1/T+5/T+20.
        now = int(time.time())
        days = max(120, lookback + 30)
        params = {
            "symbol": symbol,
            "resolution": "D",
            "from": now - days * 86400,
            "to": now,
            "token": self.api_key,
        }
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.get("https://finnhub.io/api/v1/stock/candle", params=params)
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
                data = resp.json()
                if data.get("s") != "ok":
                    raise QuoteError("NO_DATA", f"no candle data for {symbol}")
                closes = data.get("c") or []
                timestamps = data.get("t") or []
                opens = data.get("o") or []
                highs = data.get("h") or []
                lows = data.get("l") or []
                volumes = data.get("v") or []
                candles: list[Candle] = []
                for i, ts in enumerate(timestamps):
                    try:
                        candles.append(
                            Candle(
                                symbol=symbol,
                                date=time.strftime("%Y-%m-%d", time.gmtime(ts)),
                                open=float(opens[i]),
                                high=float(highs[i]),
                                low=float(lows[i]),
                                close=float(closes[i]),
                                volume=float(volumes[i]) if i < len(volumes) else None,
                                source=self.source,
                            )
                        )
                    except (IndexError, TypeError, ValueError):
                        continue
                if not candles:
                    raise QuoteError("NO_DATA", f"no parseable candle data for {symbol}")
                candles.sort(key=lambda c: c.date)
                if lookback > 0:
                    candles = candles[-(lookback + 1):]
                return CandleSeries(symbol=symbol, candles=candles, source=self.source)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"Finnhub candle request failed: {last_exc}")


# ----------------------------------------------------------------------
# Yahoo Finance provider (live, no API key)
# ----------------------------------------------------------------------
class YahooCandleProvider:
    """Live daily candles from Yahoo Finance's chart endpoint.

    This endpoint does not require a separate API key and is used for
    historical event-study data. Quote/earnings data can continue to come
    from Finnhub.
    """

    source = "yahoo"

    def __init__(self, max_retries: int = 3, base_delay: float = 1.0, timeout: float = 15.0) -> None:
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout

    def get_series(self, symbol: str, lookback: int = 60) -> CandleSeries:
        symbol = symbol.strip().upper()
        now = int(time.time())
        days = max(180, lookback + 60)
        params = {
            "period1": now - days * 86400,
            "period2": now,
            "interval": "1d",
            "events": "history",
            "includeAdjustedClose": "true",
        }
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout, headers={"User-Agent": "Mozilla/5.0"}) as client:
                    resp = client.get(url, params=params)
                if resp.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("RATE_LIMIT", "Yahoo Finance rate limit")
                if resp.status_code >= 400:
                    if _http_retryable(resp.status_code) and attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("HTTP_ERROR", f"Yahoo Finance returned {resp.status_code}")
                payload = resp.json()
                result = ((payload.get("chart") or {}).get("result") or [None])[0]
                if not result:
                    raise QuoteError("NO_DATA", f"no candle data for {symbol}")
                timestamps = result.get("timestamp") or []
                quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
                opens = quote.get("open") or []
                highs = quote.get("high") or []
                lows = quote.get("low") or []
                closes = quote.get("close") or []
                volumes = quote.get("volume") or []
                candles: list[Candle] = []
                for i, ts in enumerate(timestamps):
                    try:
                        if closes[i] is None:
                            continue
                        candles.append(
                            Candle(
                                symbol=symbol,
                                date=time.strftime("%Y-%m-%d", time.gmtime(ts)),
                                open=float(opens[i]),
                                high=float(highs[i]),
                                low=float(lows[i]),
                                close=float(closes[i]),
                                volume=float(volumes[i]) if i < len(volumes) and volumes[i] is not None else None,
                                source=self.source,
                            )
                        )
                    except (IndexError, TypeError, ValueError):
                        continue
                if not candles:
                    raise QuoteError("NO_DATA", f"no parseable candle data for {symbol}")
                candles.sort(key=lambda c: c.date)
                if lookback > 0:
                    candles = candles[-(lookback + 1):]
                return CandleSeries(symbol=symbol, candles=candles, source=self.source)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"Yahoo Finance candle request failed: {last_exc}")


# ----------------------------------------------------------------------
# Service (best-effort batch, mirrors StockService)
# ----------------------------------------------------------------------
class CandleService:
    """Transport-independent price-history logic over a CandleProvider.

    Best-effort batch like StockService.get_quotes: a symbol that errors is
    omitted, and `get_histories` fails as a whole ONLY if EVERY symbol errors
    — so the rotation detector still gets partial history during a partial
    outage (graceful degradation).
    """

    def __init__(self, provider: CandleProvider | None = None, lookback: int = 60) -> None:
        self.provider = provider or FixtureCandleProvider()
        self.lookback = lookback

    @classmethod
    def from_env(cls, mode: str = "fixture", lookback: int = 60) -> "CandleService":
        if mode == "live":
            return cls(provider=YahooCandleProvider(), lookback=lookback)
        return cls(provider=FixtureCandleProvider(fixture_path=CANDLES_FIXTURE_PATH), lookback=lookback)

    def get_series(self, symbol: str, lookback: int | None = None) -> CandleSeries:
        """One symbol's history. Raises QuoteError (structured) on failure."""
        return self.provider.get_series(symbol, lookback if lookback is not None else self.lookback)

    def get_histories(
        self, symbols: list[str], lookback: int | None = None
    ) -> dict[str, CandleSeries]:
        """Best-effort {symbol: CandleSeries}. Omits symbols that error.

        Raises only when EVERY requested symbol fails (total outage). An empty
        `symbols` list returns `{}` cleanly — no divide-by-zero, no raise.
        """
        out: dict[str, CandleSeries] = {}
        errors = 0
        for sym in symbols:
            try:
                out[sym.strip().upper()] = self.get_series(sym, lookback)
            except QuoteError:
                errors += 1
        if symbols and errors == len(symbols):
            raise QuoteError("NO_DATA", f"all {len(symbols)} symbols failed")
        return out


def from_env(mode: str = "fixture", lookback: int = 60) -> CandleService:
    """Module-level mirror of CandleService.from_env."""
    return CandleService.from_env(mode=mode, lookback=lookback)
