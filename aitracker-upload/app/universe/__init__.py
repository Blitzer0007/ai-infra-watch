"""Curated AI-stock universe — the enumerable set behind Phase 3.5 / 3.6.

`data/universe/ai_stocks.json` is the single source of truth for "which names
are AI stocks". It carries a three-way bucket tag (ai_hardware | ai_application
| ai_infra) that the Ingest Agent (3.5) and the Rotation Detector (3.6) both
resolve membership from, plus alignment flags (in_watchlist / in_corpus) that
record which names are currently wired into the 6-name watchlist and the
hand-fed filings corpus.

Loader guarantees (tested in tests/universe/test_universe.py):
  * hermetic — reads a committed JSON file, never the network
  * validates — schema_version, buckets enum, required per-stock fields,
    unique symbols
  * superset — every name in data/tickers.csv (watchlist) and every name in
    the filings corpus is present, tagged, and marked with the right flag
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from app.config.settings import UNIVERSE_PATH

BUCKETS: tuple[str, ...] = ("ai_hardware", "ai_application", "ai_infra")
REQUIRED_FIELDS: tuple[str, ...] = (
    "symbol",
    "name",
    "exchange",
    "bucket",
    "source",
    "in_watchlist",
    "in_corpus",
)


@dataclass(frozen=True)
class UniverseStock:
    """One entry in the AI universe. Frozen so callers can't drift flags."""

    symbol: str
    name: str
    exchange: str
    bucket: str
    source: str
    in_watchlist: bool
    in_corpus: bool

    @property
    def is_watchlist(self) -> bool:
        return self.in_watchlist

    @property
    def is_corpus(self) -> bool:
        return self.in_corpus


class Universe:
    """Parsed, validated universe. Immutable after construction."""

    def __init__(self, stocks: list[UniverseStock], schema_version: int) -> None:
        self._stocks = tuple(stocks)
        self.schema_version = schema_version

    def __iter__(self) -> Iterator[UniverseStock]:
        return iter(self._stocks)

    def __len__(self) -> int:
        return len(self._stocks)

    def symbols(self) -> set[str]:
        return {s.symbol for s in self._stocks}

    def get(self, symbol: str) -> UniverseStock | None:
        """Look up by exact uppercase symbol, or None."""
        target = symbol.strip().upper()
        return next((s for s in self._stocks if s.symbol == target), None)

    def by_bucket(self, bucket: str) -> list[UniverseStock]:
        """All stocks tagged with one bucket (e.g. "ai_hardware")."""
        return [s for s in self._stocks if s.bucket == bucket]

    def watchlist(self) -> list[UniverseStock]:
        return [s for s in self._stocks if s.in_watchlist]

    def corpus(self) -> list[UniverseStock]:
        return [s for s in self._stocks if s.in_corpus]


def load_universe(path: Path | str | None = None) -> Universe:
    """Load + validate the universe JSON.

    Raises ValueError on malformed content (bad schema version, unknown
    bucket, missing/duplicate symbol, missing field). Never touches the
    network — this is a committed, hermetic data file.
    """
    raw = json.loads(Path(path or UNIVERSE_PATH).read_text(encoding="utf-8"))
    if raw.get("schema_version") != 1:
        raise ValueError(f"unsupported universe schema_version: {raw.get('schema_version')!r}")

    declared = set(raw.get("buckets") or [])
    missing_buckets = set(BUCKETS) - declared
    if missing_buckets:
        raise ValueError(f"universe missing bucket declarations: {sorted(missing_buckets)}")

    stocks: list[UniverseStock] = []
    seen: set[str] = set()
    for item in raw.get("stocks") or []:
        if not isinstance(item, dict):
            raise ValueError(f"universe stock entry is not an object: {item!r}")
        missing = [f for f in REQUIRED_FIELDS if f not in item]
        if missing:
            raise ValueError(f"universe stock missing fields {missing}: {item.get('symbol')!r}")
        symbol = str(item["symbol"]).strip().upper()
        if not symbol:
            raise ValueError(f"universe stock has empty symbol: {item!r}")
        if symbol in seen:
            raise ValueError(f"duplicate universe symbol: {symbol}")
        seen.add(symbol)
        bucket = item["bucket"]
        if bucket not in BUCKETS:
            raise ValueError(f"unknown universe bucket {bucket!r} for {symbol}")
        stocks.append(
            UniverseStock(
                symbol=symbol,
                name=str(item["name"]),
                exchange=str(item["exchange"]),
                bucket=bucket,
                source=str(item["source"]),
                in_watchlist=bool(item["in_watchlist"]),
                in_corpus=bool(item["in_corpus"]),
            )
        )
    return Universe(stocks, int(raw["schema_version"]))


# Module-level cached instance: the file is committed and read-only in tests.
_universe: Universe | None = None


def get_universe() -> Universe:
    """Cached default universe (settings.UNIVERSE_PATH)."""
    global _universe
    if _universe is None:
        _universe = load_universe()
    return _universe
