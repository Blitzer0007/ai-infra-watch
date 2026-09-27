"""Quote providers for mcp-server-stocks.

Two implementations behind one Protocol:

  * FixtureProvider — reads canned quotes from a JSON file. Fully
    offline and deterministic; the default for tests and CI. Lets the
    Market Agent and the whole pipeline run with zero network.
  * FinnhubProvider — real quotes from Finnhub's REST API, with the
    same retry/backoff discipline as app/llm/client.py. Free tier is
    60 calls/min, so the poller (feed.py) rate-limits on top of this.

Both return the schemas in schemas.py, so callers never branch on
which provider is active — only the `source` field differs.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Protocol

import httpx

from .schemas import Quote


class QuoteError(RuntimeError):
    """A structured provider error, mirroring the frontend's error codes
    (NO_KEY / RATE_LIMIT / NO_DATA / HTTP_ERROR) so behavior is
    consistent across the JS dashboard and the Python backend."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _utc_now_iso() -> str:
    """ISO-8601 UTC to seconds. Kept as a function so tests can monkeypatch."""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class QuoteProvider(Protocol):
    def get_quote(self, symbol: str) -> Quote: ...
    @property
    def source(self) -> str: ...


# ----------------------------------------------------------------------
# Fixture provider (offline, deterministic)
# ----------------------------------------------------------------------
class FixtureProvider:
    """Serve quotes from a committed JSON fixture.

    Fixture shape (mcp_servers/stocks/fixtures/quotes.json):
        {
          "NVDA": {"price": 182.4, "change": 5.7, "change_pct": 3.2,
                   "high": 184.0, "low": 178.1, "open": 179.0,
                   "prev_close": 176.7, "volume": 41000000},
          ...
        }
    Missing fields default per the Quote schema. `as_of` is stamped at
    read time (overridable) so downstream timestamp guardrails have a
    value without the fixture needing to hard-code one.
    """

    source = "fixture"

    def __init__(self, fixture_path: Path | str, clock=_utc_now_iso) -> None:
        self.fixture_path = Path(fixture_path)
        self._clock = clock
        self._data: dict[str, dict] | None = None

    def _load(self) -> dict[str, dict]:
        if self._data is None:
            try:
                self._data = json.loads(self.fixture_path.read_text(encoding="utf-8"))
            except FileNotFoundError as exc:
                raise QuoteError("NO_DATA", f"fixture not found: {self.fixture_path}") from exc
            except json.JSONDecodeError as exc:
                raise QuoteError("NO_DATA", f"bad fixture JSON: {exc}") from exc
        return self._data

    def get_quote(self, symbol: str) -> Quote:
        symbol = symbol.strip().upper()
        row = self._load().get(symbol)
        if row is None:
            raise QuoteError("NO_DATA", f"no fixture quote for {symbol}")
        return Quote(symbol=symbol, as_of=self._clock(), source=self.source, **row)


# ----------------------------------------------------------------------
# Finnhub provider (live)
# ----------------------------------------------------------------------
def _http_retryable(status: int) -> bool:
    return status in (408, 409, 429) or 500 <= status <= 599


class FinnhubProvider:
    """Live quotes from Finnhub /quote. Normalizes to the Quote schema.

    Mirrors js/core.js fetchQuote(): Finnhub returns c/h/l/o/pc, and an
    all-zero payload for an invalid symbol (not an HTTP error), which we
    map to NO_DATA. Retries transient HTTP errors with exponential
    backoff, same policy as the LLM client.
    """

    source = "finnhub"
    BASE = "https://finnhub.io/api/v1"

    def __init__(
        self,
        api_key: str | None = None,
        clock=_utc_now_iso,
        max_retries: int = 4,
        base_delay: float = 1.0,
        timeout: float = 15.0,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("FINNHUB_API_KEY", "")
        self._clock = clock
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.timeout = timeout

    def get_quote(self, symbol: str) -> Quote:
        if not self.api_key:
            raise QuoteError("NO_KEY", "FINNHUB_API_KEY is not set")
        symbol = symbol.strip().upper()
        url = f"{self.BASE}/quote"
        params = {"symbol": symbol, "token": self.api_key}
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
                data = resp.json()
                return self._normalize(symbol, data)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"Finnhub request failed: {last_exc}")

    def _normalize(self, symbol: str, data: dict) -> Quote:
        c, h, l, o, pc = (data.get(k, 0) for k in ("c", "h", "l", "o", "pc"))
        # Finnhub sends all-zero for invalid symbols instead of an error.
        if c == 0 and h == 0 and l == 0 and pc == 0:
            raise QuoteError("NO_DATA", f"no data for symbol {symbol}")
        change = data.get("d")
        change_pct = data.get("dp")
        if change is None:
            change = c - pc
        if change_pct is None:
            change_pct = (change / pc * 100.0) if pc else 0.0
        return Quote(
            symbol=symbol,
            price=float(c),
            change=float(change),
            change_pct=float(change_pct),
            high=float(h),
            low=float(l),
            open=float(o),
            prev_close=float(pc),
            volume=data.get("v"),
            as_of=self._clock(),
            source=self.source,
        )
