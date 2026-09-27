"""Retriever tests — hybrid BM25 + vector + RRF fusion.

The key accuracy property: for a corpus of distinct company filings,
a question about company X ranks X's chunk first. We also pin the RRF
mechanics (fusion rewards agreement across arms) and the BM25/vector
arms individually.
"""
from __future__ import annotations

from app.rag.chunker import Chunker
from app.rag.ingest import ingest_texts
from app.rag.retriever import Retriever, build_corpus


# Four short, well-separated documents.
DOCS = {
    "nvidia": (
        "NVIDIA designs GPUs for AI data centers. Data center revenue grew "
        "forty percent to a record level. Demand for Blackwell chips from "
        "hyperscalers was strong. Gross margin expanded to seventy-five percent."
    ),
    "meta": (
        "Meta operates Facebook and Instagram social platforms. Advertising "
        "revenue was the primary driver this quarter. Reality Labs posted an "
        "operating loss on virtual reality investments."
    ),
    "broadcom": (
        "Broadcom designs custom AI accelerators called XPUs for hyperscale "
        "customers. It also sells Ethernet networking switches for AI clusters. "
        "The VMware acquisition boosted infrastructure software revenue."
    ),
    "microsoft": (
        "Microsoft Azure cloud revenue grew thirty percent year over year. "
        "AI services from the OpenAI partnership contributed to Azure growth. "
        "Capital expenditures rose to expand data center capacity."
    ),
}


def _corpus(target_chars: int = 200):
    res = ingest_texts(DOCS, chunker=Chunker(target_chars=target_chars))
    return build_corpus(res.chunks)


def test_retrieves_relevant_document_first():
    corpus = _corpus()
    cases = {
        "What are Blackwell chips used for?": "nvidia",
        "Which company owns Instagram?": "meta",
        "Who makes XPU accelerators?": "broadcom",
        "How fast did Azure grow?": "microsoft",
    }
    for question, expected_doc in cases.items():
        hits = Retriever(corpus, top_k=2).retrieve(question)
        assert hits, f"no hits for {question!r}"
        assert hits[0].document_id == expected_doc, (
            f"{question!r} -> {hits[0].document_id!r}, expected {expected_doc!r}"
        )


def test_retrieve_returns_at_most_top_k():
    corpus = _corpus()
    hits = Retriever(corpus, top_k=2).retrieve("AI data center revenue")
    assert len(hits) <= 2


def test_ranks_are_sequential():
    corpus = _corpus()
    hits = Retriever(corpus, top_k=3).retrieve("AI revenue growth")
    assert [h.rank for h in hits] == list(range(1, len(hits) + 1))


def test_bm25_arm_finds_exact_term():
    corpus = _corpus()
    hits = corpus.bm25("Blackwell", top_k=3)
    assert hits, "BM25 should find the exact term 'Blackwell'"
    assert hits[0].document_id == "nvidia"


def test_vector_arm_returns_hits():
    corpus = _corpus()
    hits = corpus.vector("graphics processing for artificial intelligence", top_k=3)
    assert hits
    assert all(h.source == "vector" for h in hits)


def test_fusion_beats_single_arm_on_agreement():
    """A doc top-ranked by BOTH arms should win the fused ranking."""
    corpus = _corpus()
    # "Blackwell hyperscalers" appears only in the nvidia doc: both arms agree.
    hits = Retriever(corpus, top_k=1).retrieve("Blackwell hyperscalers demand")
    assert hits[0].document_id == "nvidia"
    assert hits[0].source == "fused"
