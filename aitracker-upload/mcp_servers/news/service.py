from __future__ import annotations

from typing import Iterable

from .providers import NewsError, NewsProvider, from_env as provider_from_env
from .schemas import NewsBatch, NewsHealth


SECTOR_TERMS = {
    "semiconductor": "semiconductor chip memory GPU AI accelerator",
    "semiconductors": "semiconductor chip memory GPU AI accelerator",
    "ai": "artificial intelligence AI datacenter GPU accelerator",
    "data center": "data center datacenter cloud GPU AI infrastructure",
    "cloud": "cloud hyperscaler datacenter AI infrastructure",
    "energy": "power energy datacenter electricity nuclear",
    "software": "enterprise software cloud AI",
}


class NewsService:
    def __init__(self, provider: NewsProvider | None = None) -> None:
        self.provider = provider or provider_from_env()

    def _batch(self, query: str, articles: Iterable) -> NewsBatch:
        seen: set[tuple[str, str]] = set()
        out = []
        for article in sorted(articles, key=lambda a: a.published_at, reverse=True):
            key = (article.url or article.headline, article.source)
            if key in seen:
                continue
            seen.add(key)
            out.append(article)
        return NewsBatch(query=query, source=self.provider.source, articles=out[:20])

    def company(self, symbol: str, days: int = 7) -> NewsBatch:
        sym = symbol.strip().upper()
        return self._batch(sym, self.provider.company(sym, days=days))

    def search(self, query: str, days: int = 7) -> NewsBatch:
        return self._batch(query, self.provider.search(query, days=days))

    def sector(self, sector: str, days: int = 3) -> NewsBatch:
        query = SECTOR_TERMS.get(sector.strip().lower(), sector.strip())
        return self.search(query, days=days)

    def global_news(self, days: int = 3) -> NewsBatch:
        return self._batch("global", self.provider.general(days=days))

    def geopolitical(self, topic: str = "geopolitics", days: int = 3) -> NewsBatch:
        query = topic.strip() or "geopolitics"
        return self.search(query, days=days)

    def health(self) -> NewsHealth:
        try:
            if self.provider.source == "finnhub":
                self.provider.general(days=1)
            return NewsHealth(source=self.provider.source, ok=True, message="news provider reachable")
        except NewsError as exc:
            return NewsHealth(source=self.provider.source, ok=False, message=exc.message)


def from_env(mode: str | None = None) -> NewsService:
    return NewsService(provider_from_env(mode))
