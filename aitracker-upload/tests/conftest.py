"""Shared pytest fixtures for the LLM eval suite.

* llm_client   — provider-aware client; in CI (CI_USE_STUB_LLM=true) it
                 returns deterministic fixture responses and never hits
                 a real API. When running against a real provider, the
                 client's .cache/ layer avoids repeated LLM calls.
* golden       — the baseline golden dataset (data/eval/golden.jsonl),
                 the same file /api/eval runs against.
* tickers      — set of valid symbols from data/tickers.csv, used by
                 test_ticker_mentions_are_valid.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings
from app.eval.run_eval import load_golden
from app.llm.client import LLMClient


def _load_tickers(path: Path) -> set[str]:
    symbols: set[str] = set()
    if not path.exists():
        return symbols
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.lower().startswith("symbol"):
            continue
        symbols.add(line.split(",")[0].strip().upper())
    return symbols


@pytest.fixture(scope="session")
def llm_client() -> LLMClient:
    """LLM client respecting LLM_PROVIDER / CI_USE_STUB_LLM env vars.

    Returns a fresh client per call; providers read their API key from
    the environment. Set LLM_PROVIDER=stub (or CI_USE_STUB_LLM=true)
    to run fully offline against committed fixture responses.
    """
    return LLMClient()


@pytest.fixture(scope="session")
def golden() -> list[dict]:
    """The golden dataset under test (same file /api/eval uses)."""
    return load_golden(settings.GOLDEN_PATH)


@pytest.fixture(scope="session")
def tickers() -> set[str]:
    """Valid ticker symbols from data/tickers.csv."""
    return _load_tickers(settings.TICKERS_PATH)


@pytest.fixture(scope="session")
def sample_stock_data() -> list[dict]:
    """A small realistic input for the synthesis pipeline (NVDA/NBIS/DGXX)."""
    return [
        {
            "symbol": "NVDA",
            "name": "NVIDIA",
            "price": 182.4,
            "change_pct": 3.2,
            "market_cap_bn": 4450.0,
            "news": ["NVIDIA announced a new data center GPU."],
        },
        {
            "symbol": "NBIS",
            "name": "Nebius",
            "price": 41.5,
            "change_pct": -1.4,
            "market_cap_bn": 24.1,
            "news": ["Nebius disclosed a cloud services contract."],
        },
        {
            "symbol": "DGXX",
            "name": "Digi Power X",
            "price": 22.9,
            "change_pct": 5.1,
            "market_cap_bn": 1.2,
            "news": ["Digi Power X secured a data center deal."],
        },
    ]
