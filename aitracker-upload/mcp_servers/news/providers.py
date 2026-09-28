from __future__ import annotations

import json
import os
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Protocol

import httpx

from .schemas import NewsArticle

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "news.json"


class NewsError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


class NewsProvider(Protocol):
    @property
    def source(self) -> str: ...
    def company(self, symbol: str, days: int = 7) -> list[NewsArticle]: ...
    def general(self, days: int = 3) -> list[NewsArticle]: ...
    def search(self, query: str, days: int = 7) -> list[NewsArticle]: ...


def _iso_date(ts: int | float | None) -> str:
    if not ts:
        return ""
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(ts)))


def _article(row: dict) -> NewsArticle:
    related = row.get("related", "")
    if isinstance(related, str):
        related = [x.strip().upper() for x in related.replace(",", " ").split() if x.strip()]
    elif not isinstance(related, list):
        related = []
    return NewsArticle(
        id=str(row.get("id")) if row.get("id") is not None else None,
        published_at=row.get("published_at") or _iso_date(row.get("datetime")),
        headline=str(row.get("headline", "")).strip(),
        source=str(row.get("source", "")).strip(),
        summary=str(row.get("summary", "")).strip(),
        url=str(row.get("url", "")).strip(),
        related=related,
        category=row.get("category"),
    )


class FixtureNewsProvider:
    source = "fixture"

    def __init__(self, path: Path | str = FIXTURE_PATH) -> None:
        self.path = Path(path)

    def _load(self) -> list[NewsArticle]:
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return []
        except json.JSONDecodeError as exc:
            raise NewsError("NO_DATA", f"bad news fixture: {exc}") from exc
        return [_article(row) for row in raw if isinstance(row, dict)]

    def company(self, symbol: str, days: int = 7) -> list[NewsArticle]:
        sym = symbol.strip().upper()
        return [a for a in self._load() if sym in a.related]

    def general(self, days: int = 3) -> list[NewsArticle]:
        return self._load()

    def search(self, query: str, days: int = 7) -> list[NewsArticle]:
        terms = [t.lower() for t in query.split() if len(t) > 2]
        return [a for a in self._load() if any(t in (a.headline + " " + a.summary).lower() for t in terms)]


class FinnhubNewsProvider:
    source = "finnhub"
    BASE = "https://finnhub.io/api/v1"

    def __init__(
        self,
        api_key: str | None = None,
        timeout: float = 15.0,
        max_retries: int = 3,
        base_delay: float = 1.0,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("FINNHUB_API_KEY", "")
        self.timeout = timeout
        self.max_retries = max_retries
        self.base_delay = base_delay

    def _get(self, path: str, params: dict) -> list | dict:
        if not self.api_key:
            raise NewsError("NO_KEY", "FINNHUB_API_KEY is not set")
        params = dict(params)
        params["token"] = self.api_key
        url = f"{self.BASE}/{path.lstrip('/')}"
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    resp = client.get(url, params=params)
                if resp.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise NewsError("RATE_LIMIT", "Finnhub rate limit")
                if resp.status_code >= 400:
                    if resp.status_code in (408, 409) or resp.status_code >= 500:
                        if attempt < self.max_retries:
                            time.sleep(self.base_delay * (2 ** attempt))
                            continue
                    raise NewsError("HTTP_ERROR", f"Finnhub returned {resp.status_code}")
                return resp.json()
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise NewsError("HTTP_ERROR", f"Finnhub request failed: {last_exc}")

    def company(self, symbol: str, days: int = 7) -> list[NewsArticle]:
        end = date.today()
        start = end - timedelta(days=max(1, min(days, 30)))
        raw = self._get(
            "company-news",
            {"symbol": symbol.strip().upper(), "from": start.isoformat(), "to": end.isoformat()},
        )
        return self._normalize(raw)

    def general(self, days: int = 3) -> list[NewsArticle]:
        return self._normalize(self._get("news", {"category": "general"}))

    def search(self, query: str, days: int = 7) -> list[NewsArticle]:
        terms = [t.lower() for t in query.split() if len(t) > 2]
        articles = self.general(days=days)
        if not terms:
            return articles
        return [
            a for a in articles
            if any(term in (a.headline + " " + a.summary + " " + " ".join(a.related)).lower() for term in terms)
        ]

    @staticmethod
    def _normalize(raw: object) -> list[NewsArticle]:
        if not isinstance(raw, list):
            return []
        out = [_article(row) for row in raw if isinstance(row, dict)]
        return [a for a in out if a.headline]


def from_env(mode: str | None = None) -> NewsProvider:
    selected = (mode or os.getenv("NEWS_MODE", "fixture")).strip().lower()
    return FinnhubNewsProvider() if selected == "live" else FixtureNewsProvider()
