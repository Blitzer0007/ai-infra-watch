"""MCP server: RAG over SEC filings as search + cite tools.

Run (stdio transport, the MCP default):
    python -m mcp_servers.filings.server
or
    python -c "import mcp_servers.filings.server as s; s.main()"

Tools:
    search_filings(query, top_k) -> SearchResult (ranked hits w/ provenance)
    answer_question(question)    -> AnswerResult (cited answer)
    list_documents()             -> list[str]
    get_document(document_id)    -> str (reconstructed text)
    health()                     -> FilingsHealth (observability)

Resource:
    filings://corpus/health      -> FilingsHealth as JSON text

Every tool delegates to FilingsService (service.py), mirroring the
mcp-server-stocks layout: transport-independent service (unit-tested)
+ thin server shell (contract-tested via async dispatch).
"""
from __future__ import annotations

import json

from mcp.server import MCPServer
from mcp.types import ToolResultContent  # noqa: F401  (re-export for contract tests)

from .service import FilingsService, from_env as _from_env


def build_server(service: FilingsService | None = None) -> MCPServer:
    """Construct the MCPServer shell around a FilingsService."""
    svc = service or _from_env()

    server = MCPServer(
        name="mcp-server-filings",
        title="Filings",
        description="RAG search + cited answers over SEC filings and company documents.",
    )

    @server.tool(
        name="search_filings",
        description="Hybrid BM25+vector search over the filing corpus. Returns ranked chunks with document provenance.",
    )
    def search_filings(query: str, top_k: int = 5) -> dict:
        result = svc.search_filings(query, top_k=top_k)
        return result.model_dump()

    @server.tool(
        name="answer_question",
        description="Answer a question about the filings with citations to the source chunks.",
    )
    def answer_question(question: str) -> dict:
        result = svc.answer_question(question)
        return result.model_dump()

    @server.tool(
        name="get_milestones",
        description="Get a symbol's recent material-event milestones derived from SEC 8-K filings, with accession numbers and auditable EDGAR URLs.",
    )
    def get_milestones(symbol: str) -> dict:
        from .milestones import MilestoneService

        mode = getattr(svc, "mode", "fixture")
        timeline = MilestoneService.from_env(mode=mode).get_timeline(symbol)
        return timeline.model_dump()

    @server.tool(name="list_documents", description="List the document IDs available in the corpus.")
    def list_documents() -> list[str]:
        return svc.list_documents()

    @server.tool(
        name="get_document",
        description="Return the full reconstructed text of one document by ID.",
    )
    def get_document(document_id: str) -> str:
        try:
            return svc.get_document(document_id)
        except KeyError as exc:
            raise ValueError(str(exc)) from exc

    @server.tool(name="health", description="Filings server health snapshot for observability.")
    def health() -> dict:
        return svc.health().model_dump()

    @server.resource(
        uri="filings://corpus/health",
        name="filings_health",
        description="Filings corpus health (document/chunk counts, embed mode).",
        mime_type="application/json",
    )
    def filings_health() -> str:
        return json.dumps(svc.health().model_dump(), ensure_ascii=False)

    return server


def from_env(mode: str = "fixture") -> FilingsService:
    """Fixture or live service selected by the caller (usually via env)."""
    return _from_env(mode)


def main() -> None:
    import os

    mode = os.getenv("FILINGS_MODE", "fixture")
    server = build_server(_from_env(mode=mode))
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
