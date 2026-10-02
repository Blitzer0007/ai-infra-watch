"""Analyst expectations and issuer-official web evidence for stock research.

Both providers are optional live enrichments over Finnhub. They are deliberately
kept separate from SEC/regulatory and generic-news evidence so Autonomous
Research can reason about provenance. A provider failure is a normal degraded
source state; callers should not treat it as proof that no evidence exists.
"""
from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx

from .providers import QuoteError, _http_retryable


def _list_records(value: Any) -> list[dict[str, Any]]:
    """Normalize Finnhub list payloads without coupling services to provider internals."""
    return [dict(item) for item in value if isinstance(item, dict)] if isinstance(value, list) else []


@dataclass
class AnalystSnapshot:
    symbol: str
    source: str
    recommendation: dict[str, Any]
    price_target: dict[str, Any]
    eps_estimates: list[dict[str, Any]]
    revenue_estimates: list[dict[str, Any]]

    def model_dump(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "source": self.source,
            "recommendation": self.recommendation,
            "price_target": self.price_target,
            "eps_estimates": self.eps_estimates,
            "revenue_estimates": self.revenue_estimates,
        }


@dataclass
class IssuerOfficialSnapshot:
    symbol: str
    source: str
    website: str | None
    profile: dict[str, Any]
    official_articles: list[dict[str, Any]]

    def model_dump(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "source": self.source,
            "website": self.website,
            "profile": self.profile,
            "official_articles": self.official_articles,
        }


class FinnhubResearchProvider:
    """Finnhub-backed research enrichments with bounded retries."""

    BASE = "https://finnhub.io/api/v1"

    def __init__(
        self,
        api_key: str | None = None,
        timeout: float = 15.0,
        max_retries: int = 2,
        base_delay: float = 0.8,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("FINNHUB_API_KEY", "")
        self.timeout = timeout
        self.max_retries = max_retries
        self.base_delay = base_delay

    def _get(self, path: str, params: dict[str, Any]) -> Any:
        if not self.api_key:
            raise QuoteError("NO_KEY", "FINNHUB_API_KEY is not set")
        params = {**params, "token": self.api_key}
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.get(f"{self.BASE}/{path.lstrip('/')}", params=params)
                if response.status_code == 429:
                    if attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("RATE_LIMIT", "Finnhub research endpoint rate limit")
                if response.status_code >= 400:
                    if _http_retryable(response.status_code) and attempt < self.max_retries:
                        time.sleep(self.base_delay * (2 ** attempt))
                        continue
                    raise QuoteError("HTTP_ERROR", f"Finnhub returned {response.status_code}")
                return response.json()
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self.base_delay * (2 ** attempt))
                    continue
        raise QuoteError("HTTP_ERROR", f"Finnhub request failed: {last_exc}")

    @staticmethod
    def _list(value: Any) -> list[dict[str, Any]]:
        return [dict(item) for item in value if isinstance(item, dict)] if isinstance(value, list) else []


class AnalystService:
    """Expose analyst expectations as a secondary forecast evidence family."""

    def __init__(self, provider: FinnhubResearchProvider | None = None) -> None:
        self.provider = provider or FinnhubResearchProvider()

    def get(self, symbol: str) -> AnalystSnapshot:
        symbol = symbol.strip().upper()
        if not symbol:
            raise QuoteError("NO_DATA", "symbol is required")

        # Each analyst endpoint is best-effort because access can vary by plan
        # and a single unavailable endpoint should not discard useful consensus
        # or target evidence returned by another endpoint.
        try:
            recommendation_raw = self.provider._get("/stock/recommendation", {"symbol": symbol})
        except QuoteError:
            recommendation_raw = []
        try:
            target_raw = self.provider._get("/stock/price-target", {"symbol": symbol})
        except QuoteError:
            target_raw = {}
        try:
            eps_raw = self.provider._get("/stock/eps-estimate", {"symbol": symbol})
        except QuoteError:
            eps_raw = []
        try:
            revenue_raw = self.provider._get("/stock/revenue-estimate", {"symbol": symbol})
        except QuoteError:
            revenue_raw = []

        recommendation_rows = _list_records(recommendation_raw)
        recommendation = recommendation_rows[0] if recommendation_rows else (
            dict(recommendation_raw) if isinstance(recommendation_raw, dict) else {}
        )
        price_target = dict(target_raw) if isinstance(target_raw, dict) else {}

        if not recommendation and not price_target and not eps_raw and not revenue_raw:
            raise QuoteError("NO_DATA", f"no analyst expectations for {symbol}")

        return AnalystSnapshot(
            symbol=symbol,
            source="finnhub-analyst",
            recommendation=recommendation,
            price_target=price_target,
            eps_estimates=_list_records((eps_raw or {}).get("data") if isinstance(eps_raw, dict) else eps_raw),
            revenue_estimates=_list_records((revenue_raw or {}).get("data") if isinstance(revenue_raw, dict) else revenue_raw),
        )


class IssuerOfficialService:
    """Best-effort company-official evidence.

    Uses the issuer website reported by Finnhub profile2 and only retains
    company-news records whose URL host matches that issuer domain. This keeps
    generic third-party news out of the issuer_primary evidence family.
    """

    def __init__(self, provider: FinnhubResearchProvider | None = None) -> None:
        self.provider = provider or FinnhubResearchProvider()

    @staticmethod
    def _host(value: str | None) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        parsed = urlparse(raw if "://" in raw else "https://" + raw)
        return (parsed.hostname or "").lower().lstrip("www.")

    def get(self, symbol: str, days: int = 14) -> IssuerOfficialSnapshot:
        symbol = symbol.strip().upper()
        if not symbol:
            raise QuoteError("NO_DATA", "symbol is required")
        profile_raw = self.provider._get("/stock/profile2", {"symbol": symbol})
        profile = dict(profile_raw) if isinstance(profile_raw, dict) else {}
        website = str(profile.get("weburl") or profile.get("website") or "").strip() or None
        official_host = self._host(website)
        if not official_host:
            return IssuerOfficialSnapshot(
                symbol=symbol,
                source="issuer-primary-profile",
                website=None,
                profile=profile,
                official_articles=[],
            )

        end = time.strftime("%Y-%m-%d", time.gmtime())
        start = time.strftime("%Y-%m-%d", time.gmtime(time.time() - max(1, min(days, 30)) * 86400))
        try:
            raw_articles = self.provider._get(
                "/company-news",
                {"symbol": symbol, "from": start, "to": end},
            )
        except QuoteError:
            raw_articles = []
        official: list[dict[str, Any]] = []
        for row in raw_articles if isinstance(raw_articles, list) else []:
            if not isinstance(row, dict):
                continue
            url = str(row.get("url") or "").strip()
            if self._host(url) != official_host:
                continue
            official.append({
                "published_at": row.get("published_at") or row.get("datetime"),
                "headline": str(row.get("headline") or "").strip(),
                "summary": str(row.get("summary") or "").strip(),
                "url": url,
                "source": "issuer-official-domain",
            })

        return IssuerOfficialSnapshot(
            symbol=symbol,
            source="issuer-primary",
            website=website,
            profile=profile,
            official_articles=official[:20],
        )


__all__ = ["AnalystService", "AnalystSnapshot", "IssuerOfficialService", "IssuerOfficialSnapshot", "FinnhubResearchProvider"]
