"""Chunker tests — sentence splitting + overlapping windowing.

These pin the deterministic chunking behavior the whole retrieval
layer depends on: stable provenance (document_id + chunk_index),
size bounds, overlap so a claim never falls solely across a boundary,
and termination on pathological (repeated-sentence) input.
"""
from __future__ import annotations

from app.rag.chunker import Chunker, chunk_document, split_sentences


# ---- sentence splitting ------------------------------------------------
def test_split_keeps_decimals_intact():
    sents = split_sentences("Revenue grew 3.14 percent. Margins held.")
    assert sents == ["Revenue grew 3.14 percent.", "Margins held."]


def test_split_handles_abbreviations():
    sents = split_sentences("Dr. Smith works at U.S. Bank. The stock rallied.")
    assert sents == ["Dr. Smith works at U.S. Bank.", "The stock rallied."]


def test_split_single_sentence_no_terminator():
    assert split_sentences("One sentence only") == ["One sentence only"]


def test_split_does_not_drop_final_sentence():
    sents = split_sentences("Sales rose. Costs fell. Profit up.")
    assert sents[-1] == "Profit up."


# ---- chunking ----------------------------------------------------------
def test_short_document_is_one_chunk():
    chunks = chunk_document("A short filing note.", "doc1")
    assert len(chunks) == 1
    assert chunks[0].document_id == "doc1"
    assert chunks[0].chunk_index == 0


def test_chunks_have_sequential_indices():
    text = " ".join(f"Sentence number {i} about revenue and margin." for i in range(60))
    chunks = Chunker(target_chars=300).chunk(text, "doc2")
    assert len(chunks) > 1
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_chunks_respect_size_bound():
    text = " ".join(f"Sentence {i} discusses data center revenue growth trends." for i in range(80))
    target = 400
    chunker = Chunker(target_chars=target)
    chunks = chunker.chunk(text, "doc3")
    # every chunk within target + overlap tolerance (allow slack for the
    # last sentence that pushes a window over before the break check)
    longest_sentence = max(len(s) for s in text.split(". "))
    for c in chunks:
        assert len(c.text) <= target + chunker.overlap_chars + longest_sentence


def test_chunks_overlap():
    """Consecutive chunks should share text (the overlap window)."""
    sentences = [f"Fact {i} about the quarterly results is stated here." for i in range(40)]
    text = " ".join(sentences)
    chunks = Chunker(target_chars=300, overlap_chars=120).chunk(text, "doc4")
    assert len(chunks) >= 2
    # the tail of chunk N should appear at the head region of chunk N+1
    overlaps = 0
    for a, b in zip(chunks, chunks[1:]):
        a_tail = a.text.split(". ")[-1][:20]
        if a_tail and a_tail in b.text:
            overlaps += 1
    assert overlaps >= 1, "expected at least one overlapping boundary"


def test_terminates_on_repeated_sentences():
    """Pathological input (all identical sentences) must not loop forever."""
    text = "The company reported strong results. " * 200
    chunks = Chunker(target_chars=400).chunk(text, "doc5")
    assert len(chunks) >= 1
    assert all(c.document_id == "doc5" for c in chunks)


def test_empty_text_yields_no_chunks():
    assert chunk_document("", "empty") == []
    assert chunk_document("   \n  ", "empty") == []
