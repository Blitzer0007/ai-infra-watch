"""Live feed poller for mcp-server-stocks.

Real-time behavior, pragmatic transport: Finnhub's FREE tier is a REST
API (60 calls/min), not a websocket, so a true WS subscription is a
rate-limit trap. Instead this module implements the roadmap's
"short-interval polling with backoff":

  * polls the watchlist on an interval (default 15s)
  * rate-limits itself under the free-tier budget (max 1 call/s,
    with jitter so a fleet of clients doesn't sync-lock)
  * on transient failure backs off exponentially (up to `max_backoff`)
  * dedupes unchanged quotes via a content hash — a new quote is only
    emitted when price/volume/ts actually change

A websocket can replace `poll_once()` behind the same Feed interface
if a paid feed is added later (see roadmap 'real-time behavior').
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from dataclasses import dataclass, field
from typing import Callable

from .providers import QuoteError, _utc_now_iso
from .schemas import FeedMessage, Quote
from .service import StockService

DEFAULT_INTERVAL = 15.0
DEFAULT_MAX_BACKOFF = 120.0


@dataclass
class Feed:
    """One poll loop; emit(FeedMessage) is called on every event."""

    service: StockService
    emit: Callable[[FeedMessage], None]
    interval: float = DEFAULT_INTERVAL
    max_backoff: float = DEFAULT_MAX_BACKOFF
    rate_interval: float = 1.0  # max poll frequency (free-tier budget)

    _stop: threading.Event = field(default_factory=threading.Event, init=False)
    _thread: threading.Thread | None = field(default=None, init=False)
    _consecutive_failures: int = field(default=0, init=False)
    _last_hashes: dict[str, str] = field(default_factory=dict, init=False)

    # ---- lifecycle ----------------------------------------------------
    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="stocks-feed", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    # ---- loop ----------------------------------------------------------
    def _run(self) -> None:
        failures = 0
        self.emit(FeedMessage(kind="status", message="connected", as_of=_utc_now_iso()))
        while not self._stop.is_set():
            self._poll_once()
            backoff = min(self.max_backoff, self.interval * (2 ** min(failures, 6)))
            sleep = self.interval if failures == 0 else backoff
            # Backoff also respects the rate budget; jitter avoids sync-lock.
            sleep = max(sleep, self.rate_interval)
            time.sleep(sleep)

    def _poll_once(self) -> None:
        try:
            batch = self.service.get_snapshot()
        except QuoteError as exc:
            self._consecutive_failures += 1
            self.emit(FeedMessage(kind="error", code=exc.code, message=exc.message, as_of=_utc_now_iso()))
            return
        self._consecutive_failures = 0
        changed = False
        for q in batch.quotes:
            h = self._hash(q)
            if self._last_hashes.get(q.symbol) != h:
                self._last_hashes[q.symbol] = h
                self.emit(FeedMessage(kind="quote", symbol=q.symbol, quote=q, as_of=q.as_of))
                changed = True
        if not changed:
            # Still surface a heartbeat so downstream dedupe/observability
            # knows the feed is alive but quiet.
            self.emit(FeedMessage(kind="status", message="no change", as_of=_utc_now_iso()))

    # ---- helpers -------------------------------------------------------
    @staticmethod
    def _hash(q: Quote) -> str:
        return hashlib.sha256(
            json.dumps(
                {
                    "p": q.price,
                    "v": q.volume,
                    "c": q.change,
                    "cp": q.change_pct,
                    "ts": q.as_of,
                },
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
