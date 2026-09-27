"""mcp-server-filings — RAG over SEC filings as MCP tools.

Wraps the app.rag layer (ingest -> hybrid retrieve -> cited answer)
behind the MCP stdio transport so any agent can search the filing
corpus and get grounded, cited answers.

Layout mirrors mcp_servers/stocks:
  service.py  — FilingsService (transport-independent, unit-tested)
  server.py   — build_server(service) MCP shell (contract-tested)
  schemas.py  — wire types (SearchHit, SearchResult, AnswerResult, Health)
"""
from mcp_servers.filings.service import FilingsService, from_env
from mcp_servers.filings.schemas import (
    AnswerResult,
    Citation,
    FilingsHealth,
    SearchHit,
    SearchResult,
)

__all__ = [
    "FilingsService",
    "from_env",
    "AnswerResult",
    "Citation",
    "FilingsHealth",
    "SearchHit",
    "SearchResult",
]
