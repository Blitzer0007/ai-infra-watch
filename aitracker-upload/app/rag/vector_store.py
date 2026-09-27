"""Vector store — interface + pure-Python backend.

Why a pure-Python backend? chromadb's native index (chroma-hnswlib, a
C++ extension) has no prebuilt wheel for this platform/Python and needs
an MSVC toolchain to build from source. Rather than couple the whole
RAG layer to that, we mirror the pattern already used by
`app.assertions.semantic.Embedder`: define an interface and ship a
dependency-light backend that works offline everywhere. A Chroma-backed
implementation is a drop-in behind `VectorStore` on a supported host.

`MemoryVectorStore` keeps embeddings in a numpy matrix and does exact
cosine search (fine for the thousands-of-chunks corpus this project
targets; swap to Chroma/HNSW for millions).
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

import numpy as np

from app.rag.schemas import Chunk


@runtime_checkable
class VectorStore(Protocol):
    """Minimal vector index the retriever depends on."""

    def add(self, chunks: list[Chunk]) -> None: ...

    def query(self, embedding: list[float], top_k: int) -> list[tuple[Chunk, float]]:
        """Return up to top_k (chunk, cosine_similarity) pairs, best first."""
        ...

    def count(self) -> int: ...


class MemoryVectorStore:
    """Exact cosine-search store backed by an in-memory numpy matrix.

    Vectors are L2-normalized on insert, so cosine similarity is a plain
    dot product. Chunks whose `embedding` is None are rejected — the
    caller must embed before adding (the ingest pipeline does).
    """

    def __init__(self) -> None:
        self._chunks: list[Chunk] = []
        self._matrix: np.ndarray | None = None  # shape (n, dim), normalized

    def add(self, chunks: list[Chunk]) -> None:
        vecs = []
        for c in chunks:
            if c.embedding is None:
                raise ValueError(
                    f"Chunk {c.document_id}#{c.chunk_index} has no embedding; "
                    f"embed chunks before add()."
                )
            vecs.append(np.asarray(c.embedding, dtype=np.float32))
            self._chunks.append(c)
        if not vecs:
            return
        block = np.vstack(vecs)
        block = _normalize_rows(block)
        self._matrix = block if self._matrix is None else np.vstack([self._matrix, block])

    def query(self, embedding: list[float], top_k: int) -> list[tuple[Chunk, float]]:
        if self._matrix is None or not self._chunks:
            return []
        q = _normalize_rows(np.asarray([embedding], dtype=np.float32))[0]
        sims = self._matrix @ q  # (n,) cosine similarities
        k = min(top_k, len(self._chunks))
        # argpartition for the top-k, then sort just those k.
        top_idx = np.argpartition(-sims, k - 1)[:k]
        top_idx = top_idx[np.argsort(-sims[top_idx])]
        return [(self._chunks[i], float(sims[i])) for i in top_idx]

    def count(self) -> int:
        return len(self._chunks)


def _normalize_rows(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return mat / norms
