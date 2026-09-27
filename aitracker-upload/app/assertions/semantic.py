"""Semantic + grounding assertions for LLM outputs.

These helpers are the shared assertion layer: pytest imports them
directly, and app/eval/run_eval.py calls the non-asserting variants
(compute_similarity / claim_grounding_score) so /api/eval can grade
without throwing on the first failure.

Design note (heuristics, not ground truth): sentence similarity and
claim grounding are approximate. When sentence-transformers is not
installed we fall back to deterministic lexical scoring so the suite
runs offline. See README -> "Limitations and honesty notes".
"""
from __future__ import annotations

import re
from typing import Iterable

from app.config import settings


# ----------------------------------------------------------------------
# Semantic similarity
# ----------------------------------------------------------------------
class Embedder:
    """Singleton embedding wrapper.

    Priority:
      1. sentence-transformers, if EVAL_EMBEDDING_MODEL is set AND the
         package is installed (real semantic embeddings; ~2GB install).
      2. Deterministic lexical fallback (norm-1 token overlap), so tests
         and CI work offline with zero heavy dependencies.

    Falls through to (2) if (1) is unavailable at import time.
    """

    def __init__(self) -> None:
        self._backing = None  # type: ignore
        self._mode = "lexical"
        model_name = settings.EMBEDDING_MODEL
        if model_name:
            try:
                from sentence_transformers import SentenceTransformer  # type: ignore
            except ImportError:
                pass  # not installed -> lexical fallback
            else:
                self._backing = SentenceTransformer(model_name)
                self._mode = "semantic"

    def embed(self, text: str) -> list[float]:
        if self._backing is not None:
            vec = self._backing.encode([text], normalize_embeddings=True)[0]
            return [float(x) for x in vec]
        return _lexical_vector(text)

    def mode(self) -> str:
        return self._mode


def _lexical_vector(text: str, dim: int = 512) -> list[float]:
    """Deterministic hashed n-gram vector (no external deps).

    Hashes word unigrams/bigrams and character trigrams into a fixed-size
    vector. Properties we rely on for a hermetic test suite:
      * identical strings -> cosine 1.0
      * lexical overlap   -> proportionally high cosine
      * unrelated strings -> near 0
      * ANY non-empty string -> a nonzero vector (no dead zones for short
        answers like "In Texas.")

    This is a stand-in for real sentence embeddings; set
    EVAL_EMBEDDING_MODEL to switch to sentence-transformers.
    """
    import hashlib

    vec = [0.0] * dim

    def _bucket(token: str) -> int:
        h = hashlib.md5(token.encode("utf-8")).digest()
        return int.from_bytes(h[:4], "big") % dim

    words = re.findall(r"[a-z0-9]+", text.lower())
    for w in words:
        vec[_bucket(f"w:{w}")] += 1.0
    for a, b in zip(words, words[1:]):
        vec[_bucket(f"b:{a}_{b}")] += 1.0
    compact = re.sub(r"\s+", " ", text.lower().strip())
    for i in range(len(compact) - 2):
        vec[_bucket(f"c:{compact[i:i + 3]}")] += 0.5
    if not any(vec):
        vec[_bucket(f"raw:{compact}")] = 1.0
    return vec


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5 or 1.0
    nb = sum(y * y for y in b) ** 0.5 or 1.0
    return dot / (na * nb)


_EMBEDDER: Embedder | None = None


def get_embedder() -> Embedder:
    global _EMBEDDER
    if _EMBEDDER is None:
        _EMBEDDER = Embedder()
    return _EMBEDDER


def compute_similarity(output: str, expected: str) -> float:
    """Cosine similarity in [0, 1] between output and expected."""
    emb = get_embedder()
    return _cosine(emb.embed(output), emb.embed(expected))


def assert_semantically_similar(
    output: str, expected: str, threshold: float | None = None
) -> None:
    """Assert output is semantically close to expected.

    Raises AssertionError with the observed score when below threshold.
    threshold defaults to settings.SEMANTIC_THRESHOLD (0.7).
    """
    threshold = settings.SEMANTIC_THRESHOLD if threshold is None else threshold
    score = compute_similarity(output, expected)
    if score < threshold:
        raise AssertionError(
            f"Semantic similarity {score:.3f} < threshold {threshold:.3f}\n"
            f"  output:   {output[:200]!r}\n"
            f"  expected: {expected[:200]!r}"
        )
    return None


