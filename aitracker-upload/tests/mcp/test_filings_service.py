"""Unit tests for the filings FilingsService (transport-independent).

Hermetic: uses the committed fixture corpus + stub LLM. Exercises the
exact methods the MCP tools delegate to: search_filings, answer_question,
list_documents, get_document, health.
"""
from __future__ import annotations

import pytest

from app.rag.ingest import IngestResult
from mcp_servers.filings.schemas import AnswerResult, Citation, SearchResult
from mcp_servers.filings.service import FIXTURE_CORPUS_DIR, FilingsService, from_env


@pytest.fixture
def service() -> FilingsService:
    return from_env("fixture")


def test_from_env_fixture_loads_committed_corpus(service):
    assert service.health().ok is True
    assert service.health().documents >= 3  # nvda, msft, meta, avgo
    assert set(service.list_documents()) >= {
        "nvda_10k_fy2025",
        "msft_10k_fy2025",
        "meta_10k_fy2025",
        "avgo_10k_fy2025",
    }


def test_search_filings_returns_provenance(service):
    result = service.search_filings("data center revenue", top_k=3)
    assert isinstance(result, SearchResult)
    assert result.query == "data center revenue"
    assert result.hits
    for hit in result.hits:
        assert hit.document_id
        assert 0.0 <= hit.score <= 1.0
        assert hit.text


def test_search_filings_ranks_matching_document_first(service):
    result = service.search_filings("Blackwell GPU demand", top_k=5)
    assert result.hits[0].document_id == "nvda_10k_fy2025"


def test_search_filings_empty_query_raises(service):
    with pytest.raises(ValueError):
        service.search_filings("   ")


def test_answer_question_returns_cited_answer(service):
    result = service.answer_question("How much did NVIDIA data center revenue grow?")
    assert isinstance(result, AnswerResult)
    assert result.answer.strip()
    assert result.citations
    for c in result.citations:
        assert isinstance(c, Citation)
        assert c.document_id
    assert result.sources_footer.startswith("Sources:")


def test_answer_question_is_grounded_in_citations(service):
    """The answer must be supportable by its cited chunks (no hallucination).

    Uses the same claim-grounding heuristic the rest of the suite uses
    (app.assertions.semantic.claim_grounding_score) — this is the RAG
    grounding guardrail from the roadmap, applied to the stub answer.
    """
    from app.assertions.semantic import claim_grounding_score

    result = service.answer_question("How much did NVIDIA data center revenue grow?")
    sources = [c.text for c in result.citations]
    score = claim_grounding_score(result.answer, sources)
    assert score >= 0.25, (
        f"stub answer not grounded in cited chunks (score {score:.3f}): {result.answer!r}"
    )


def test_answer_question_empty_raises(service):
    with pytest.raises(ValueError):
        service.answer_question("")


def test_get_document_reconstructs_text(service):
    text = service.get_document("nvda_10k_fy2025")
    assert "NVIDIA" in text
    assert "Data Center" in text or "data center" in text


def test_get_document_unknown_raises(service):
    with pytest.raises(KeyError):
        service.get_document("does_not_exist")


def test_health_reports_corpus_shape(service):
    h = service.health()
    assert h.server == "mcp-server-filings"
    assert h.mode == "fixture"
    assert h.documents >= 3
    assert h.chunks >= h.documents  # at least one chunk per doc
    assert h.ok is True


def test_from_texts_builds_in_memory_service():
    svc = FilingsService.from_texts({"d": "Custom filing content about revenue. " * 10})
    assert svc.list_documents() == ["d"]
    hits = svc.search_filings("revenue", top_k=3)
    assert hits.hits and hits.hits[0].document_id == "d"
