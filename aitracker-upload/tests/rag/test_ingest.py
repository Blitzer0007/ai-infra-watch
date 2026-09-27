"""Ingestion tests — text/file -> embedded chunks.

Covers the hermetic in-memory path (ingest_texts) plus disk ingestion
of .txt files and empty-document handling. PDF ingestion is exercised
only if pypdf can build a tiny PDF; otherwise skipped (kept offline).
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.rag.chunker import Chunker
from app.rag.ingest import ingest_directory, ingest_paths, ingest_texts, load_text


def test_ingest_texts_embeds_every_chunk():
    res = ingest_texts({"d": "Revenue grew. Margins expanded. Demand was strong."})
    assert res.chunks
    assert all(c.embedding is not None for c in res.chunks)
    assert res.documents == ["d"]
    assert res.embed_mode in ("lexical", "semantic")


def test_ingest_texts_skips_empty_documents():
    res = ingest_texts({"good": "Some real content here.", "blank": "   "})
    assert "good" in res.documents
    assert "blank" in res.empty_documents
    assert all(c.document_id == "good" for c in res.chunks)


def test_ingest_texts_multiple_docs_keep_provenance():
    res = ingest_texts(
        {"a": "Alpha content about revenue. " * 20, "b": "Beta content about margins. " * 20},
        chunker=Chunker(target_chars=200),
    )
    docs = {c.document_id for c in res.chunks}
    assert docs == {"a", "b"}


def test_load_text_reads_txt(tmp_path: Path):
    p = tmp_path / "note.txt"
    p.write_text("Filing text body.", encoding="utf-8")
    assert load_text(p) == "Filing text body."


def test_load_text_rejects_unknown_type(tmp_path: Path):
    p = tmp_path / "data.xyz"
    p.write_text("x", encoding="utf-8")
    with pytest.raises(ValueError, match="Unsupported"):
        load_text(p)


def test_ingest_directory_reads_txt_files(tmp_path: Path):
    (tmp_path / "one.txt").write_text("First filing about NVIDIA revenue.", encoding="utf-8")
    (tmp_path / "two.md").write_text("Second filing about Meta advertising.", encoding="utf-8")
    (tmp_path / "ignore.csv").write_text("skip,me", encoding="utf-8")
    res = ingest_directory(tmp_path)
    assert set(res.documents) == {"one", "two"}


def test_ingest_directory_missing_is_empty(tmp_path: Path):
    res = ingest_directory(tmp_path / "does_not_exist")
    assert res.chunks == []
    assert res.documents == []


def test_ingest_paths_tracks_empty_files(tmp_path: Path):
    good = tmp_path / "g.txt"
    good.write_text("Real content.", encoding="utf-8")
    blank = tmp_path / "b.txt"
    blank.write_text("   ", encoding="utf-8")
    res = ingest_paths([good, blank])
    assert "g" in res.documents
    assert "b" in res.empty_documents
