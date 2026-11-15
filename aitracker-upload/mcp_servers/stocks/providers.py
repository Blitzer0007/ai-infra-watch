"""Quote providers for mcp-server-stocks.

Two implementations behind one Protocol:

  * FixtureProvider — reads canned quotes from a JSON file. Fully
    offline and deterministic; the default for tests and CI. Lets the
    Market Agent and the whole pipeline run with zero network.
  * FinnhubProvider — real quotes from Finnhub's REST API, with the
    bounded retry/backoff discipline. Account quotas and exchange
    entitlements require separate verification. Live requests share process-level admission.

Both return the schemas in schemas.py, so callers never branch on
which provider is active — only the `source` field differs.
"""
from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

import httpx
from pydantic import ValidationError

from mcp_servers.provider_budget import budgeted_json
from .schemas import Quote


def _finite(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        return float(value) if math.isfinite(value) else None
    except OverflowError:
        return None


def _positive(value) -> float | None:
    value = _finite(value)
    return value if value is not None and value > 0 else None


def _provider_time(seconds, retrieved_at: str) -> str | None:
    seconds = _positive(seconds)
    if seconds is None:
        return None
    try:
        instant = datetime.fromtimestamp(seconds, timezone.utc)
        retrieved = datetime.fromisoformat(retrieved_at.replace("Z", "+00:00"))
        if retrieved.tzinfo is None or (instant - retrieved).total_seconds() > 120:
            return None
        return instant.isoformat().replace("+00:00", "Z")
    except (ValueError, OverflowError, OSError):
        return None


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
    Missing fields stay unknown. Only a fixture-declared `as_of` is an
    observation time; the injected clock supplies `retrieved_at` separately.
    Fixture output is always explicitly simulated, never a live observation.
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
        data = self._load()
        row = data.get(symbol) if isinstance(data, dict) else None
        if not isinstance(row, dict):
            raise QuoteError("NO_DATA", f"no fixture quote for {symbol}")
        fields = {key: row[key] for key in (
            "price", "change", "change_pct", "high", "low", "open",
            "prev_close", "volume", "currency", "as_of",
        ) if key in row}
        try:
            return Quote(symbol=symbol, retrieved_at=self._clock(), source=self.source,
                         simulated=True, adjusted_basis="raw", **fields)
        except ValidationError as exc:
            raise QuoteError("NO_DATA", f"invalid fixture quote for {symbol}") from exc


# ----------------------------------------------------------------------
# Finnhub provider (live)
# ----------------------------------------------------------------------
def _http_retryable(status: int) -> bool:
    return status in (408, 409, 429) or 500 <= status <= 599


class FinnhubProvider:
    """Live quotes from Finnhub /quote. Normalizes to the Quote schema.

    Mirrors js/core.js fetchQuote(): Finnhub returns c/h/l/o/pc, and an
    all-zero payload for an invalid symbol (not an HTTP error), which we
    map to NO_DATA. Transient retries share process admission and an
    operation deadline; 429 starts a shared cooldown without immediate retry.
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
        data = budgeted_json("finnhub", f"{self.BASE}/quote", error_type=QuoteError,
            params={"symbol": symbol, "token": self.api_key}, timeout=self.timeout,
            max_retries=self.max_retries, base_delay=self.base_delay)
        return self._normalize(symbol, data)

    def _normalize(self, symbol: str, data: dict) -> Quote:
        if not isinstance(data, dict) or _positive(data.get("c")) is None:
            raise QuoteError("NO_DATA", f"no data for symbol {symbol}")
        c = _positive(data["c"])
        pc = _positive(data.get("pc"))
        high, low = _positive(data.get("h")), _positive(data.get("l"))
        if high is not None and low is not None and high < low:
            high = low = None
        change, change_pct = _finite(data.get("d")), _finite(data.get("dp"))
        if change is None and pc is not None:
            change = _finite(c - pc)
        if change_pct is None and pc is not None:
            change_pct = _finite((c / pc - 1) * 100)
        volume = _finite(data.get("v"))
        retrieved_at = self._clock()
        return Quote(
            symbol=symbol,
            price=c,
            change=change,
            change_pct=change_pct,
            high=high,
            low=low,
            open=_positive(data.get("o")),
            prev_close=pc,
            volume=volume if volume is not None and volume >= 0 else None,
            currency=None,  # Finnhub /quote does not report currency/session.
            as_of=_provider_time(data.get("t"), retrieved_at),
            retrieved_at=retrieved_at,
            adjusted_basis="raw",
            source=self.source,
        )
