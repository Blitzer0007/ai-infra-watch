"""Tests for the stocks live Feed (poller with dedup + backoff).

We don't spin the thread; we drive `_poll_once` directly with a fake
service so the dedup + change-detection + error-emission logic is
tested deterministically and offline.
"""
from __future__ import annotations

from mcp_servers.stocks.feed import Feed
from mcp_servers.stocks.providers import QuoteError
from mcp_servers.stocks.schemas import Quote, QuoteBatch


class _FakeService:
    """Returns a scripted sequence of snapshots (or raises)."""

    def __init__(self, snapshots):
        self._snapshots = list(snapshots)
        self._i = 0

    def get_snapshot(self):
        item = self._snapshots[min(self._i, len(self._snapshots) - 1)]
        self._i += 1
        if isinstance(item, Exception):
            raise item
        return item


def _batch(price: float, as_of: str) -> QuoteBatch:
    return QuoteBatch(
        quotes=[Quote(symbol="NVDA", price=price, as_of=as_of)],
        as_of=as_of,
        source="fixture",
    )


def _collector():
    msgs = []
    return msgs, msgs.append


def test_feed_emits_quote_on_first_poll():
    svc = _FakeService([_batch(100.0, "t0")])
    msgs, emit = _collector()
    Feed(service=svc, emit=emit)._poll_once()
    kinds = [m.kind for m in msgs]
    assert "quote" in kinds
    quote_msg = next(m for m in msgs if m.kind == "quote")
    assert quote_msg.symbol == "NVDA"


def test_feed_dedupes_unchanged_quote():
    """Identical consecutive quotes emit a quote once, then 'no change'."""
    svc = _FakeService([_batch(100.0, "t0"), _batch(100.0, "t0")])
    msgs, emit = _collector()
    feed = Feed(service=svc, emit=emit)
    feed._poll_once()
    feed._poll_once()
    quotes = [m for m in msgs if m.kind == "quote"]
    assert len(quotes) == 1, "unchanged quote should not re-emit"
    assert any(m.kind == "status" and m.message == "no change" for m in msgs)


def test_feed_reemits_on_price_change():
    svc = _FakeService([_batch(100.0, "t0"), _batch(101.0, "t1")])
    msgs, emit = _collector()
    feed = Feed(service=svc, emit=emit)
    feed._poll_once()
    feed._poll_once()
    quotes = [m for m in msgs if m.kind == "quote"]
    assert len(quotes) == 2, "a price change must re-emit"


def test_feed_emits_error_and_counts_failures():
    svc = _FakeService([QuoteError("RATE_LIMIT", "boom")])
    msgs, emit = _collector()
    feed = Feed(service=svc, emit=emit)
    feed._poll_once()
    errs = [m for m in msgs if m.kind == "error"]
    assert errs and errs[0].code == "RATE_LIMIT"
    assert feed._consecutive_failures == 1
