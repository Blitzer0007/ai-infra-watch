from __future__ import annotations

import json
import os
import time
from datetime import datetime
from pathlib import Path

from .providers import FinnhubProvider, FixtureProvider, QuoteError, QuoteProvider, _utc_now_iso
from .schemas import Quote, QuoteBatch, ServerHealth, observation_time

CONFIG_PATH = Path(__file__).resolve().parents[3] / "data" / "stock_watchlist.json"
FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "quotes.json"


def _load_configured_watchlist() -> list[str]:
    """Load the default monitored universe from the JSON configuration.

    AI_INFRA_WATCH_STOCKS_WATCHLIST can override it with either a JSON array
    or a comma-separated list for deployment-specific universes.
    """
    raw = os.getenv("AI_INFRA_WATCH_STOCKS_WATCHLIST", "").strip()
    if raw:
        try:
            values = json.loads(raw)
        except json.JSONDecodeError:
            values = [item.strip() for item in raw.split(",")]
        if not isinstance(values, list):
            raise ValueError(
                "AI_INFRA_WATCH_STOCKS_WATCHLIST must be a JSON array or comma-separated list"
            )
        symbols = [str(item).strip().upper() for item in values if str(item).strip()]
        if symbols:
            return list(dict.fromkeys(symbols))

    try:
        payload = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        rows = payload.get("watchlist", [])
        symbols = [
            str(row.get("symbol", "")).strip().upper()
            for row in rows
            if isinstance(row, dict) and row.get("symbol")
        ]
        if symbols:
            return list(dict.fromkeys(symbols))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass

    return ["NVDA", "NBIS", "DGXX", "MSFT", "META", "AVGO"]


DEFAULT_WATCHLIST = _load_configured_watchlist()


class StockService:
    def __init__(
        self,
        provider: QuoteProvider | None = None,
        watchlist: list[str] | None = None,
        clock=_utc_now_iso,
    ) -> None:
        self.provider = provider or FixtureProvider(FIXTURE_PATH, clock=clock)
        selected = DEFAULT_WATCHLIST if watchlist is None else watchlist
        self.watchlist = [s.strip().upper() for s in selected if s.strip()]
        self._clock = clock
        self._consecutive_errors = 0
        self._last_poll_as_of: str | None = None

    @classmethod
    def from_env(
        cls,
        mode: str = "fixture",
        watchlist: list[str] | None = None,
    ) -> "StockService":
        """Build a service in fixture or live mode."""
        if mode == "live":
            return cls(provider=FinnhubProvider(), watchlist=watchlist)
        return cls(provider=FixtureProvider(FIXTURE_PATH), watchlist=watchlist)

    def get_quote(self, symbol: str) -> Quote:
        """Return one quote. Errors remain structured."""
        try:
            q = self.provider.get_quote(symbol)
        except QuoteError:
            self._consecutive_errors += 1
            raise
        self._consecutive_errors = 0
        self._last_poll_as_of = q.retrieved_at
        return q

    def get_quotes(self, symbols: list[str]) -> QuoteBatch:
        """Best-effort batch; fail only when every requested symbol fails."""
        requested = list(dict.fromkeys(sym.strip().upper() for sym in symbols if sym.strip()))
        quotes: list[Quote] = []
        errors: dict[str, str] = {}
        for sym in requested:
            try:
                quotes.append(self.get_quote(sym))
            except QuoteError as exc:
                errors[sym] = exc.code if exc.code in {"NO_KEY", "NO_DATA", "HTTP_ERROR", "RATE_LIMIT"} else "PROVIDER_ERROR"
        if requested and len(errors) == len(requested):
            raise QuoteError("NO_DATA", f"all {len(requested)} symbols failed")
        retrieved_at = self._clock()
        observed = [observation_time(q.as_of) for q in quotes]
        common_time = None
        if quotes and not errors and all(observed):
            times = [datetime.fromisoformat(value.replace("Z", "+00:00")) for value in observed]
            retrieval = observation_time(retrieved_at)
            if retrieval and all((value - datetime.fromisoformat(retrieval.replace("Z", "+00:00"))).total_seconds() <= 120 for value in times):
                common_time = min(times).isoformat().replace("+00:00", "Z")
        return QuoteBatch(quotes=quotes, as_of=common_time, retrieved_at=retrieved_at,
                          source=self.provider.source, requested_symbols=requested,
                          missing_symbols=list(errors), errors=errors)

    def get_snapshot(self) -> QuoteBatch:
        """Return the current quote snapshot for the configured universe."""
        return self.get_quotes(self.watchlist)

    def list_watchlist(self) -> list[str]:
        return list(self.watchlist)

    def health(self) -> ServerHealth:
        mode = "live" if self.provider.source == "finnhub" else "fixture"
        return ServerHealth(
            mode=mode,
            ok=self._consecutive_errors == 0,
            watchlist=self.watchlist,
            last_poll_as_of=self._last_poll_as_of,
            consecutive_errors=self._consecutive_errors,
            detail="" if self._consecutive_errors == 0 else "provider errors observed",
        )


def from_env(mode: str = "fixture", watchlist: list[str] | None = None) -> StockService:
    return StockService.from_env(mode=mode, watchlist=watchlist)
