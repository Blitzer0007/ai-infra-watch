"""End-to-end: an EDGAR ingest-fed corpus flows into the Filings agent.

This is the load-bearing proof for the "corpus ingest-fed" step: instead of
the four hand-fed sample docs under mcp_servers/filings/fixtures/corpus/, the
Filings agent answers over a corpus that the IngestAgent actually FETCHED from
EDGAR (here the offline FixtureEdgarClient, which serves NVDA + MSFT) and wrote
to disk. Hermetic — no network, canned LLM so we assert on retrieval/routing
provenance, never on generated prose (there is no committed stub fixture for a
freshly-ingested prompt; asserting its text would be fixture-gaming).

Also proves the served path: with FILINGS_MODE=live and a populated corpus dir,
a no-arg FilingsAgent() (as /api/ask builds via SupervisorAgent) reads the
ingest-fed corpus rather than the committed fixtures.
"""
from __future__ import annotations

from pathlib import Path

from app.agents.filings import FilingsAgent
from app.agents.ingest import IngestAgent
from app.llm.client import LLMClient
from mcp_servers.filings.edgar import FixtureEdgarClient
from mcp_servers.filings.service import FilingsService

# doc_ids the fixture EDGAR yields (symbol_form_accessionnodash); see
# test_ingest_agent.py for the source accessions.
NVDA_10K_DOC = "nvda_10k_000104581025000023"
NVDA_10Q_DOC = "nvda_10q_000104581024000316"
MSFT_10K_DOC = "msft_10k_000095017025000123"
MSFT_10Q_DOC = "msft_10q_000095017024000456"
INGESTED_DOCS = {NVDA_10K_DOC, NVDA_10Q_DOC, MSFT_10K_DOC, MSFT_10Q_DOC}

# The hand-fed sample corpus keys docs by these stems — they must NOT appear
# in an ingest-fed corpus.
FIXTURE_CORPUS_STEMS = {"nvda_10k_fy2025", "msft_10k_fy2025", "avgo_10k_fy2025", "meta_10k_fy2025"}


class _CannedClient(LLMClient):
    """LLMClient whose generate() returns a fixed grounded string.

    A prompt over freshly-ingested chunks has no committed stub fixture, so we
    let generate() run deterministically and assert on the REAL retrieval +
    routing, not the answer text (matches tests/agents/test_handoff.py).
    """

    def __init__(self) -> None:
        super().__init__(provider="stub", model="stub")

    def generate(self, prompt, max_tokens=None, temperature=None):  # noqa: D401
        return "NVIDIA data center revenue grew, per the filing."


def test_ingest_feeds_filings_service(tmp_path):
    # 1. Ingest NVDA + MSFT from the (offline) fixture EDGAR into a fresh dir.
    r = IngestAgent(client=FixtureEdgarClient(), filings_dir=tmp_path).run(["NVDA", "MSFT"])
    assert r.ok()
    assert set(r.ingested_docs) == INGESTED_DOCS
    # Files + manifest were actually written.
    for doc_id in INGESTED_DOCS:
        assert (tmp_path / f"{doc_id}.txt").exists()
    assert (tmp_path / "_index.json").exists()

    # 2. Build the FilingsService over the INGESTED dir (not the fixture corpus).
    service = FilingsService.from_directory(tmp_path, client=_CannedClient())

    # 3. Load-bearing: the corpus is the ingest-fed docs, NOT the hand-fed sample.
    docs = set(service.list_documents())
    assert docs == INGESTED_DOCS
    assert not (docs & FIXTURE_CORPUS_STEMS), "corpus leaked the hand-fed fixtures"

    # 4. The Filings agent answers over that ingest-fed corpus with real citations.
    agent = FilingsAgent(retriever=service._retriever, client=_CannedClient())
    res = agent.run("How much did NVIDIA data center revenue grow?")
    assert res.ok()
    assert res.routed == "generate"
    assert res.answer is not None and res.answer.citations
    assert any(c.document_id.startswith("nvda") for c in res.answer.citations)


def test_ingested_corpus_excludes_symbols_edgar_cannot_serve(tmp_path):
    # AVGO is in the universe + company_tickers but has NO submissions fixture,
    # so a fixture ingest records a non-fatal per-symbol error and writes no AVGO
    # doc. Proves the corpus is genuinely sourced from what EDGAR returned.
    r = IngestAgent(client=FixtureEdgarClient(), filings_dir=tmp_path).run(["AVGO"])
    assert r.ok()  # per-symbol miss is non-fatal
    assert r.ingested_docs == []
    assert any("AVGO" in e for e in r.errors)
    assert not list(tmp_path.glob("avgo_*.txt"))


def test_filings_mode_live_reaches_ingested_corpus(tmp_path, monkeypatch):
    # The served path: /api/ask builds a no-arg FilingsAgent() (via
    # SupervisorAgent). With FILINGS_MODE=live + a populated corpus dir, that
    # no-arg agent must read the INGEST-FED corpus, not the committed fixtures.
    IngestAgent(client=FixtureEdgarClient(), filings_dir=tmp_path).run(["NVDA"])

    # from_env("live") reads LIVE_CORPUS_DIR at call time; point it at our dir.
    monkeypatch.setattr("mcp_servers.filings.service.LIVE_CORPUS_DIR", tmp_path)
    monkeypatch.setenv("FILINGS_MODE", "live")

    # No retriever arg -> exercises the from_env() branch changed for this step.
    agent = FilingsAgent(client=_CannedClient())
    # The agent's corpus should be the ingest-fed NVDA doc, not nvda_10k_fy2025.
    assert agent._service is not None
    docs = set(agent._service.list_documents())
    assert NVDA_10K_DOC in docs
    assert "nvda_10k_fy2025" not in docs

    res = agent.run("How much did NVIDIA data center revenue grow?")
    assert res.ok()
    assert any(c.document_id.startswith("nvda") for c in res.answer.citations)
