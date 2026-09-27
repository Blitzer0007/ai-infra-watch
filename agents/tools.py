from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx


DEFAULT_SYMBOLS = [
    "DGXX", "DRAM", "SOXL", "NVDA", "MSFT",
    "NBIS", "VIVO", "META", "NOW", "PHVS",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_live_data(symbols: list[str]) -> dict[str, Any]:
    """Consume the same Vercel feed used by the React dashboard."""
    endpoint = os.getenv(
        "AI_INFRA_WATCH_DATA_URL",
        "https://ai-infra-watch.vercel.app/api/live-data",
    )
    response = httpx.get(
        endpoint,
        params={"refresh": "true"},
        timeout=20.0,
    )
    response.raise_for_status()
    payload = response.json()
    prices = payload.get("stockPrices", {})
    return {
        "stockPrices": {s: prices[s] for s in symbols if s in prices},
        "news": payload.get("news", []),
        "contracts": payload.get("contracts", []),
        "timestamp": payload.get("timestamp"),
        "source": endpoint,
    }
