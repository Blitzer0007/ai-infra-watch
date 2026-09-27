"""Shared sample inputs so tests and the fixture generator never drift.

SAMPLE_STOCK_DATA is the canonical synthesis input used by the pytest
suite (via the sample_stock_data fixture) and by scripts/gen_fixtures.py
to produce the committed stub response.
"""
from __future__ import annotations

from typing import Any

SAMPLE_STOCK_DATA: list[dict[str, Any]] = [
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

# Canonical good summary for the sample (kept close to the news so the
# grounding + semantic assertions pass in stub mode).
SAMPLE_SUMMARY = (
    "NVIDIA rose on a new data center GPU while Digi Power X gained on a "
    "data center deal and Nebius slipped on a contract disclosure."
)
