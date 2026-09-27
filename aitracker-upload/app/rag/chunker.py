"""Document chunking for the RAG layer.

Pure text in / text out — no dependencies. The chunker operates on
the extracted text of a document (a PDF page blob, an earnings-call
transcript, a filing text dump) and splits it into overlapping
`Chunk`s with stable provenance.

Chunking strategy (deterministic, no model involved):
  * sentences are split on `[.!?]` + whitespace (keeps decimals like
    "3.14" intact because the lookbehind requires the period to be
    followed by whitespace/end);
  * sentences are accumulated into chunks of `target_chars` (± tolerance);
  * each chunk overlaps the previous by `overlap_chars` worth of
    sentences, so a claim split across a boundary still lands wholly
    inside at least one chunk;
  * chunks keep `document_id` + `chunk_index` for citation.

The 3-char token heuristic and the char-based sizing are intentionally
kept simple — re-chunking with a model (e.g. semantic chunking) is a
later milestone and would slot in behind the same `Chunk` type.
"""
from __future__ import annotations

import re

from app.rag.schemas import Chunk


# Sentence-ending punctuation followed by whitespace. Python `re` can't
# do variable-width lookbehind, so we split on (punct)(whitespace) and
# re-join fragments that weren't real boundaries. A period inside a
# number ("3.14") is safe automatically — it has no trailing whitespace,
# so it never splits here. The remaining case is abbreviations, which we
# handle with a small known set.
_SENTENCE_SPLIT_RE = re.compile(r"([.!?]['\")]?)(\s+)")
_ABBREVIATIONS = {
    "mr", "mrs", "ms", "dr", "prof", "inc", "corp", "ltd", "co", "vs",
    "etc", "e.g", "i.e", "u.s", "u.k", "no", "fig", "jan", "feb", "mar",
    "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
}


def split_sentences(text: str) -> list[str]:
    """Split text into sentences.

    `[.!?]` + whitespace ends a sentence, EXCEPT when the token before
    the period is a known abbreviation ("Mr.", "Inc.", "U.S."). A period
    inside a number ("3.14") never splits because it has no trailing
    whitespace to match on.
    """
    parts = _SENTENCE_SPLIT_RE.split(text)
    # re.split with two capture groups -> stride-3 layout:
    #   [seg0, punct0, ws0, seg1, punct1, ws1, ..., segN]
    sentences: list[str] = []
    current = parts[0]
    i = 1
    while i < len(parts) - 1:
        punct, ws, seg = parts[i], parts[i + 1], parts[i + 2]
        current += punct
        last_token = re.search(r"([A-Za-z.]+)$", current[:-1])
        abbrev = bool(last_token) and last_token.group(1).rstrip(".").lower() in _ABBREVIATIONS
        if abbrev:
            current += ws + seg  # not a boundary — keep accumulating
        else:
            sentences.append(current.strip())
            current = seg
        i += 3
    if current.strip():
        sentences.append(current.strip())
    return [s for s in sentences if s]


class Chunker:
    """Overlapping-sentence chunker.

    Parameters
    ----------
    target_chars : int
        Preferred chunk size in characters (~300 tokens).
    overlap_chars : int
        How much overlap between consecutive chunks, in characters.
        Defaults to 10% of target_chars.
    """

    def __init__(self, target_chars: int = 1200, overlap_chars: int | None = None) -> None:
        if target_chars < 200:
            raise ValueError("target_chars must be >= 200")
        self.target_chars = target_chars
        self.overlap_chars = overlap_chars if overlap_chars is not None else max(100, target_chars // 10)

    def chunk(self, text: str, document_id: str) -> list[Chunk]:
        """Split `text` into overlapping chunks for `document_id`.

        Sentences are accumulated into a window; when adding another
        sentence would exceed `target_chars`, we emit the window and
        start the next one from the overlap boundary (the tail of the
        window that covers ~`overlap_chars`). A sentence straddling a
        boundary is therefore present whole in at least one chunk.
        """
        sentences = split_sentences(text)
        if not sentences:
            return []
        if len(text) <= self.target_chars:
            return [Chunk(document_id=document_id, chunk_index=0, text=text.strip())]

        chunks: list[Chunk] = []
        i = 0
        chunk_index = 0
        while i < len(sentences):
            window_start = i
            buf: list[str] = []
            size = 0
            j = i
            while j < len(sentences):
                s = sentences[j]
                if buf and size + len(s) > self.target_chars + self.overlap_chars:
                    break
                buf.append(s)
                size += len(s) + 1
                j += 1
            if not buf:  # single sentence larger than the whole window
                buf.append(sentences[i])
                j = i + 1

            chunks.append(
                Chunk(
                    document_id=document_id,
                    chunk_index=chunk_index,
                    text=" ".join(buf).strip(),
                )
            )
            chunk_index += 1

            if j >= len(sentences):
                break  # emitted the final window

            # Advance: next window starts at the first sentence of the
            # carry (the tail of `buf` covering ~overlap_chars). The
            # carry never consumes the whole buffer — we always advance
            # at least one sentence past this window's start, so the
            # loop is guaranteed to terminate.
            carry_len = 0
            carry_count = 0
            for s in reversed(buf):
                if carry_count and carry_len + len(s) + 1 > self.overlap_chars:
                    break
                carry_count += 1
                carry_len += len(s) + 1
            i = max(window_start + 1, j - carry_count)

        return chunks


def chunk_document(text: str, document_id: str, target_chars: int = 1200) -> list[Chunk]:
    """Convenience wrapper: chunk one document with default settings."""
    return Chunker(target_chars=target_chars).chunk(text, document_id)
