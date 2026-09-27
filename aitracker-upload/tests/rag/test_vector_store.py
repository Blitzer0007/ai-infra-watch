"""Vector store tests — MemoryVectorStore exact cosine search.

Pins: normalized cosine ranking, top_k truncation, empty-store safety,
and the guard that rejects unembedded chunks.
"""
from __future__ import annotations

import math

import pytest

from app.rag.schemas import Chunk
from app.rag.vector_store import MemoryVectorStore


def _chunk(doc: str, idx: int, vec: list[float]) -> Chunk:
    return Chunk(document_id=doc, chunk_index=idx, text=f"{doc}#{idx}", embedding=tuple(vec))


def test_query_ranks_by_cosine():
    store = MemoryVectorStore()
    store.add([
        _chunk("d", 0, [1.0, 0.0, 0.0]),   # identical to query
        _chunk("d", 1, [0.0, 1.0, 0.0]),   # orthogonal
        _chunk("d", 2, [0.7, 0.7, 0.0]),   # 45 degrees
    ])
    hits = store.query([1.0, 0.0, 0.0], top_k=3)
    assert [c.chunk_index for c, _ in hits] == [0, 2, 1]
    assert hits[0][1] == pytest.approx(1.0, abs=1e-6)
    assert hits[2][1] == pytest.approx(0.0, abs=1e-6)


def test_top_k_truncates():
    store = MemoryVectorStore()
    store.add([_chunk("d", i, [float(i), 1.0]) for i in range(10)])
    hits = store.query([1.0, 1.0], top_k=3)
    assert len(hits) == 3


def test_empty_store_returns_empty():
    assert MemoryVectorStore().query([1.0, 0.0], top_k=5) == []


def test_add_rejects_unembedded_chunk():
    store = MemoryVectorStore()
    with pytest.raises(ValueError, match="no embedding"):
        store.add([Chunk(document_id="d", chunk_index=0, text="x")])


def test_count_tracks_additions():
    store = MemoryVectorStore()
    assert store.count() == 0
    store.add([_chunk("d", 0, [1.0, 2.0])])
    store.add([_chunk("d", 1, [3.0, 4.0])])
    assert store.count() == 2


def test_zero_vector_query_is_safe():
    """A zero query vector must not divide-by-zero."""
    store = MemoryVectorStore()
    store.add([_chunk("d", 0, [1.0, 1.0])])
    hits = store.query([0.0, 0.0], top_k=1)
    assert len(hits) == 1
    assert math.isfinite(hits[0][1])