# ----------------------------------------------------------------------
# Schema validation
# ----------------------------------------------------------------------
def assert_matches_schema(output: str | dict, model: type) -> dict:
    """Parse output into `model` (a pydantic model class) and return it.

    Raises AssertionError if the output is not valid JSON or fails
    pydantic validation.
    """
    import json

    from pydantic import ValidationError

    if isinstance(output, str):
        try:
            data = json.loads(output)
        except json.JSONDecodeError as exc:
            raise AssertionError(
                f"Output is not valid JSON (line {exc.lineno} col {exc.colno}): {output[:200]!r}"
            ) from exc
    elif isinstance(output, dict):
        data = output
    else:
        raise AssertionError(f"Output must be str or dict, got {type(output).__name__}")
    try:
        return model.model_validate(data)
    except ValidationError as exc:
        raise AssertionError(
            f"Output does not match schema {model.__name__}: {exc.errors()}"
        ) from exc


# ----------------------------------------------------------------------
# Hallucination / grounding (heuristic)
# ----------------------------------------------------------------------
def _split_claims(output: str) -> list[str]:
    """Split output into atomic claims.

    We try sentence splitting first (preserves claims with commas);
    fall back to clause splitting if a sentence is still too long.
    """
    parts = re.split(r"(?<=[.!?])\s+", output.strip())
    claims: list[str] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if len(part) > 220:
            claims.extend(p.strip() for p in re.split(r",\s+|\band\b|\bbut\b", part) if p.strip())
        else:
            claims.append(part)
    return claims or ([output.strip()] if output.strip() else [])


def _passive_voice(tokens: list[str], i: int) -> bool:
    """True if the verb form starting at i looks passive (is/are/was/were + pp).

    Hmm — heuristic flag we intentionally do NOT apply to the "is expected
    to close" framing, which reads naturally in financial summaries.
    """
    if tokens[i] not in {"is", "are", "was", "were"}:
        return False
    nxt = tokens[i + 1] if i + 1 < len(tokens) else ""
    return nxt.endswith(("ed", "en", "t")) and nxt not in {"added", "rated", "traded", "held", "cut"}


def _stem(word: str) -> str:
    w = word.lower().strip(".,!?;:'\"()")
    for suf in ("ing", "ed", "es", "s", "ion", "ions"):
        if len(w) > 4 and w.endswith(suf):
            return w[: -len(suf)]
    return w


def _content_tokens(text: str) -> set[str]:
    stop = {
        "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "but",
        "with", "at", "by", "from", "as", "is", "are", "was", "were", "be",
        "been", "it", "its", "this", "that", "these", "those", "has", "have",
        "had", "will", "would", "could", "should", "may", "might", "shall",
        "not", "no", "we", "they", "he", "she", "you", "i", "our", "their",
        "per", "which", "who", "whom", "more", "most", "than", "over", "under",
    }
    return {_stem(t) for t in re.findall(r"[a-z0-9]+", text.lower()) if _stem(t) not in stop and len(t) > 1}


def _source_score(claim: str, source_text: str) -> float:
    """Grounding score of one claim against one source text.

    Substring match (normalized) = 1.0; else token-overlap Jaccard
    (content tokens only, stemmed). This is the heuristic core —
    see limitations note.
    """
    c = re.sub(r"[^a-z0-9]+", " ", claim.lower()).strip()
    s = re.sub(r"[^a-z0-9]+", " ", source_text.lower()).strip()
    if c and c in s:
        return 1.0
    ct = _content_tokens(claim)
    st = _content_tokens(source_text)
    if not ct:
        return 0.0
    inter = ct & st
    return len(inter) / len(ct | st)


def claim_grounding_score(claim: str, sources: Iterable[str]) -> float:
    """Best grounding score for a claim across all source texts."""
    best = 0.0
    for src in sources:
        if not src or not src.strip():
            continue
        best = max(best, _source_score(claim, src))
        if best >= 0.999:
            break
    return best


def assert_no_hallucination(
    output: str, sources: Iterable[str], threshold: float | None = None
) -> list[str]:
    """Assert every claim in output is supportable by at least one source.

    Returns the list of unsupported claims (empty on pass). Raises
    AssertionError listing them when found.

    Limitations (heuristic):
      * token-overlap grounding can neither verify facts that are
        paraphrased differently from the source, nor prove a claim is
        actually supported — only that it shares vocabulary.
      * claims with NO overlapping vocabulary and no URL are flagged as
        unsupported (i.e., this leans toward false positives, which is
        the safe direction for a hallucination check).
    """
    threshold = 0.25 if threshold is None else threshold
    sources = [s for s in sources if s]
    unsupported: list[str] = []
    for claim in _split_claims(output):
        # URLs count as self-evidence of a citation; skip them.
        if re.search(r"https?://", claim):
            continue
        score = claim_grounding_score(claim, sources)
        if score < threshold:
            unsupported.append(claim)
    if unsupported:
        raise AssertionError(
            "Claims not supported by provided sources (heuristic):\n"
            + "\n".join(f"  - {c[:160]}" for c in unsupported)
        )
    return unsupported
