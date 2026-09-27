"""Tests for the ai-infra-watch synthesis pipeline.

Covers the two acceptance-criteria tests from the roadmap:
  * test_synthesis_parses_json     — output is valid JSON matching schema
  * test_ticker_mentions_are_valid — mentioned tickers are real (data/tickers.csv)

Runs in stub mode by default (CI_USE_STUB_LLM=true / LLM_PROVIDER=stub),
using committed fixture responses so it is deterministic and offline.
"""
from __future__ import annotations

import re

import pytest

from app.assertions.semantic import (
    assert_matches_schema,
    assert_no_hallucination,
    assert_semantically_similar,
)
from app.synthesis.pipeline import MarketSynthesis, build_prompt, synthesize


def test_synthesis_parses_json(llm_client, sample_stock_data):
    """The synthesis output is valid JSON conforming to MarketSynthesis."""
    result = synthesize(sample_stock_data, client=llm_client)
    # synthesize() already returns a validated model; re-assert on the
    # serialized form to exercise assert_matches_schema end to end.
    validated = assert_matches_schema(result.model_dump(), MarketSynthesis)
    assert isinstance(validated, MarketSynthesis)
    assert validated.summary.strip()
    assert validated.insights, "expected at least one ticker insight"


def test_ticker_mentions_are_valid(llm_client, sample_stock_data, tickers):
    """Every ticker in the synthesis output is a real symbol.

    Uses data/tickers.csv as the source of truth. Guards against the
    model inventing symbols (a common hallucination mode)."""
    assert tickers, "data/tickers.csv produced no symbols"
    result = synthesize(sample_stock_data, client=llm_client)

    mentioned = {i.ticker.upper() for i in result.insights}
    unknown = mentioned - tickers
    assert not unknown, f"synthesis mentioned unknown tickers: {sorted(unknown)}"

    # Also scan the free-text summary for $TICKER or bare uppercase tokens
    # that look like tickers but aren't in our universe.
    candidates = set(re.findall(r"\b[A-Z]{3,5}\b", result.summary))
    # Allow common English all-caps words that are not tickers.
    allow = {"AI", "GPU", "CEO", "USD", "SEC", "CPU", "HPC", "YOY", "USA"}
    suspicious = {c for c in candidates if c not in tickers and c not in allow}
    assert not suspicious, f"summary contains suspicious ticker-like tokens: {sorted(suspicious)}"


def test_summary_semantically_matches_expected(llm_client, sample_stock_data):
    """The summary is semantically close to a known-good reference."""
    result = synthesize(sample_stock_data, client=llm_client)
    expected = "NVIDIA rose on a new data center GPU while Digi Power X gained on a data center deal and Nebius slipped."
    assert_semantically_similar(result.summary, expected, threshold=0.6)


def test_no_hallucinated_claims(llm_client, sample_stock_data):
    """Every claim in the summary is grounded in the input news (heuristic)."""
    result = synthesize(sample_stock_data, client=llm_client)
    sources = []
    for row in sample_stock_data:
        sources.extend(row.get("news", []))
        sources.append(f"{row['name']} ({row['symbol']}) moved {row['change_pct']}%.")
    # Heuristic check — see assertions.semantic docstring for limitations.
    assert_no_hallucination(result.summary, sources, threshold=0.2)


@pytest.mark.live
def test_live_provider_smoke(sample_stock_data):
    """Only runs with a real API key (pytest -m live). Skipped in stub mode."""
    from app.config import settings

    if settings.STUB_MODE or settings.LLM_PROVIDER == "stub":
        pytest.skip("stub mode: live provider test skipped")
    result = synthesize(sample_stock_data)
    assert result.insights


# --- question-conditioned synthesis (#4) -----------------------------------


def test_empty_question_prompt_is_byte_identical(sample_stock_data):
    """The default (question="") prompt must be byte-for-byte the historical
    prompt, so every committed stub fixture that was generated question-less
    (the SAMPLE + market-agent path) still hits its cached response."""
    baseline = build_prompt(sample_stock_data)
    assert build_prompt(sample_stock_data, question="") == baseline
    # Whitespace-only is treated as no question (no focus block).
    assert build_prompt(sample_stock_data, question="   \n  ") == baseline


def test_question_changes_prompt(sample_stock_data):
    """A non-empty question injects a focus block, so identical data with
    different questions produces distinct prompts (distinct fixture hashes)."""
    baseline = build_prompt(sample_stock_data)
    qa = build_prompt(sample_stock_data, question="Why did NVDA move?")
    qb = build_prompt(sample_stock_data, question="What are the risks to DGXX?")

    assert qa != baseline, "question should alter the prompt"
    assert qb != baseline
    assert qa != qb, "different questions should produce different prompts"
    # The focus block names the question so synthesis can ground its answer.
    assert "Why did NVDA move?" in qa
    assert "What are the risks to DGXX?" in qb


@pytest.mark.live
def test_live_question_responsive_synthesis(sample_stock_data):
    """With a real provider, a targeted question yields schema-valid output.

    Grades real query-conditioned generation (skipped in stub mode)."""
    from app.config import settings

    if settings.STUB_MODE or settings.LLM_PROVIDER == "stub":
        pytest.skip("stub mode: live question-responsive test skipped")
    result = synthesize(sample_stock_data, question="Why did NVDA move today?")
    assert_matches_schema(result.model_dump(), MarketSynthesis)
    assert result.summary.strip()
