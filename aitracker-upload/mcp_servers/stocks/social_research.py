
from __future__ import annotations

import os
import re
from typing import Any
from urllib.parse import urlparse

import httpx

EXECUTIVE_PROFILES = (
    {
        "id": "elon-musk",
        "name": "Elon Musk",
        "organizations": ["Tesla", "xAI", "X"],
        "x_username": "elonmusk",
        "linkedin_profile": None,
        "official_domains": ["x.com"],
    },
    {
        "id": "arkady-volozh",
        "name": "Arkady Volozh",
        "organizations": ["Nebius"],
        "x_username": None,
        "linkedin_profile": "https://www.linkedin.com/in/arkady-volozh",
        "official_domains": ["nebius.com"],
    },
    {
        "id": "lisa-su",
        "name": "Lisa Su",
        "organizations": ["AMD"],
        "x_username": None,
        "linkedin_profile": "https://www.linkedin.com/in/lisasu-amd",
        "official_domains": ["amd.com"],
    },
    {
        "id": "satya-nadella",
        "name": "Satya Nadella",
        "organizations": ["Microsoft"],
        "x_username": None,
        "linkedin_profile": "https://www.linkedin.com/in/satyanadella",
        "official_domains": ["microsoft.com"],
    },
)


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower().lstrip("www.")
    except Exception:
        return ""


class WebSearchService:
    """Brave/Tavily web search with an explicit GDELT discovery fallback."""

    def __init__(self, timeout: float = 8.0) -> None:
        self.timeout = timeout

    def search(
        self,
        query: str,
        domains: list[str] | None = None,
        days: int = 7,
        limit: int = 10,
    ) -> dict[str, Any]:
        query = str(query or "").strip()
        if not query:
            return {"query": query, "provider": "unavailable", "results": [], "degraded": True, "error": "query required"}

        limit = min(max(int(limit or 10), 1), 10)
        domains = domains or []
        brave = os.getenv("BRAVE_SEARCH_API_KEY", "").strip()
        if brave:
            try:
                params = {
                    "q": query,
                    "count": limit,
                    "search_lang": "en",
                    "country": "us",
                    "safesearch": "moderate",
                    "freshness": "pd" if days <= 1 else "pm" if days <= 30 else "py",
                }
                headers = {"Accept": "application/json", "X-Subscription-Token": brave}
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.get("https://api.search.brave.com/res/v1/web/search", params=params, headers=headers)
                response.raise_for_status()
                payload = response.json()
                rows = []
                for row in (payload.get("web") or {}).get("results") or []:
                    if not isinstance(row, dict) or not row.get("url") or not row.get("title"):
                        continue
                    rows.append({
                        "title": str(row.get("title") or ""),
                        "snippet": str(row.get("description") or row.get("snippet") or ""),
                        "url": str(row.get("url") or ""),
                        "published_at": row.get("published"),
                        "source": "brave-web",
                    })
                return {"query": query, "provider": "brave-web", "results": rows[:limit], "degraded": False, "error": None}
            except Exception:
                pass

        tavily = os.getenv("TAVILY_API_KEY", "").strip()
        if tavily:
            try:
                payload = {
                    "api_key": tavily,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": limit,
                    "include_answer": False,
                    "days": min(max(days, 1), 30),
                }
                if domains:
                    payload["include_domains"] = domains[:10]
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post("https://api.tavily.com/search", json=payload)
                response.raise_for_status()
                data = response.json()
                rows = []
                for row in data.get("results") or []:
                    if not isinstance(row, dict) or not row.get("url") or not row.get("title"):
                        continue
                    rows.append({
                        "title": str(row.get("title") or ""),
                        "snippet": str(row.get("content") or row.get("snippet") or ""),
                        "url": str(row.get("url") or ""),
                        "published_at": row.get("published_date"),
                        "source": "tavily-web",
                    })
                return {"query": query, "provider": "tavily-web", "results": rows[:limit], "degraded": False, "error": None}
            except Exception:
                pass

        try:
            params = {
                "query": query,
                "mode": "ArtList",
                "format": "json",
                "maxrecords": limit,
                "timespan": f"{min(max(days, 1), 30) * 24}h",
                "sort": "datedesc",
            }
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get("https://api.gdeltproject.org/api/v2/doc/doc", params=params, headers={"User-Agent": "AI Infra Watch/1.0"})
            response.raise_for_status()
            payload = response.json()
            rows = []
            for row in payload.get("articles") or []:
                if not isinstance(row, dict) or not row.get("url") or not row.get("title"):
                    continue
                rows.append({
                    "title": str(row.get("title") or ""),
                    "snippet": str(row.get("seendate") or ""),
                    "url": str(row.get("url") or ""),
                    "published_at": row.get("seendate"),
                    "source": "gdelt-discovery",
                })
            return {
                "query": query,
                "provider": "gdelt-discovery",
                "results": rows[:limit],
                "degraded": True,
                "error": "Brave/Tavily not configured; using GDELT discovery fallback.",
            }
        except Exception as exc:
            return {
                "query": query,
                "provider": "unavailable",
                "results": [],
                "degraded": True,
                "error": str(exc),
            }


AUTOPILOT_PROFILES = (
    {
        "id": "autopilot",
        "name": "Autopilot",
        "organizations": ["Autopilot", "Pelosi Tracker"],
        "x_username": "joinautopilot",
        "official_domains": ["joinautopilot.com", "marketplace.joinautopilot.com"],
    },
)


