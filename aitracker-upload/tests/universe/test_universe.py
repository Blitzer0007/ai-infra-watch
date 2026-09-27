"""Universe seed tests — Phase 3.5/3.6 prerequisite.

The universe is the enumerable "all AI stocks" set. These tests lock the two
things that matter for the agents that consume it:

  * it parses and validates (hermetic, no network), and
  * it is a genuine SUPERSET of what's wired today — every watchlist name
    (data/tickers.csv) and every filings-corpus name (the committed corpus
    fixtures) appears, tagged with a valid bucket and the correct alignment
    flag. This is the alignment constraint the Ingest/Rotation agents rely on.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings
from app.universe import BUCKETS, Universe, get_universe, load_universe

# Corpus fixture names map filename prefix -> ticker (avgo_10k... -> AVGO).
CORPUS_DIR = Path(settings.BASE_DIR) / "mcp_servers" / "filings" / "fixtures" / "corpus"


def _watchlist_symbols() -> set[str]:
    symbols: set[str] = set()
    for line in settings.TICKERS_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.lower().startswith("symbol"):
            continue
        symbols.add(line.split(",")[0].strip().upper())
    return symbols


def _corpus_symbols() -> set[str]:
    return {p.name.split("_", 1)[0].strip().upper() for p in CORPUS_DIR.glob("*.txt")}


@pytest.fixture(scope="module")
def universe() -> Universe:
    return get_universe()


def test_universe_parses_and_is_nonempty(universe: Universe) -> None:
    assert universe.schema_version == 1
    assert len(universe) >= 20  # curated superset, not just the 6-name watchlist


def test_symbols_are_unique(universe: Universe) -> None:
    syms = [s.symbol for s in universe]
    assert len(syms) == len(set(syms))


def test_every_bucket_is_valid_and_populated(universe: Universe) -> None:
    for stock in universe:
        assert stock.bucket in BUCKETS, f"{stock.symbol} has bad bucket {stock.bucket!r}"
    for bucket in BUCKETS:
        assert universe.by_bucket(bucket), f"bucket {bucket} is empty"


def test_universe_is_watchlist_superset(universe: Universe) -> None:
    """Every watchlist ticker is present AND flagged in_watchlist=True."""
    watchlist = _watchlist_symbols()
    assert watchlist, "tickers.csv yielded no symbols — test setup broken"
    missing = watchlist - universe.symbols()
    assert not missing, f"watchlist names absent from universe: {sorted(missing)}"
    flagged = {s.symbol for s in universe.watchlist()}
    assert watchlist <= flagged, (
        f"watchlist names not flagged in_watchlist: {sorted(watchlist - flagged)}"
    )


def test_universe_is_corpus_superset(universe: Universe) -> None:
    """Every filings-corpus name is present AND flagged in_corpus=True."""
    corpus = _corpus_symbols()
    assert corpus, "corpus fixtures yielded no symbols — test setup broken"
    missing = corpus - universe.symbols()
    assert not missing, f"corpus names absent from universe: {sorted(missing)}"
    flagged = {s.symbol for s in universe.corpus()}
    assert corpus <= flagged, (
        f"corpus names not flagged in_corpus: {sorted(corpus - flagged)}"
    )


def test_corpus_names_are_a_subset_of_watchlist_flags_or_tagged(universe: Universe) -> None:
    """Sanity: no stock is flagged in_corpus without also being a real entry."""
    for stock in universe.corpus():
        assert stock.bucket in BUCKETS
        assert stock.name


def test_get_and_lookup_helpers(universe: Universe) -> None:
    nvda = universe.get("nvda")  # case-insensitive
    assert nvda is not None
    assert nvda.symbol == "NVDA"
    assert nvda.bucket == "ai_hardware"
    assert universe.get("ZZZZ") is None


def test_load_rejects_bad_schema_version(tmp_path: Path) -> None:
    bad = tmp_path / "u.json"
    bad.write_text('{"schema_version": 2, "buckets": [], "stocks": []}', encoding="utf-8")
    with pytest.raises(ValueError, match="schema_version"):
        load_universe(bad)


def test_load_rejects_unknown_bucket(tmp_path: Path) -> None:
    bad = tmp_path / "u.json"
    bad.write_text(
        '{"schema_version": 1, "buckets": ["ai_hardware","ai_application","ai_infra"],'
        ' "stocks": [{"symbol":"X","name":"X","exchange":"NASDAQ","bucket":"nope",'
        '"source":"curated","in_watchlist":false,"in_corpus":false}]}',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="bucket"):
        load_universe(bad)


def test_load_rejects_duplicate_symbol(tmp_path: Path) -> None:
    entry = (
        '{"symbol":"X","name":"X","exchange":"NASDAQ","bucket":"ai_infra",'
        '"source":"curated","in_watchlist":false,"in_corpus":false}'
    )
    bad = tmp_path / "u.json"
    bad.write_text(
        '{"schema_version": 1, "buckets": ["ai_hardware","ai_application","ai_infra"],'
        f' "stocks": [{entry}, {entry}]}}',
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="duplicate"):
        load_universe(bad)
