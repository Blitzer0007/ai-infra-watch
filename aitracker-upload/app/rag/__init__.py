"""RAG layer for ai-infra-watch.

Public names remain available for local/RAG workloads, but heavy retrieval,
embedding, and generator dependencies are imported lazily so the lightweight
Vercel agent entrypoint does not pull numpy or sentence-transformers into its
serverless import graph.
"""
from __future__ import annotations

from importlib import import_module
from typing import Any

_LAZY: dict[str, tuple[str, str]] = {
    "Chunk": ("app.rag.schemas", "Chunk"),
    "RetrievedChunk": ("app.rag.schemas", "RetrievedChunk"),
    "CitedAnswer": ("app.rag.schemas", "CitedAnswer"),
    "Chunker": ("app.rag.chunker", "Chunker"),
    "chunk_document": ("app.rag.chunker", "chunk_document"),
    "split_sentences": ("app.rag.chunker", "split_sentences"),
    "IngestResult": ("app.rag.ingest", "IngestResult"),
    "ingest_texts": ("app.rag.ingest", "ingest_texts"),
    "ingest_paths": ("app.rag.ingest", "ingest_paths"),
    "ingest_directory": ("app.rag.ingest", "ingest_directory"),
    "load_text": ("app.rag.ingest", "load_text"),
    "MemoryVectorStore": ("app.rag.vector_store", "MemoryVectorStore"),
    "Retriever": ("app.rag.retriever", "Retriever"),
    "SearchCorpus": ("app.rag.retriever", "SearchCorpus"),
    "build_corpus": ("app.rag.retriever", "build_corpus"),
    "Generator": ("app.rag.generator", "Generator"),
    "build_rag_prompt": ("app.rag.generator", "build_rag_prompt"),
    "format_citations": ("app.rag.generator", "format_citations"),
}

__all__ = list(_LAZY)


def __getattr__(name: str) -> Any:
    """Resolve public RAG exports only when a caller actually uses them."""
    target = _LAZY.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr_name = target
    value = getattr(import_module(module_name), attr_name)
    globals()[name] = value
    return value