class PlatformSignalsService:
    """Discover public investment-platform signals, starting with Autopilot's X account."""

    def __init__(self, search: WebSearchService | None = None) -> None:
        self.search = search or WebSearchService()

    def get(self, platform: str = "Autopilot", days: int = 7, limit: int = 12) -> dict[str, Any]:
        requested = str(platform or "Autopilot").strip().lower()
        profiles = [p for p in AUTOPILOT_PROFILES if requested in p["name"].lower() or requested in p["id"]]
        if not profiles:
            profiles = list(AUTOPILOT_PROFILES)

        rows: list[dict[str, Any]] = []
        notes: list[str] = []
        for profile in profiles:
            username = profile["x_username"]
            queries = [
                (f'site:x.com/{username} (portfolio OR holdings OR invested OR tracker OR positions OR "$")', ["x.com"]),
                (f'site:joinautopilot.com/landing "{profile["name"]}" portfolio', ["joinautopilot.com"]),
            ]
            for query, domains in queries:
                result = self.search.search(query, domains=domains, days=days, limit=limit)
                if result.get("error"):
                    notes.append(str(result["error"]))
                for item in result.get("results") or []:
                    url = str(item.get("url") or "")
                    host = _host(url)
                    official_x = host == "x.com" and url.lower().startswith("https://x.com/" + username.lower())
                    official_site = any(host == d or host.endswith("." + d) for d in profile["official_domains"])
                    text_blob = " ".join(str(item.get(key) or "") for key in ("title", "snippet", "summary")).strip()
                    tickers = sorted(set(re.findall(r'\$([A-Z]{1,6})(?:\b|$)', text_blob)))
                    portfolio_links = [token.rstrip(".,)") for token in re.findall(r'https?://(?:www\.)?(?:marketplace\.)?joinautopilot\.com/[^\s)]+', text_blob)]
                    rows.append({
                        **item,
                        "platform": profile["name"],
                        "xUsername": username,
                        "official": official_x or official_site,
                        "sourceType": "official-x" if official_x else "official-platform" if official_site else "secondary",
                        "signalType": "platform_social_signal" if official_x else "platform_coverage",
                        "tickers": tickers,
                        "portfolioLinks": portfolio_links,
                    })

        deduped = {}
        for row in rows:
            key = str(row.get("url") or row.get("title") or "").strip().lower()
            if key:
                deduped.setdefault(key, row)
        out = list(deduped.values())
        out.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
        return {
            "source": "platform-signal-discovery",
            "platform": profiles[0]["name"],
            "xUsername": profiles[0]["x_username"],
            "xUrl": "https://x.com/" + profiles[0]["x_username"],
            "provider": "mixed-web-search",
            "signals": out[:limit],
            "tickers": sorted({ticker for row in out for ticker in row.get("tickers") or []}),
            "portfolioLinks": sorted({link for row in out for link in row.get("portfolioLinks") or []}),
            "officialCoverage": sum(1 for row in out if row.get("official")),
            "degraded": bool(notes),
            "providerNotes": sorted(set(notes))[:5],
        }


class ExecutiveSignalsService:
    def __init__(self, search: WebSearchService | None = None) -> None:
        self.search = search or WebSearchService()

    def get(self, executive: str | None = None, organization: str | None = None, days: int = 7, limit: int = 12) -> dict[str, Any]:
        executive_q = str(executive or "").strip().lower()
        organization_q = str(organization or "").strip().lower()
        profiles = [
            p for p in EXECUTIVE_PROFILES
            if (not executive_q or executive_q in p["name"].lower())
            and (not organization_q or any(organization_q in item.lower() for item in p["organizations"]))
        ]
        rows: list[dict[str, Any]] = []
        notes: list[str] = []
        for profile in profiles:
            orgs = " OR ".join(f'"{item}"' for item in profile["organizations"])
            queries = [
                (f'"{profile["name"]}" ({orgs}) (AI OR chips OR GPU OR "data center" OR infrastructure OR cloud OR power)', []),
                (f'site:linkedin.com "{profile["name"]}" {orgs}', ["linkedin.com"]),
            ]
            if profile.get("x_username"):
                queries.append((f'site:x.com/{profile["x_username"]} "{profile["name"]}" AI', ["x.com"]))
            for query, domains in queries:
                result = self.search.search(query, domains=domains, days=days, limit=limit)
                if result.get("error"):
                    notes.append(str(result["error"]))
                for item in result.get("results") or []:
                    url = str(item.get("url") or "")
                    host = _host(url)
                    official = False
                    if profile.get("x_username") and host == "x.com":
                        official = url.lower().startswith("https://x.com/" + profile["x_username"].lower())
                    elif profile.get("linkedin_profile") and host == "linkedin.com":
                        official = url.lower().startswith(profile["linkedin_profile"].rstrip("/").lower())
                    elif any(host == d or host.endswith("." + d) for d in profile["official_domains"]):
                        official = True
                    rows.append({
                        **item,
                        "executive": profile["name"],
                        "organizations": profile["organizations"],
                        "official": official,
                        "sourceType": "official-social" if official and host in {"x.com", "linkedin.com"} else "official-web" if official else "secondary",
                        "signalType": "executive_statement" if official and host in {"x.com", "linkedin.com"} else "executive_coverage",
                    })
        deduped = {}
        for row in rows:
            deduped.setdefault(str(row.get("url") or row.get("title") or "").lower(), row)
        out = list(deduped.values())
        out.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
        return {
            "source": "executive-signal-discovery",
            "provider": "mixed-web-search",
            "profiles": profiles,
            "signals": out[:limit],
            "officialCoverage": sum(1 for row in out if row.get("official")),
            "degraded": bool(notes),
            "providerNotes": sorted(set(notes))[:5],
        }
