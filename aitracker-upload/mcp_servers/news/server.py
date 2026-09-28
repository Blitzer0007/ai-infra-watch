from __future__ import annotations

import json

from mcp.server import MCPServer

from .service import NewsService, from_env


def build_server(service: NewsService | None = None) -> MCPServer:
    svc = service or from_env("live")
    server = MCPServer(
        name="mcp-server-news",
        title="News",
        description="Live company and market news via Finnhub, with search and sector/geopolitical filters.",
    )

    @server.tool(name="search", description="Search recent market news by keywords.")
    def search(query: str, days: int = 7) -> dict:
        return svc.search(query, days=days).model_dump()

    @server.tool(name="company", description="Get recent company news for one stock symbol.")
    def company(symbol: str, days: int = 7) -> dict:
        return svc.company(symbol, days=days).model_dump()

    @server.tool(name="sector", description="Get recent news for an AI Infra Watch sector/theme such as semiconductor, AI, data center, cloud, energy, or software.")
    def sector(sector: str, days: int = 3) -> dict:
        return svc.sector(sector, days=days).model_dump()

    @server.tool(name="global", description="Get the latest general market news.")
    def global_news(days: int = 3) -> dict:
        return svc.global_news(days=days).model_dump()

    @server.tool(name="geopolitical", description="Search recent general news for a geopolitical topic that may affect markets.")
    def geopolitical(topic: str = "geopolitics", days: int = 3) -> dict:
        return svc.geopolitical(topic, days=days).model_dump()

    @server.tool(name="health", description="News server health snapshot.")
    def health() -> dict:
        return svc.health().model_dump()

    @server.resource(
        uri="news://latest",
        name="latest_news",
        description="Latest general market news as JSON text.",
        mime_type="application/json",
    )
    def latest_news() -> str:
        return json.dumps(svc.global_news(days=1).model_dump(), ensure_ascii=False)

    return server


def main() -> None:
    import os
    mode = os.getenv("NEWS_MODE", "live")
    server = build_server(from_env(mode))
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
