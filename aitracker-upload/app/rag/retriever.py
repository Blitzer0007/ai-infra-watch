"""Retriever — hybrid BM25 + vector search with RRF fusion.

The retriever combines two signals:

  * **BM25** (lexical) over the raw chunk text — catches exact
    tickers, fiscal terms ("10-K", "revenue"), and phrasings that
    embeddings blur.
  * **Vector** (semantic) over chunk embeddings — catches paraphrase
    ("the company's top line" ~ "revenue") that BM25 misses.

Scores are fused with **Reciprocal Rank Fusion** (RRF), which is
robust to the two systems having incomparable score scales: each list
contributes `1 / (k + rank)` per hit, so a hit ranked #2 in BM25 but
#10 in vector still scores well. The fused list is then optionally
re-ranked by a cross-encoder if sentence-transformers is installed
(determined by `get_embedder().mode()`).

Design notes
------------
* Embedding is done by `app.assertions.semantic.get_embedder()`, the
  same singleton the assertion layer uses — one embedding model for
  the whole app. In lexical mode (sentence-transformers absent) the
  vector arm uses the deterministic lexical hashed vectors; the BM25
  arm still carries the retrieval, so hybrid quality holds offline.
* The corpus is built once via `build_corpus(chunks)` and queried
  many times; `SearchCorpus` is immutable after construction.
* `rerank` is off by default (pure RRF), enabled by passing
  `rerank=True`; it requires the cross-encoder model which is only
  present when sentence-transformers is installed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

import numpy as np
from rank_bm25 import BM25Okapi

from app.assertions.semantic import get_embedder
from app.rag.schemas import Chunk, RetrievedChunk
from app.rag.vector_store import MemoryVectorStore


_STOP = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for",
    "with", "at", "by", "from", "as", "is", "are", "was", "were", "be",
    "been", "it", "its", "this", "that", "these", "those", "has", "have",
    "had", "will", "would", "could", "should", "may", "might", "shall",
    "not", "no", "we", "they", "he", "she", "you", "i", "our", "their",
}


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOP]


@dataclass
class Retriever:
    """Hybrid retriever over a pre-built corpus."""

    corpus: "SearchCorpus"
    rrf_k: int = 60
    top_k: int = 5
    rerank: bool = False

    def retrieve(self, query: str) -> list[RetrievedChunk]:
        """Rank chunks by fused BM25+vector score, return top_k."""
        bm25_hits = self.corpus.bm25(query, self.top_k * 3)
        vec_hits = self.corpus.vector(query, self.top_k * 3)
        fused = _rrf_fuse(bm25_hits, vec_hits, rrf_k=self.rrf_k)
        fused = sorted(fused, key=lambda rc: rc.score, reverse=True)[: self.top_k]
        for rank, rc in enumerate(fused, start=1):
            rc.rank = rank
        if self.rerank:
            return self._rerank(fused)
        return fused

    def _rerank(self, fused: list[RetrievedChunk]) -> list[RetrievedChunk]:
        """Cross-encoder rerank (only when sentence-transformers present)."""
        try:
            from sentence_transformers import CrossEncoder  # type: ignore
        except ImportError:
            return fused  # graceful: fall back to fused order
        model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
        pairs = [(self.corpus.query, rc.chunk.text) for rc in fused]
        scores = model.predict(pairs)
        for rc, s in zip(fused, scores):
            rc.score = float(s)
            rc.source = "rerank"
        reranked = sorted(fused, key=lambda rc: rc.score, reverse=True)
        for rank, rc in enumerate(reranked, start=1):
            rc.rank = rank
        return reranked


@dataclass
class SearchCorpus:
    """Immutable index of chunks + the two retrieval arms."""

    chunks: list[Chunk]
    query: str = ""
    _bm25: BM25Okapi = field(init=False, repr=False, default=None)
    _vec_store: VectorStore = field(init=False, repr=False, default=None)

    def __post_init__(self) -> None:
        # Index the context-prefixed text (company identity with every
        # chunk) for BOTH arms; answers still cite the clean `text`.
        self._bm25 = BM25Okapi([_tokens(c.indexed()) for c in self.chunks])
        self._vec_store = MemoryVectorStore()
        self._vec_store.add(self.chunks)

    def bm25(self, query: str, top_k: int) -> list[RetrievedChunk]:
        scores = self._bm25.get_scores(_tokens(query))
        top = np.argsort(-scores)[:top_k]
        return [
            RetrievedChunk(
                chunk=self.chunks[i],
                score=float(scores[i]),
                rank=r + 1,
                source="bm25",
                document_id=self.chunks[i].document_id,
            )
            for r, i in enumerate(top)
            if scores[i] > 0
        ]

    def vector(self, query: str, top_k: int) -> list[RetrievedChunk]:
        emb = get_embedder().embed(query)
        hits = self._vec_store.query(emb, top_k)
        return [
            RetrievedChunk(
                chunk=c, score=s, rank=r + 1, source="vector", document_id=c.document_id
            )
            for r, (c, s) in enumerate(hits)
        ]


def build_corpus(chunks: list[Chunk], query: str = "") -> SearchCorpus:
    """Build a searchable corpus from a flat chunk list."""
    return SearchCorpus(chunks=chunks, query=query)


def _rrf_fuse(
    *lists: list[RetrievedChunk],
    rrf_k: int = 60,
) -> list[RetrievedChunk]:
    """Fuse ranked lists by Reciprocal Rank Fusion (RRF).

    Each chunk accumulates `1 / (rrf_k + rank)` from each list in which
    it appears; the fused score is the sum. Lists can be of different
    lengths and the fusion is insensitive to score scale — this is the
    standard RRF formulation.
    """
    scores: dict[int, float] = {}
    chunk_by_id: dict[int, Chunk] = {}
    for lst in lists:
        for rank, rc in enumerate(lst, start=1):
            cid = id(rc.chunk)
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (rrf_k + rank)
            chunk_by_id[cid] = rc.chunk
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    return [
        RetrievedChunk(
            chunk=chunk_by_id[cid],
            score=s,
            rank=i + 1,
            source="fused",
            document_id=chunk_by_id[cid].document_id,
        )
        for i, (cid, s) in enumerate(ranked)
    ]
