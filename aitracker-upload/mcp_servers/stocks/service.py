"""StockService — transport-independent domain logic for the stocks server.

This is the layer the unit tests exercise directly (no MCP transport,
no network). The MCP server (server.py) is a thin decorator shell that
delegates every tool to a StockService method, so:

  * tests are hermetic and fast (FixtureProvider + StockService)
  * the MCP tool list and the tested API can't drift (contract test)

The service also tracks health (consecutive errors, last poll) for the
observability layer's server-status tile.
"""
from __future__ import annotations

import time
from pathlib import Path

from .providers import FinnhubProvider, FixtureProvider, QuoteError, QuoteProvider, _utc_now_iso
from .schemas import Quote, QuoteBatch, ServerHealth

DEFAULT_WATCHLIST = ["NVDA", "NBIS", "DGXX", "MSFT", "META", "AVGO"]
FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "quotes.json"


class StockService:
    def __init__(
        self,
        provider: QuoteProvider | None = None,
        watchlist: list[str] | None = None,
        clock=_utc_now_iso,
    ) -> None:
        self.provider = provider or FixtureProvider(FIXTURE_PATH, clock=clock)
        self.watchlist = [s.strip().upper() for s in (watchlist or DEFAULT_WATCHLIST)]
        self._clock = clock
        self._consecutive_errors = 0
        self._last_poll_as_of: str | None = None

    # ---- construction helpers ------------------------------------------
    @classmethod
    def from_env(cls, mode: str = "fixture", watchlist: list[str] | None = None) -> "StockService":
        """Build a service in 'fixture' (offline) or 'live' (Finnhub) mode."""
        if mode == "live":
            return cls(provider=FinnhubProvider(), watchlist=watchlist)
        return cls(provider=FixtureProvider(FIXTURE_PATH), watchlist=watchlist)

    # ---- core operations -----------------------------------------------
    def get_quote(self, symbol: str) -> Quote:
        """One quote. Raises QuoteError (structured code) on failure."""
        try:
            q = self.provider.get_quote(symbol)
        except QuoteError:
            self._consecutive_errors += 1
            raise
        self._consecutive_errors = 0
        self._last_poll_as_of = q.as_of
        return q

    def get_quotes(self, symbols: list[str]) -> QuoteBatch:
        """Best-effort batch: symbols that error are omitted, not fatal.

        A batch fails as a whole only if EVERY symbol errors (so the
        caller/agent still gets partial data during a partial outage —
        a graceful-degradation requirement).
        """
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
        """Quotes for the full watchlist."""
        return self.get_quotes(self.watchlist)

    def list_watchlist(self) -> list[str]:
        return list(self.watchlist)

    # ---- observability -------------------------------------------------
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
    """Module-level convenience mirror of StockService.from_env, so callers
    can do `from .service import from_env`."""
    return StockService.from_env(mode=mode, watchlist=watchlist)
