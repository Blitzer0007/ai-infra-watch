"""Meta-tests for the assertion helpers themselves.

Roadmap Phase 1 step 10: "test that semantic similarity catches bad
outputs" — measure that the helpers accept good inputs and reject bad
ones. Keeps the eval layer honest.
"""
from __future__ import annotations

import pytest
from pydantic import BaseModel

from app.assertions.semantic import (
    assert_matches_schema,
    assert_no_hallucination,
    assert_semantically_similar,
    claim_grounding_score,
    compute_similarity,
)


class _Toy(BaseModel):
    ticker: str
    move_pct: float


# ---- semantic similarity ------------------------------------------------
def test_similar_texts_pass():
    """Paraphrases score higher than unrelated text, in both embedder modes.

    We assert a *relative* ordering plus a mode-aware floor rather than a
    single hard threshold. The offline lexical fallback cannot see that
    "NVIDIA/NVDA" or "rose/gained" are synonyms (no shared tokens), so a
    0.5 absolute bar is only honest with real sentence embeddings. Real
    embeddings (EVAL_EMBEDDING_MODEL set) clear 0.5 comfortably; the
    lexical fallback clears a lower floor but must still rank the
    paraphrase well above an unrelated sentence.
    """
    from app.assertions.semantic import get_embedder

    a = "NVIDIA rose on strong data center GPU demand."
    b = "NVDA gained thanks to robust data center GPU sales."
    unrelated = "The weather in Paris was rainy all weekend."

    para = compute_similarity(a, b)
    noise = compute_similarity(a, unrelated)

    # Ordering holds in every mode: a paraphrase must out-score noise.
    assert para > noise
    floor = 0.5 if get_embedder().mode() == "semantic" else 0.3
    assert para >= floor, f"paraphrase similarity {para:.3f} < floor {floor} ({get_embedder().mode()} mode)"


def test_dissimilar_texts_fail():
    a = "NVIDIA rose on strong data center GPU demand."
    b = "The weather in Paris was rainy all weekend."
    with pytest.raises(AssertionError):
        assert_semantically_similar(a, b, threshold=0.6)


# ---- schema -------------------------------------------------------------
def test_schema_accepts_valid_json():
    obj = assert_matches_schema('{"ticker": "NVDA", "move_pct": 3.2}', _Toy)
    assert obj.ticker == "NVDA"


def test_schema_rejects_bad_json():
    with pytest.raises(AssertionError):
        assert_matches_schema("not json at all", _Toy)


def test_schema_rejects_wrong_shape():
    with pytest.raises(AssertionError):
        assert_matches_schema('{"ticker": "NVDA"}', _Toy)  # missing move_pct


# ---- hallucination / grounding -----------------------------------------
def test_grounded_claim_passes():
    sources = ["NVIDIA announced a new data center GPU today."]
    # substring / high overlap -> supported
    assert claim_grounding_score("NVIDIA announced a new data center GPU", sources) > 0.5
    assert assert_no_hallucination("NVIDIA announced a new data center GPU.", sources) == []


def test_fabricated_claim_flagged():
    sources = ["NVIDIA announced a new data center GPU today."]
    with pytest.raises(AssertionError):
        assert_no_hallucination(
            "Apple acquired a quantum computing startup for 50 billion dollars.",
            sources,
        )
