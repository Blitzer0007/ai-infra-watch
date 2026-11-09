"""Quote truth/transport contracts. All providers and clocks are fictional."""
from datetime import datetime
import json

import httpx
import pytest
from pydantic import ValidationError

from app.agents._convert import quotes_to_stock_data
from app.agents.mcp_pipeline import _market_via_mcp
from mcp_servers.stocks.feed import Feed
from mcp_servers.stocks.providers import FinnhubProvider, FixtureProvider, QuoteError
from mcp_servers.stocks.schemas import Quote, QuoteBatch
from mcp_servers.stocks.service import StockService

NOW = "2026-08-03T20:05:00Z"
OBSERVED = "2026-08-03T20:00:00Z"
STAMP = datetime.fromisoformat(OBSERVED.replace("Z", "+00:00")).timestamp()


def provider():
    return FinnhubProvider(api_key="fictional", clock=lambda: NOW, max_retries=0)


def test_provider_time_is_separate_from_retrieval_and_missing_metadata():
    q = provider()._normalize("NVDA", {"c": 100, "t": STAMP})
    assert q.as_of == OBSERVED and q.retrieved_at == NOW
    assert q.currency is None and q.is_market_session_open is None
    assert q.change is q.change_pct is q.prev_close is q.high is q.low is q.open is None
    assert q.simulated is False and q.adjusted_basis == "raw"


@pytest.mark.parametrize("stamp", [None, 0, -1, True, "123", float("nan"), float("inf"), 1e30, STAMP + 86400])
def test_invalid_missing_or_future_provider_time_never_becomes_now(stamp):
    q = provider()._normalize("NVDA", {"c": 100, "t": stamp})
    assert q.as_of is None and q.retrieved_at == NOW


@pytest.mark.parametrize("price", [None, 0, -1, True, "100", float("nan"), float("inf")])
def test_invalid_current_prices_are_structured_no_data(price):
    with pytest.raises(QuoteError) as exc:
        provider()._normalize("NVDA", {"c": price, "pc": 100})
    assert exc.value.code == "NO_DATA"


def test_derived_moves_need_previous_close_and_reported_zero_remains_zero():
    p = provider()
    q = p._normalize("NVDA", {"c": 110, "pc": 100})
    assert q.change == 10 and q.change_pct == pytest.approx(10)
    assert p._normalize("NVDA", {"c": 110, "d": 0, "dp": 0}).change_pct == 0
    assert p._normalize("NVDA", {"c": 110, "d": 10}).change_pct is None
    bad = p._normalize("NVDA", {"c": 110, "h": 100, "l": 120, "v": -1, "dp": True})
    assert bad.high is bad.low is bad.volume is bad.change_pct is None


def test_fixture_metadata_is_explicit_and_cannot_impersonate_live(tmp_path):
    path = tmp_path / "quotes.json"
    path.write_text(json.dumps({"A": {"price": 100, "source": "finnhub", "simulated": False},
                                "B": {"price": 100, "as_of": OBSERVED, "currency": "KRW"}}))
    p = FixtureProvider(path, clock=lambda: NOW)
    a, b = p.get_quote("A"), p.get_quote("B")
    assert a.as_of is None and a.retrieved_at == NOW
    assert a.source == "fixture" and a.simulated and a.currency is None
    assert b.as_of == OBSERVED and b.currency == "KRW"


def test_wire_schema_rejects_nonfinite_coercions_and_undated_timestamps():
    for fields in [{"price": True}, {"price": float("inf")}, {"price": 100, "change_pct": "0"},
                   {"price": 100, "as_of": "2026-08-03"}, {"price": 100, "as_of": "2026-08-03T20:00:00"}]:
        with pytest.raises(ValidationError):
            Quote(symbol="A", **fields)


class Quotes:
    source = "finnhub"

    def __init__(self, rows):
        self.rows = rows

    def get_quote(self, symbol):
        if symbol not in self.rows:
            raise QuoteError("NO_DATA", "fictional upstream detail omitted")
        return self.rows[symbol]


