"""RAG generator — retrieval-augmented answer synthesis with citations.

Pipeline: retrieve top-k chunks for the question -> build a prompt
that instructs the model to answer ONLY from the provided context and
to cite each sentence with bracket numbers -> LLM generate -> attach
citations and a sources footer -> return a `CitedAnswer`.

The provider-agnostic `LLMClient` (stub/real, cached) is reused, so
tests run offline against committed fixtures exactly like the rest of
the app. The answer text is validated with the existing
`assert_no_hallucination` grounding heuristic in tests.
"""
from __future__ import annotations

from app.llm.client import LLMClient
from app.rag.retriever import Retriever
from app.rag.schemas import CitedAnswer, RetrievedChunk


SYSTEM_CONTEXT = (
    "You are a research analyst for AI-infra-watch answering questions "
    "about SEC filings and company documents. Answer ONLY from the "
    "provided context chunks. If the context does not contain the answer, "
    "say so explicitly. Cite the source chunk for every factual claim "
    "using [n] where n is the chunk number in the context. Do not invent "
    "numbers, dates, or facts."
)


def build_rag_prompt(question: str, chunks: list[RetrievedChunk]) -> str:
    """Format the question + retrieved chunks into the RAG prompt."""
    parts = [f"Context:\n"]
    for i, rc in enumerate(chunks, start=1):
        parts.append(f"[{i}] {rc.chunk.text}")
    parts.append(f"\nQuestion: {question}")
    parts.append(
        "\nAnswer with citations like '[1]' after each claim. "
        "If the context does not contain the answer, respond 'I cannot "
        "answer this from the provided documents.'"
    )
    return "\n".join(parts)


def format_citations(chunks: list[RetrievedChunk]) -> str:
    """Build a 'Sources:' footer listing the source documents."""
    seen: dict[str, str] = {}
    for rc in chunks:
        seen.setdefault(rc.document_id, rc.chunk.text[:60] + ("..." if len(rc.chunk.text) > 60 else ""))
    lines = [f"[{i+1}] {doc} — {snippet}" for i, (doc, snippet) in enumerate(seen.items())]
    return "Sources: " + "; ".join(lines)


class Generator:
    """Turn a question into a cited answer over a corpus."""

    def __init__(self, retriever: Retriever, client: LLMClient | None = None) -> None:
        self.retriever = retriever
        self.client = client or LLMClient()

    def answer(self, question: str, top_k: int | None = None) -> CitedAnswer:
        k = top_k or self.retriever.top_k
        chunks = self.retriever.retrieve(question)[:k]
        prompt = build_rag_prompt(question, chunks)
        raw = self.client.generate(prompt)
        return CitedAnswer(
            answer=raw,
            citations=chunks,
            sources_footer=format_citations(chunks),
        )
