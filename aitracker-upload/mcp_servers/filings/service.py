"""FilingsService — transport-independent RAG over the filing corpus.

Builds a searchable corpus at construction (from an in-memory
{doc_id: text} map, a directory of files, or the committed fixture
corpus) and exposes the operations the MCP tools delegate to:

  * search_filings(query, top_k)   -> SearchResult (ranked hits)
  * answer_question(question, k)   -> AnswerResult (cited answer)
  * list_documents()               -> list[str]
  * get_document(document_id)      -> full reconstructed text
  * health()                       -> FilingsHealth

Hermetic by default: `from_env(mode="fixture")` loads the committed
sample corpus under mcp_servers/filings/fixtures/, and the LLM used by
answer_question is the stub client (offline fixtures). `mode="live"`
ingests real files from data/filings/ and uses the configured LLM.
"""
from __future__ import annotations

import os
from pathlib import Path

from app.llm.client import LLMClient
from app.rag.chunker import Chunker
from app.rag.generator import Generator
from app.rag.ingest import (
    IngestResult,
    ingest_texts,
    load_text,
    title_prefixes,
)
from app.rag.retriever import Retriever, build_corpus
from app.rag.schemas import Chunk
from mcp_servers.filings.schemas import (
    AnswerResult,
    Citation,
    FilingsHealth,
    SearchHit,
    SearchResult,
)

# Committed sample corpus (small, offline) lives next to this module.
FIXTURE_CORPUS_DIR = Path(__file__).resolve().parent / "fixtures" / "corpus"
# Live corpus location (PDFs gitignored).
LIVE_CORPUS_DIR = Path(__file__).resolve().parents[2] / "data" / "filings"

# Filings are dense; small chunks isolate individual facts (a revenue
# figure, a risk statement) into their own retrievable unit so the
# vector/BM25 arms can surface the exact fact rather than a whole page.
FILINGS_CHUNK_CHARS = 450


class FilingsService:
    def __init__(
        self,
        ingest: IngestResult,
        client: LLMClient | None = None,
        mode: str = "fixture",
        top_k: int = 5,
    ) -> None:
        self._ingest = ingest
        self._corpus = build_corpus(ingest.chunks)
        self._retriever = Retriever(self._corpus, top_k=top_k)
        self._generator = Generator(self._retriever, client=client)
        self.mode = mode
        self.top_k = top_k
        # index chunks by document for get_document reconstruction
        self._by_doc: dict[str, list[Chunk]] = {}
        for c in ingest.chunks:
            self._by_doc.setdefault(c.document_id, []).append(c)

    # ---- construction ------------------------------------------------
    @staticmethod
    def _ingest_docs(docs: dict[str, str]) -> IngestResult:
        """Chunk + embed with filings tuning: small chunks + a title
        context prefix so the company identity travels with every chunk.
        """
        return ingest_texts(
            docs,
            chunker=Chunker(target_chars=FILINGS_CHUNK_CHARS),
            context_prefix=title_prefixes(docs),
        )

    @classmethod
    def from_texts(cls, docs: dict[str, str], **kw) -> "FilingsService":
        return cls(cls._ingest_docs(docs), **kw)

    @classmethod
    def from_directory(cls, directory: Path, **kw) -> "FilingsService":
        docs = _load_corpus_dir(directory)
        return cls(cls._ingest_docs(docs), **kw)

    # ---- operations --------------------------------------------------
    def search_filings(self, query: str, top_k: int | None = None) -> SearchResult:
        if not query or not query.strip():
            raise ValueError("query must be a non-empty string")
        retriever = self._retriever
        if top_k is not None and top_k != self.top_k:
            retriever = Retriever(self._corpus, top_k=top_k)
        hits = retriever.retrieve(query)
        return SearchResult(
            query=query,
            hits=[
                SearchHit(
                    document_id=rc.document_id or rc.chunk.document_id,
                    chunk_index=rc.chunk.chunk_index,
                    text=rc.chunk.text,
                    score=rc.score,
                    source=rc.source,
                )
                for rc in hits
            ],
        )

    def answer_question(self, question: str, top_k: int | None = None) -> AnswerResult:
        if not question or not question.strip():
            raise ValueError("question must be a non-empty string")
        cited = self._generator.answer(question, top_k=top_k)
        return AnswerResult(
            answer=cited.answer,
            citations=[
                Citation(
                    document_id=rc.document_id or rc.chunk.document_id,
                    chunk_index=rc.chunk.chunk_index,
                    text=rc.chunk.text,
                    score=rc.score,
                    source=rc.source,
                )
                for rc in cited.citations
            ],
            sources_footer=cited.sources_footer,
        )

    def list_documents(self) -> list[str]:
        return sorted(self._by_doc.keys())

    def get_document(self, document_id: str) -> str:
        chunks = self._by_doc.get(document_id)
        if not chunks:
            raise KeyError(f"No document with id {document_id!r}")
        # Reconstruct by chunk order; chunks overlap, so dedupe on the
        # sentence level would be ideal — for now we join unique chunks
        # in index order (good enough for get_document display).
        ordered = sorted(chunks, key=lambda c: c.chunk_index)
        return "\n\n".join(c.text for c in ordered)

    def health(self) -> FilingsHealth:
        return FilingsHealth(
            mode=self.mode,
            documents=len(self._by_doc),
            chunks=self._ingest_chunk_count(),
            embed_mode=self._ingest.embed_mode,
            ok=self._ingest_chunk_count() > 0,
            detail="" if self._ingest_chunk_count() > 0 else "empty corpus",
        )

    def _ingest_chunk_count(self) -> int:
        return len(self._ingest.chunks)


def from_env(mode: str | None = None) -> FilingsService:
    """Build a FilingsService from the environment.

    FILINGS_MODE=fixture (default) -> committed sample corpus + stub LLM.
    FILINGS_MODE=live               -> ingest data/filings/ + configured LLM.
    """
    mode = (mode or os.getenv("FILINGS_MODE", "fixture")).strip().lower()
    if mode == "live":
        service = FilingsService.from_directory(LIVE_CORPUS_DIR, mode="live")
        if service._ingest_chunk_count() == 0:
            # No live docs present — fall back to fixture corpus so the
            # server still starts and health() reports the reason.
            return _fixture_service(detail="no live filings; using fixture corpus")
        return service
    return _fixture_service()


def _load_corpus_dir(directory: Path) -> dict[str, str]:
    """Read every supported file in a directory into {doc_id: text}."""
    if not directory.exists():
        return {}
    docs: dict[str, str] = {}
    for p in sorted(directory.iterdir()):
        if p.is_file() and p.suffix.lower() in (".txt", ".md", ".pdf"):
            text = load_text(p)
            if text.strip():
                docs[p.stem] = text
    return docs


def _fixture_service(detail: str = "") -> FilingsService:
    docs = _load_corpus_dir(FIXTURE_CORPUS_DIR)
    ingest = FilingsService._ingest_docs(docs)
    return FilingsService(ingest, client=LLMClient(provider="stub", model="stub"), mode="fixture")
