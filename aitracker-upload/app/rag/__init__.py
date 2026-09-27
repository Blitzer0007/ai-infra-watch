"""RAG layer for ai-infra-watch.

Modules
-------
schemas       — Chunk / RetrievedChunk / CitedAnswer data model
chunker       — overlapping-sentence text chunking
ingest        — files (txt/md/pdf) -> embedded chunks
vector_store  — VectorStore interface + numpy MemoryVectorStore
retriever     — hybrid BM25 + vector with RRF fusion (+ optional rerank)
generator     — retrieval-augmented answer synthesis with citations
"""
from app.rag.chunker import Chunker, chunk_document, split_sentences
from app.rag.generator import Generator, build_rag_prompt, format_citations
from app.rag.ingest import IngestResult, ingest_directory, ingest_paths, ingest_texts, load_text
from app.rag.retriever import Retriever, SearchCorpus, build_corpus
from app.rag.schemas import Chunk, CitedAnswer, RetrievedChunk
from app.rag.vector_store import MemoryVectorStore

__all__ = [
    "Chunk",
    "RetrievedChunk",
    "CitedAnswer",
    "Chunker",
    "chunk_document",
    "split_sentences",
    "IngestResult",
    "ingest_texts",
    "ingest_paths",
    "ingest_directory",
    "load_text",
    "MemoryVectorStore",
    "Retriever",
    "SearchCorpus",
    "build_corpus",
    "Generator",
    "build_rag_prompt",
    "format_citations",
]
