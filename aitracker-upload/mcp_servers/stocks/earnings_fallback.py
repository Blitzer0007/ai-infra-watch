import os
import time
from datetime import datetime, timedelta, timezone
import httpx
from .providers import QuoteError, _http_retryable
from .schemas import EarningsEvent, EarningsHistory

class FmpEarningsProvider:
    source = "fmp"
    BASE = "https://financialmodelingprep.com/api"

    def __init__(self, api_key=None, timeout=15.0, max_retries=2, base_delay=0.75, clock=time.time):
        self.api_key = api_key if api_key is not None else os.getenv("FMP_API_KEY", "")
        self.timeout = timeout
        self.max_retries = max_retries
        self.base_delay = base_delay
        self._clock = clock

    def _get(self, path, params):
        if not self.api_key:
            raise QuoteError("NO_KEY", "FMP_API_KEY is not set")
        last_exc = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.get(f"{self.BASE}{path}", params={**params, "apikey": self.api_key})
                if response.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("RATE_LIMIT", "FMP rate limit")
                if response.status_code >= 400:
                    if _http_retryable(response.status_code) and attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("HTTP_ERROR", f"FMP returned {response.status_code}")
                payload = response.json()
                if not isinstance(payload, list):
                    raise QuoteError("NO_DATA", "FMP returned no earnings rows")
                return payload
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"FMP request failed: {last_exc}")

    def get_earnings(self, symbol):
        symbol = symbol.strip().upper()
        now = datetime.fromtimestamp(self._clock(), tz=timezone.utc)
        rows = self._get("/v3/earning_calendar", {
            "from": (now - timedelta(days=420)).date().isoformat(),
            "to": (now + timedelta(days=120)).date().isoformat(),
            "symbol": symbol,
        })
        events = []
        for row in rows:
            date = str(row.get("date") or row.get("dateReported") or "")[:10]
            if not date:
                continue
            try:
                event_date = datetime.fromisoformat(date).date()
            except ValueError:
                continue
            actual = row.get("eps") if row.get("eps") is not None else row.get("epsActual")
            estimate = row.get("epsEstimated") if row.get("epsEstimated") is not None else row.get("epsEstimate")
            when = "upcoming" if event_date >= now.date() and actual is None else "past"
            event = EarningsEvent(
                symbol=symbol, date=date, when=when,
                period=row.get("fiscalDateEnding") or row.get("fiscalQuarter"),
                hour=row.get("time") or row.get("hour"),
                eps_actual=actual, eps_estimate=estimate,
                revenue_actual=row.get("revenue"), revenue_estimate=row.get("revenueEstimated"),
                source=self.source,
            )
            event.surprise_pct = event.compute_surprise()
            events.append(event)
        if not events:
            raise QuoteError("NO_DATA", f"FMP returned no earnings for {symbol}")
        events.sort(key=lambda event: event.date)
        return EarningsHistory(symbol=symbol, events=events, source=self.source)
