from __future__ import annotations

from app.agents.evidence_quality import _family_from_tool
from app.agents.autonomous import _channel_tool_usable
from mcp_servers.stocks.research_sources import (
    AnalystService,
    AnalystSnapshot,
    IssuerOfficialService,
    IssuerOfficialSnapshot,
)


def test_new_research_tools_have_distinct_provenance_families():
    assert _family_from_tool("stocks.get_analyst_expectations") == "analyst_consensus"
    assert _family_from_tool("stocks.get_issuer_official") == "issuer_primary"
    assert _channel_tool_usable("analyst_consensus", "stocks.get_analyst_expectations")
    assert _channel_tool_usable("issuer_primary", "stocks.get_issuer_official")


class FakeFinnhubResearchProvider:
    def __init__(self):
        self.calls = []

    def _get(self, path, params):
        self.calls.append((path, params))
        if path == "/stock/recommendation":
            return [{"buy": 7, "hold": 3, "sell": 1, "period": "2026-10-01"}]
        if path == "/stock/price-target":
            return {"targetHigh": 250, "targetLow": 180, "targetMean": 225, "targetMedian": 220, "lastUpdated": "2026-10-01"}
        if path == "/stock/eps-estimate":
            return {"data": [{"period": "2026-12-31", "avg": 1.8, "numberAnalysts": 18}]}
        if path == "/stock/revenue-estimate":
            return {"data": [{"period": "2026-12-31", "avg": 100000000, "numberAnalysts": 17}]}
        if path == "/stock/profile2":
            return {"name": "Example Corp", "ticker": "EXM", "weburl": "https://example.com"}
        if path == "/company-news":
            return [
                {
                    "headline": "Official update",
                    "summary": "Company announcement",
                    "url": "https://www.example.com/news/update",
                    "datetime": 1790899200,
                },
                {
                    "headline": "Third-party story",
                    "summary": "External report",
                    "url": "https://news.example.net/story",
                    "datetime": 1790899200,
                },
            ]
        raise AssertionError(path)


def test_analyst_service_normalizes_expectations():
    provider = FakeFinnhubResearchProvider()
    snapshot = AnalystService(provider).get("EXM")

    assert isinstance(snapshot, AnalystSnapshot)
    assert snapshot.symbol == "EXM"
    assert snapshot.price_target["targetMean"] == 225
    assert snapshot.recommendation["buy"] == 7
    assert snapshot.eps_estimates[0]["numberAnalysts"] == 18
    assert snapshot.revenue_estimates[0]["avg"] == 100000000


def test_issuer_official_filters_to_company_domain():
    provider = FakeFinnhubResearchProvider()
    snapshot = IssuerOfficialService(provider).get("EXM")

    assert isinstance(snapshot, IssuerOfficialSnapshot)
    assert snapshot.website == "https://example.com"
    assert len(snapshot.official_articles) == 1
    assert snapshot.official_articles[0]["url"] == "https://www.example.com/news/update"
    assert all("news.example.net" not in item["url"] for item in snapshot.official_articles)


def test_analyst_service_keeps_partial_results_when_endpoint_is_unavailable():
    from mcp_servers.stocks.providers import QuoteError

    provider = FakeFinnhubResearchProvider()
    original = provider._get

    def partial(path, params):
        if path == "/stock/eps-estimate":
            raise QuoteError("HTTP_ERROR", "endpoint unavailable")
        return original(path, params)

    provider._get = partial
    snapshot = AnalystService(provider).get("EXM")
    assert snapshot.price_target["targetMean"] == 225
    assert snapshot.recommendation["buy"] == 7
    assert snapshot.eps_estimates == []
    assert snapshot.revenue_estimates[0]["avg"] == 100000000


def test_web_search_service_is_optional(monkeypatch):
    from mcp_servers.stocks.social_research import WebSearchService
    monkeypatch.delenv("BRAVE_SEARCH_API_KEY", raising=False)
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    service = WebSearchService()
    assert hasattr(service, "search")


def test_executive_catalog_contains_nebius_and_musk():
    from mcp_servers.stocks.social_research import EXECUTIVE_PROFILES
    names = {row["name"] for row in EXECUTIVE_PROFILES}
    assert "Arkady Volozh" in names
    assert "Elon Musk" in names
