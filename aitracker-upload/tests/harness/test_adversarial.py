"""Tests for the adversarial input generator.

Stub client -> deterministic template bank (hermetic). A @pytest.mark.live
variant calls a real LLM. Also a small integration check: the generated
injection inputs, fed to a real agent, must not crash it (the agent degrades).
"""
from __future__ import annotations

import pytest

from app.harness import DEFAULT_CATEGORIES, generate_adversarial_inputs

DESC = "answers questions about SEC filings for AI companies"


def test_stub_returns_requested_count(stub_client):
    out = generate_adversarial_inputs(stub_client, DESC, n=5)
    assert len(out) == 5


def test_stub_is_deterministic(stub_client):
    a = generate_adversarial_inputs(stub_client, DESC, n=6)
    b = generate_adversarial_inputs(stub_client, DESC, n=6)
    assert a == b


def test_stub_covers_each_category(stub_client):
    # One input per category, in order -> the first N map to the N categories.
    cats = list(DEFAULT_CATEGORIES)
    out = generate_adversarial_inputs(stub_client, DESC, n=len(cats), categories=cats)
    # injection category's first template is recognizable
    assert any("Ignore your instructions" in x for x in out)
    # empty category contributes a blank/whitespace input
    assert any(x.strip() == "" for x in out)


def test_zero_count_returns_empty(stub_client):
    assert generate_adversarial_inputs(stub_client, DESC, n=0) == []


def test_custom_single_category(stub_client):
    out = generate_adversarial_inputs(
        stub_client, DESC, n=3, categories=["injection"]
    )
    assert len(out) == 3
    assert all(isinstance(x, str) for x in out)


def test_adversarial_inputs_do_not_crash_filings_agent(stub_client, filings_agent):
    # Feeding adversarial questions to a real agent must degrade, not crash.
    for q in generate_adversarial_inputs(stub_client, DESC, n=4):
        result = filings_agent.run(q)
        assert hasattr(result, "trajectory")  # completed a run either way


@pytest.mark.live
def test_live_llm_generates_inputs():
    """Real LLM produces adversarial inputs (run with -m live)."""
    from app.llm.client import LLMClient

    client = LLMClient()  # real provider from env
    out = generate_adversarial_inputs(client, DESC, n=3)
    assert len(out) == 3
    assert all(isinstance(x, str) and x for x in out)