def test_batch_time_requires_complete_coverage_and_is_the_oldest_observation():
    a = Quote(symbol="A", price=100, as_of=OBSERVED, retrieved_at=NOW)
    b = Quote(symbol="B", price=100, as_of="2026-08-03T19:59:00Z", retrieved_at=NOW)
    svc = StockService(provider=Quotes({"A": a, "B": b}), clock=lambda: NOW)
    batch = svc.get_quotes(["a", "A", "B"])
    assert batch.as_of == b.as_of and batch.retrieved_at == NOW
    assert batch.requested_symbols == ["A", "B"] and batch.errors == {}
    partial = svc.get_quotes(["A", "MISSING"])
    assert partial.as_of is None and partial.missing_symbols == ["MISSING"]
    assert partial.errors == {"MISSING": "NO_DATA"}
    a.as_of = None
    assert svc.get_quotes(["A", "B"]).as_of is None


def test_feed_hash_excludes_retrieval_but_preserves_quality_changes():
    q = Quote(symbol="A", price=100, retrieved_at=NOW)
    h = Feed._hash(q)
    q.retrieved_at = OBSERVED
    assert Feed._hash(q) == h
    q.currency = "KRW"
    assert Feed._hash(q) != h


def test_feed_message_has_event_time_without_fabricating_observation(monkeypatch):
    monkeypatch.setattr("mcp_servers.stocks.feed._utc_now_iso", lambda: NOW)
    svc = StockService(provider=Quotes({"A": Quote(symbol="A", price=100)}), watchlist=["A"], clock=lambda: NOW)
    messages = []
    Feed(service=svc, emit=messages.append)._poll_once()
    assert messages[0].as_of == NOW and messages[0].quote.as_of is None


def test_backoff_uses_actual_failures_and_recovers_without_sleeping(monkeypatch):
    class Snapshots:
        count = 0
        def get_snapshot(self):
            self.count += 1
            if self.count < 3:
                raise QuoteError("RATE_LIMIT", "fictional")
            return QuoteBatch()

    sleeps = []
    feed = Feed(service=Snapshots(), emit=lambda _: None, interval=2, max_backoff=6)
    def sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 3:
            feed._stop.set()
    monkeypatch.setattr("mcp_servers.stocks.feed.time.sleep", sleep)
    feed._run()
    assert sleeps == [4, 6, 2]


def test_synthesis_rows_preserve_provenance_and_withhold_unknown_moves_or_live_time():
    p = provider()
    rows = quotes_to_stock_data(QuoteBatch(quotes=[
        p._normalize("A", {"c": 100, "dp": 0, "t": STAMP}),
        p._normalize("B", {"c": 100, "t": STAMP}),
        p._normalize("C", {"c": 100, "dp": 1}),
    ]))
    assert len(rows) == 1 and rows[0]["change_pct"] == 0
    assert rows[0]["as_of"] == OBSERVED and rows[0]["currency"] is None
    assert rows[0]["source"] == "finnhub" and rows[0]["simulated"] is False
    assert "retrieved_at" not in rows[0]


def test_mcp_summary_cannot_invent_flat_moves_dollars_or_observation_time():
    class Toolbox:
        def call(self, _):
            return {"quotes": [{"symbol": "A", "price": 100},
                               {"symbol": "B", "price": 110, "change_pct": 0, "as_of": OBSERVED, "currency": "KRW"}]}
    result, _, _ = _market_via_mcp(Toolbox())
    assert "$" not in result.synthesis.summary
    assert "currency unknown" in result.synthesis.summary and "move unavailable" in result.synthesis.summary
    assert "observation time unknown" in result.synthesis.summary
    assert [i.ticker for i in result.synthesis.insights] == ["B"]
    assert result.synthesis.insights[0].move_pct == 0


def test_transport_failure_redacts_credential_url(monkeypatch):
    class Client:
        def __init__(self, **_): pass
        def __enter__(self): return self
        def __exit__(self, *_): return False
        def get(self, *_args, **_kwargs):
            raise httpx.ConnectError("https://example.test/?token=fictional-private-value")
    monkeypatch.setattr(httpx, "Client", Client)
    with pytest.raises(QuoteError) as exc:
        provider().get_quote("A")
    assert exc.value.code == "HTTP_ERROR" and "token=" not in exc.value.message


@pytest.mark.parametrize("payload", [None, [], {"quotes": None}, {"quotes": []}, {"quotes": [{"symbol": "A", "price": "100"}]}])
def test_malformed_or_empty_mcp_quote_results_are_unavailable(payload):
    class Toolbox:
        def call(self, _):
            return payload
    result, _, error = _market_via_mcp(Toolbox())
    assert result is None and error.startswith("stocks_failed:")
