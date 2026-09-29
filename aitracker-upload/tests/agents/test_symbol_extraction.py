from __future__ import annotations

from app.agents.router import extract_symbols


def test_extract_symbols_normalizes_company_names_to_tickers():
    assert extract_symbols("What are the latest NVIDIA earnings?") == ["NVDA"]
    assert extract_symbols("Compare Microsoft and Meta earnings") == ["MSFT", "META"]
    assert extract_symbols("How is Nebius doing?") == ["NBIS"]


def test_extract_symbols_keeps_explicit_tickers():
    assert extract_symbols("What is $NVDA doing versus AMD?") == ["NVDA", "AMD"]
