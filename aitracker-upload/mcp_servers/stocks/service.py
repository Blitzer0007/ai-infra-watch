from __future__ import annotations

import json
import os
import time
from pathlib import Path

from .providers import FinnhubProvider, FixtureProvider, QuoteError, QuoteProvider, _utc_now_iso
from .schemas import Quote, QuoteBatch, ServerHealth

CONFIG_PATH = Path(__file__).resolve().parents[2] / "data" / "stock_watchlist.json"
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
        self._last_poll_as_of = q.as_of
        return q

    def get_quotes(self, symbols: list[str]) -> QuoteBatch:
        """Best-effort batch; fail only when every requested symbol fails."""
        quotes: list[Quote] = []
        errors = 0
        for sym in symbols:
            try:
                quotes.append(self.get_quote(sym))
            except QuoteError:
                errors += 1
        if symbols and errors == len(symbols):
            raise QuoteError("NO_DATA", f"all {len(symbols)} symbols failed")
        return QuoteBatch(quotes=quotes, as_of=self._clock(), source=self.provider.source)

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
