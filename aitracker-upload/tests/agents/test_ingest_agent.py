"""IngestAgent tests — Phase 3.5 (EDGAR data acquisition).

Maps the roadmap's 5 test strategies for the ingest agent:
  1. trajectory      — resolve_universe precedes query_edgar precedes ingest;
                       verify last (linear graph -> strict node order OK).
  2. tool-call       — the accession downloaded == the accession EDGAR
                       returned as latest (assert manifest + fetched).
  3. state-machine   — cache-hit (accession already in manifest) skips
                       download entirely.
  4. adversarial     — malformed/empty submissions + EdgarError degrade to
                       errors, survivors still ingest; no crash, no
                       divide-by-zero on an empty subset.
  5. @pytest.mark.live — real EDGAR smoke (resolve one CIK + fetch one
                       filing head).

Plus: hermeticity (writes only under the injected filings_dir) and a
model_dump_json() round-trip with nested FilingRefs.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.agents.ingest import IngestAgent, _load_manifest
from app.agents.schemas import IngestAgentResult
from app.universe import Universe
from mcp_servers.filings.edgar import FixtureEdgarClient, LiveEdgarClient, from_env
from mcp_servers.filings.schemas import EdgarError, FilingRef

# Accessions from the committed fixture submissions (latest 10-K / 10-Q).
NVDA_10K = "0001045810-25-000023"
NVDA_10Q = "0001045810-24-000316"
MSFT_10K = "0000950170-25-000123"
MSFT_10Q = "0000950170-24-000456"
ALL_ACC = {NVDA_10K, NVDA_10Q, MSFT_10K, MSFT_10Q}


@pytest.fixture
def agent(tmp_path: Path) -> IngestAgent:
    """Real graph over the committed fixture EDGAR payloads + a temp dir."""
    return IngestAgent(client=FixtureEdgarClient(), filings_dir=tmp_path)


# ----------------------------------------------------------------------
# 1. Trajectory
# ----------------------------------------------------------------------
def test_trajectory_node_order(agent: IngestAgent) -> None:
    r = agent.run(symbols=["NVDA"])
    nodes = r.trajectory.nodes()
    assert nodes == [
        "resolve_universe",
        "query_edgar",
        "dedupe",
        "download",
        "ingest",
        "verify",
    ]
    # verify is the last node visit
    assert nodes[-1] == "verify"
    # every tool step preceded by its node visit (well-formed trajectory)
    for i, s in enumerate(r.trajectory.steps):
        if s.kind == "tool":
            assert any(p.kind == "node" and p.node == s.node for p in r.trajectory.steps[:i])


def test_trajectory_dedupe_path_skips_download(agent: IngestAgent) -> None:
    agent.run(symbols=["NVDA"])
    r2 = agent.run(symbols=["NVDA"])
    nodes = r2.trajectory.nodes()
    assert nodes == ["resolve_universe", "query_edgar", "dedupe", "verify"]
    assert "download" not in nodes


# ----------------------------------------------------------------------
# 2. Tool-call — downloaded accession == EDGAR's latest
# ----------------------------------------------------------------------
def test_downloaded_accession_is_latest(agent: IngestAgent) -> None:
    r = agent.run(symbols=["NVDA"])
    fetched = {f.accession for f in r.fetched}
    assert fetched == {NVDA_10K, NVDA_10Q}  # the latest 10-K and 10-Q
    # the written file name + manifest carry the same accessions
    manifest = _load_manifest(Path(agent.filings_dir))
    assert set(manifest) == fetched
    for acc in fetched:
        f = next(x for x in r.fetched if x.accession == acc)
        assert (agent.filings_dir / f"{f.doc_id()}.txt").exists()


def test_fetched_contains_refs_with_full_metadata(agent: IngestAgent) -> None:
    r = agent.run(symbols=["MSFT"])
    by_form = {f.form: f for f in r.fetched}
    assert by_form["10-K"].symbol == "MSFT"
    assert by_form["10-K"].cik == "0000789019"
    assert by_form["10-K"].filed_date  # not blank
    assert by_form["10-K"].url  # resolved to the Archives URL


# ----------------------------------------------------------------------
# 3. State-machine — cache-hit skips download
# ----------------------------------------------------------------------
def test_cache_hit_skips_download(agent: IngestAgent) -> None:
    agent.run(symbols=["NVDA"])
    # second run: everything deduped -> download not called
    r2 = agent.run(symbols=["NVDA"])
    assert set(r2.skipped) == {NVDA_10K, NVDA_10Q}
    assert r2.fetched == []
    assert not (agent.filings_dir / "unused.txt").exists()  # nothing written


def test_partial_dedupe(tmp_path: Path) -> None:
    agent = IngestAgent(client=FixtureEdgarClient(), filings_dir=tmp_path)
    agent.run(symbols=["NVDA"])
    # now run the full universe; NVDA accessions dedupe, MSFT is fresh
    r = agent.run(symbols=["NVDA", "MSFT"])
    assert set(r.skipped) == {NVDA_10K, NVDA_10Q}
    assert {f.accession for f in r.fetched} == {MSFT_10K, MSFT_10Q}


# ----------------------------------------------------------------------
# 4. Adversarial
# ----------------------------------------------------------------------
class FlakyEdgar:
    """A client that can fail per-symbol / per-download on command."""

    source = "fake"

    def __init__(
        self,
        missing: set[str] | None = None,
        fail_filings: set[str] | None = None,
        empty_docs: set[str] | None = None,
    ) -> None:
        self.missing = missing or set()
        self.fail_filings = fail_filings or set()
        self.empty_docs = empty_docs or set()
        self.download_calls: list[str] = []

    def resolve_cik(self, symbol: str) -> str | None:
        if symbol.upper() in self.missing:
            return None
        return {"NVDA": "0001045810", "MSFT": "0000789019"}[symbol.upper()]

    def recent_filings(self, cik: str, forms=("10-K", "10-Q")):
        if cik in self.fail_filings:
            raise EdgarError("HTTP_ERROR", "submissions fetch failed")
        symbol = "NVDA" if cik == "0001045810" else "MSFT"
        acc = NVDA_10K if symbol == "NVDA" else MSFT_10K
        return [FilingRef(cik=cik, symbol=symbol, form="10-K", accession=acc,
                          primary_doc="doc.htm", filed_date="2025-01-01", url="u")]

    def download(self, ref: FilingRef) -> str:
        self.download_calls.append(ref.accession)
        if ref.accession in self.empty_docs:
            return "   \n  "
        return f"{ref.symbol} CORPORATION 10-K. Revenue grew strongly."


def test_malformed_empty_submissions_degrade(tmp_path: Path) -> None:
    client = FlakyEdgar(
        missing={"ZZZZ"},                       # no CIK -> skipped
        fail_filings={"0001045810"},            # NVDA submissions error -> skipped
        empty_docs={MSFT_10K},                  # MSFT doc empty -> failed download
    )
    r = IngestAgent(client=client, filings_dir=tmp_path).run(
        symbols=["NVDA", "MSFT", "ZZZZ"]
    )
    # survivors: none ingested (NVDA failed, MSFT empty) — but NO crash
    assert r.ingested_docs == []
    assert r.errors, "errors should be populated for the degradations"
    joined = "; ".join(r.errors)
    assert "ZZZZ: no CIK" in joined
    assert "NVDA: HTTP_ERROR" in joined
    assert f"MSFT:{MSFT_10K}" in joined and "empty document" in joined
    # the MSFT download was attempted but the empty doc was dropped
    assert MSFT_10K in client.download_calls
    assert r.ok()  # partial degradations are non-fatal


def test_all_symbols_fail_still_ok_and_no_div_by_zero(tmp_path: Path) -> None:
    client = FlakyEdgar(missing={"NVDA", "MSFT"})
    r = IngestAgent(client=client, filings_dir=tmp_path).run(symbols=["NVDA", "MSFT"])
    assert r.ingested_docs == []
    assert r.chunks == 0
    assert len(r.errors) == 2
    assert r.ok()
    # empty universe -> clean no-op (no targets, no divide-by-zero)
    empty = IngestAgent(
        client=client, universe=Universe([], schema_version=1), filings_dir=tmp_path
    )
    r2 = empty.run(symbols=[])
    assert r2.targets == []
    assert r2.ingested_docs == []
    assert r2.ok()


def test_edgar_client_raise_is_caught_per_symbol(tmp_path: Path) -> None:
    class BoomClient:
        source = "fake"
        def resolve_cik(self, symbol: str) -> str | None:
            raise EdgarError("HTTP_ERROR", "network down")
        def recent_filings(self, cik, forms=()):
            raise AssertionError("should not be reached")
        def download(self, ref: FilingRef) -> str:
            raise AssertionError("should not be reached")

    r = IngestAgent(client=BoomClient(), filings_dir=tmp_path).run(symbols=["NVDA"])
    assert r.ingested_docs == []
    assert "NVDA: HTTP_ERROR" in "; ".join(r.errors)
    assert r.ok()  # degraded, not crashed


# ----------------------------------------------------------------------
# Hermeticity + serialization
# ----------------------------------------------------------------------
def test_writes_only_under_injected_dir(tmp_path: Path) -> None:
    before = {p for p in Path.cwd().rglob("_index.json")}
    IngestAgent(client=FixtureEdgarClient(), filings_dir=tmp_path).run(symbols=["NVDA"])
    after = {p for p in Path.cwd().rglob("_index.json")}
    assert after == before  # nothing written outside tmp_path


def test_result_serializes_with_nested_filingrefs(agent: IngestAgent) -> None:
    r = agent.run(symbols=["NVDA", "MSFT"])
    blob = json.loads(r.model_dump_json())
    assert blob["fetched"] and all("accession" in f for f in blob["fetched"])
    assert blob["targets"] == ["NVDA", "MSFT"]
    assert blob["trajectory"]["steps"]


# ----------------------------------------------------------------------
# Fixture client unit tests
# ----------------------------------------------------------------------
def test_fixture_client_resolves_cik() -> None:
    c = FixtureEdgarClient()
    assert c.resolve_cik("nvda") == "0001045810"
    assert c.resolve_cik("ZZZZ") is None


def test_fixture_client_recent_filings_latest_per_form() -> None:
    c = FixtureEdgarClient()
    refs = c.recent_filings("0001045810")
    by_form = {r.form: r for r in refs}
    assert by_form["10-K"].accession == NVDA_10K  # newest 10-K
    assert by_form["10-Q"].accession == NVDA_10Q  # newest 10-Q
    assert "8-K" not in by_form  # forms filtered to the requested set


def test_fixture_client_download_matches_accession() -> None:
    c = FixtureEdgarClient()
    ref = FilingRef(
        cik="0001045810", symbol="NVDA", form="10-K",
        accession=NVDA_10K, primary_doc="nvda-20250126.htm", url="u",
    )
    text = c.download(ref)
    assert "NVIDIA CORPORATION" in text
    assert "Data Center revenue" in text


def test_live_client_rejects_blank_user_agent() -> None:
    c = LiveEdgarClient(user_agent="")
    with pytest.raises(EdgarError, match="NO_UA"):
        c._get("https://data.sec.gov/x")


def test_from_env_defaults_to_fixture() -> None:
    assert from_env("fixture").source == "fixture"
    assert from_env("live").source == "live"
    assert from_env("nonsense").source == "fixture"  # unknown -> safe fixture


# ----------------------------------------------------------------------
# 5. Live smoke (skipped in CI; run with -m live)
# ----------------------------------------------------------------------
@pytest.mark.live
def test_live_edgar_smoke() -> None:
    """Resolve one CIK + list + download one filing head from real EDGAR."""
    client = LiveEdgarClient()
    cik = client.resolve_cik("NVDA")
    assert cik, "real EDGAR should resolve NVDA"
    refs = client.recent_filings(cik, forms=("10-K",))
    assert refs, "real EDGAR should list a 10-K for NVDA"
    text = client.download(refs[0])
    assert text.strip(), "real EDGAR download should return document text"
