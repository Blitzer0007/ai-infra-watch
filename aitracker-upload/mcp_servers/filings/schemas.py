"""Wire types for mcp-server-filings (JSON-serializable).

These mirror the app.rag models but are plain dict-able pydantic
models so MCP tool results serialize cleanly to the agent. They keep
the retrieval provenance (document_id + chunk_index + score + source)
so downstream agents can ground and cite.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class Citation(BaseModel):
    """One cited source chunk."""

    document_id: str
    chunk_index: int
    text: str
    score: float = Field(ge=0.0, le=1.0)
    source: str = "fused"


class SearchHit(BaseModel):
    """A single retrieval hit for search_filings."""

    document_id: str
    chunk_index: int
    text: str
    score: float = Field(ge=0.0, le=1.0)
    source: str = "fused"


class SearchResult(BaseModel):
    """search_filings output — ranked hits + the query."""

    query: str
    hits: list[SearchHit] = Field(default_factory=list)


class AnswerResult(BaseModel):
    """answer_question output — cited answer + retrieval provenance."""

    answer: str
    citations: list[Citation] = Field(default_factory=list)
    sources_footer: str = ""


class FilingsHealth(BaseModel):
    """health output for mcp-server-filings."""

    server: str = "mcp-server-filings"
    mode: str = "fixture"
    documents: int = 0
    chunks: int = 0
    embed_mode: str = "lexical"
    ok: bool = True
    detail: str = ""


class FilingRef(BaseModel):
    """A pointer to one filing on SEC EDGAR (the unit the Ingest Agent fetches).

    `accession` is EDGAR's globally-unique id for a filing (e.g.
    "0001045810-25-000023") — the dedupe key: a filing is downloaded and
    ingested at most once. `primary_doc` is the main document's filename within
    the accession; `url` is the fully-resolved fetch URL for `download`.
    """

    cik: str
    symbol: str
    form: str  # "10-K" | "10-Q" | "20-F" | "6-K" | "8-K"
    accession: str
    primary_doc: str = ""
    filed_date: str = ""
    url: str = ""
    # 8-K item codes (e.g. ["1.01", "9.01"]); empty for periodic reports.
    items: list[str] = Field(default_factory=list)

    def doc_id(self) -> str:
        """Stable document id for the RAG corpus: symbol_form_accession."""
        form = self.form.lower().replace("-", "")
        acc = self.accession.replace("-", "")
        return f"{self.symbol.lower()}_{form}_{acc}"


class ContractRecord(BaseModel):
    """One contract-related disclosure extracted from a primary SEC filing."""

    symbol: str
    date: str
    form: str = "8-K"
    accession: str = ""
    url: str = ""
    items: list[str] = Field(default_factory=list)
    title: str = "Material agreement / financial obligation"
    counterparties: list[str] = Field(default_factory=list)
    disclosed_values: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    source: str = "sec-edgar-primary"
    confidence: str = "primary_filing"


class ContractTimeline(BaseModel):
    """Recent contract-related SEC disclosures for one symbol."""

    symbol: str
    source: str = "live"
    contracts: list[ContractRecord] = Field(default_factory=list)


class MilestoneEvent(BaseModel):
    """One entry on a symbol's milestone timeline, derived from an 8-K filing.

    A material-event 8-K maps to a milestone: `date` is the filing date, `title`
    is the human name of the first recognized 8-K item, `description` joins the
    titles of all items disclosed, and `url` links to the filing on EDGAR so the
    timeline entry is auditable. `status` is always "done" — an 8-K records an
    event that has already happened.
    """

    date: str
    title: str
    description: str = ""
    status: str = "done"
    form: str = "8-K"
    accession: str = ""
    url: str = ""
    items: list[str] = Field(default_factory=list)


class MilestoneTimeline(BaseModel):
    """A symbol's milestone timeline: newest-first material events + provenance."""

    symbol: str
    source: str = "live"
    events: list[MilestoneEvent] = Field(default_factory=list)


class EdgarError(RuntimeError):
    """Structured EDGAR client error, mirroring providers.QuoteError's
    code/message shape (NO_UA / RATE_LIMIT / NO_DATA / HTTP_ERROR) so the
    ingest agent can record a stable code in its trajectory."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
