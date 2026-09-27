"""Provider tests: FixtureProvider (offline) + FinnhubProvider (mocked HTTP).

FinnhubProvider is tested WITHOUT network by injecting a fake httpx
transport via monkeypatch — we assert normalization (Finnhub c/h/l/o/pc
-> Quote), the all-zero -> NO_DATA quirk, missing-key handling, and
that a 429 maps to RATE_LIMIT after retries are exhausted.
"""
from __future__ import annotations

import httpx
import pytest

from mcp_servers.stocks.providers import FinnhubProvider, FixtureProvider, QuoteError
from mcp_servers.stocks.service import FIXTURE_PATH


def _clock() -> str:
    return "2026-08-03T00:00:00Z"


# ---- FixtureProvider ---------------------------------------------------
def test_fixture_provider_reads_committed_quotes():
    p = FixtureProvider(FIXTURE_PATH, clock=_clock)
    q = p.get_quote("MSFT")
    assert q.symbol == "MSFT"
    assert q.source == "fixture"
    assert q.price == 445.0


def test_fixture_provider_missing_symbol():
    p = FixtureProvider(FIXTURE_PATH, clock=_clock)
    with pytest.raises(QuoteError) as exc:
        p.get_quote("NOPE")
    assert exc.value.code == "NO_DATA"


def test_fixture_provider_missing_file():
    p = FixtureProvider("does/not/exist.json", clock=_clock)
    with pytest.raises(QuoteError) as exc:
        p.get_quote("NVDA")
    assert exc.value.code == "NO_DATA"


# ---- FinnhubProvider (mocked transport) --------------------------------
def _mock_finnhub(monkeypatch, payload: dict | None = None, status: int = 200):
    """Patch httpx.Client to return a canned Finnhub /quote response."""

    class _Resp:
        status_code = status

        def json(self):
            return payload or {}

    class _Client:
        def __init__(self, *a, **k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def get(self, url, params=None):
            return _Resp()

    monkeypatch.setattr(httpx, "Client", _Client)


def test_finnhub_normalizes_quote(monkeypatch):
    _mock_finnhub(monkeypatch, {"c": 182.4, "h": 184.0, "l": 178.1, "o": 179.0, "pc": 176.74, "d": 5.66, "dp": 3.2})
    p = FinnhubProvider(api_key="test-key", clock=_clock)
    q = p.get_quote("NVDA")
    assert q.symbol == "NVDA"
    assert q.price == 182.4
    assert q.change_pct == 3.2
    assert q.prev_close == 176.74
    assert q.source == "finnhub"
    assert q.as_of == "2026-08-03T00:00:00Z"


def test_finnhub_derives_change_when_absent(monkeypatch):
    """Finnhub sometimes omits d/dp — derive from c and pc."""
    _mock_finnhub(monkeypatch, {"c": 110.0, "h": 111.0, "l": 108.0, "o": 109.0, "pc": 100.0})
    p = FinnhubProvider(api_key="k", clock=_clock)
    q = p.get_quote("TEST")
    assert q.change == pytest.approx(10.0)
    assert q.change_pct == pytest.approx(10.0)


def test_finnhub_all_zero_is_no_data(monkeypatch):
    _mock_finnhub(monkeypatch, {"c": 0, "h": 0, "l": 0, "o": 0, "pc": 0})
    p = FinnhubProvider(api_key="k", clock=_clock)
    with pytest.raises(QuoteError) as exc:
        p.get_quote("FAKE")
    assert exc.value.code == "NO_DATA"


def test_finnhub_missing_key():
    p = FinnhubProvider(api_key="", clock=_clock)
    with pytest.raises(QuoteError) as exc:
        p.get_quote("NVDA")
    assert exc.value.code == "NO_KEY"


def test_finnhub_rate_limit_maps_to_code(monkeypatch):
    _mock_finnhub(monkeypatch, {}, status=429)
    # No real backoff sleeping in the test.
    monkeypatch.setattr("mcp_servers.stocks.providers.time.sleep", lambda *_: None)
    p = FinnhubProvider(api_key="k", clock=_clock, max_retries=1, base_delay=0)
    with pytest.raises(QuoteError) as exc:
        p.get_quote("NVDA")
    assert exc.value.code == "RATE_LIMIT"
