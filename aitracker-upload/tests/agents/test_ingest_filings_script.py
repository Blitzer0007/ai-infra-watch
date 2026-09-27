"""Tests for scripts/ingest_filings.py — the runnable ingest entry point.

Hermetic: drives `main()` against the committed FixtureEdgarClient and a
tmp corpus dir, so there is NO network and NOTHING is written to the real
data/filings/. Proves the operator entry point actually fetches + writes a
corpus and reports it, and that it leaks nothing outside the injected dir.

`scripts/` is a script directory, not an importable package (matches
gen_fixtures.py), so the module is loaded by path via importlib.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

from mcp_servers.filings.edgar import FixtureEdgarClient

# The NVDA 10-K accession the fixture EDGAR serves (see test_ingest_agent.py).
NVDA_10K_DOC = "nvda_10k_000104581025000023"


def _load_script():
    """Import scripts/ingest_filings.py by path (it isn't a package)."""
    root = Path(__file__).resolve().parents[2]
    path = root / "scripts" / "ingest_filings.py"
    spec = importlib.util.spec_from_file_location("ingest_filings", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def test_main_writes_corpus_and_returns_ok(tmp_path):
    mod = _load_script()
    result = mod.main(
        argv=["--symbols", "NVDA"],
        client=FixtureEdgarClient(),
        filings_dir=tmp_path,
    )

    assert result.ok()
    # A real corpus was produced from the ingest, not a placeholder.
    assert result.ingested_docs
    assert NVDA_10K_DOC in result.ingested_docs
    assert (tmp_path / f"{NVDA_10K_DOC}.txt").exists()
    assert (tmp_path / "_index.json").exists()
    assert result.chunks > 0


def test_build_report_is_nonempty_and_reflects_counts(tmp_path):
    mod = _load_script()
    result = mod.main(
        argv=["--symbols", "NVDA"],
        client=FixtureEdgarClient(),
        filings_dir=tmp_path,
    )
    report = mod.build_report(result)
    assert isinstance(report, str) and report.strip()
    assert "ok" in report
    assert f"chunks:   {result.chunks}" in report
    assert NVDA_10K_DOC in report  # the fetched doc id is surfaced


def test_main_does_not_write_outside_injected_dir(tmp_path):
    # Hermeticity guard (mirrors test_ingest_agent.py): running the script must
    # write only under the injected dir, never the real data/filings/.
    before = {p.resolve() for p in Path.cwd().rglob("_index.json")}
    mod = _load_script()
    mod.main(argv=["--symbols", "NVDA"], client=FixtureEdgarClient(), filings_dir=tmp_path)
    after = {p.resolve() for p in Path.cwd().rglob("_index.json")}
    # The only new manifest is the one under tmp_path (outside cwd).
    assert after == before
