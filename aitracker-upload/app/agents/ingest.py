"""IngestAgent — Phase 3.5: fetch RAG documents from SEC EDGAR, not hand-fed files.

Graph shape (hand-built StateGraph, deterministic — no LLM calls, so this
agent needs NO committed LLM fixture and NO gen_fixtures/.cache step):

    resolve_universe -> query_edgar -> dedupe -> download -> ingest -> verify
        (empty after query) ----------------------------------------> verify

Design notes
------------
* `resolve_universe` pulls the curated AI universe (data/universe/ai_stocks.json)
  via the shared loader — targets default to the full universe (superset, not
  the 6-name watchlist), or a caller-supplied subset.
* `query_edgar` resolves each symbol's CIK from EDGAR company_tickers.json and
  lists recent filings, keeping the LATEST 10-K and 10-Q per symbol. Per-symbol
  failures (unknown symbol, EdgarError, malformed payload) are recorded as
  failed tool steps and skipped — the agent degrades, it does not crash.
* `dedupe` runs BEFORE download so an already-ingested accession (present in
  the corpus manifest data/filings/_index.json) never re-fetches the network —
  the roadmap's "cache-hit skips download" state-machine test.
* `download` fetches document text and writes it to data/filings/ as
  <symbol>_<form>_<accession>.txt (the same dir FilingsService ingests in
  live mode).
* `ingest` reuses the existing RAG ingestion (chunk + embed) with the filings
  tuning from FilingsService._ingest_docs (small chunks + title context
  prefix) so live-ingested filings match the fixture corpus's retrieval
  characteristics. The manifest is updated in `verify` after a successful
  chunk+embed.
* CIK is resolved from EDGAR at query time — never hardcoded (the universe
  JSON deliberately omits it; [[aitracker-universe-seeded]]).
"""
from __future__ import annotations

import json
import operator
from pathlib import Path
from typing import Annotated, Any, Iterable, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.schemas import IngestAgentResult
from app.agents.trajectory import AgentTrajectory, Step, tool_call, traced_node
from app.config import settings
from app.rag.chunker import Chunker
from app.rag.ingest import IngestResult, ingest_texts, title_prefixes
from app.universe import Universe, get_universe
from mcp_servers.filings.edgar import EdgarClient, from_env as edgar_from_env
from mcp_servers.filings.schemas import FilingRef

MANIFEST_NAME = "_index.json"


class IngestState(TypedDict, total=False):
    symbols: list[str]
    targets: list[str]
    refs: list[FilingRef]
    to_download: list[FilingRef]
    skipped: list[str]
    docs: dict[str, str]  # doc_id -> text for newly downloaded filings
    ingest_result: IngestResult
    ingested_docs: list[str]  # doc_ids that chunked+embedded (entered the manifest)
    chunks: int
    # errors accumulates across nodes (query_edgar/download/verify all append) via
    # the list-add reducer, so no node's degradations are overwritten by a later one.
    errors: Annotated[list[str], operator.add]
    fatal: str
    # Trajectory accumulates across nodes via the list-add reducer.
    steps: Annotated[list[Step], operator.add]


def _manifest_path(filings_dir: Path) -> Path:
    return filings_dir / MANIFEST_NAME


def _load_manifest(filings_dir: Path) -> dict[str, Any]:
    """Read the corpus manifest (accession -> {symbol, form, path})."""
    path = _manifest_path(filings_dir)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def build_ingest_graph(
    client: EdgarClient,
    filings_dir: Path,
    universe: Universe,
):
    """Compile the ingest agent's graph over an injected EDGAR client.

    `filings_dir` and `universe` are injected so tests run hermetic against a
    temp dir + the real loader (or a fake universe).
    """

    def _targets(symbols: list[str]) -> list[str]:
        if symbols:
            return [s.strip().upper() for s in symbols]
        return [s.symbol for s in universe]

    @traced_node("resolve_universe")
    def resolve_universe(state: IngestState) -> dict:
        targets = _targets(state.get("symbols") or [])
        step = tool_call("universe.resolve", {"symbols": targets}, note=f"{len(targets)} names")
        return {"targets": targets, "steps": [step]}

    @traced_node("query_edgar")
    def query_edgar(state: IngestState) -> dict:
        targets = state.get("targets") or []
        refs: list[FilingRef] = []
        errors: list[str] = []
        steps: list[Step] = []
        for symbol in targets:
            try:
                cik = client.resolve_cik(symbol)
                if not cik:
                    errors.append(f"{symbol}: no CIK")
                    steps.append(
                        tool_call("edgar.query", {"symbol": symbol}, note="no CIK", ok=False)
                    )
                    continue
                found = client.recent_filings(cik, forms=("10-K", "10-Q"))
                refs.extend(found)
                steps.append(
                    tool_call(
                        "edgar.query",
                        {"symbol": symbol, "cik": cik},
                        note=f"{len(found)} filings",
                    )
                )
            except Exception as exc:  # EdgarError or malformed payload -> degrade
                code = getattr(exc, "code", type(exc).__name__)
                errors.append(f"{symbol}: {code}")
                steps.append(
                    tool_call("edgar.query", {"symbol": symbol}, note=code, ok=False)
                )
        return {"refs": refs, "errors": errors, "steps": steps}

    @traced_node("dedupe")
    def dedupe(state: IngestState) -> dict:
        manifest = _load_manifest(filings_dir)
        seen = set(manifest)
        to_download: list[FilingRef] = []
        skipped: list[str] = []
        steps: list[Step] = []
        for ref in state.get("refs") or []:
            if ref.accession in seen:
                skipped.append(ref.accession)
                steps.append(
                    tool_call("dedupe.index", {"accession": ref.accession}, note="skip")
                )
            else:
                to_download.append(ref)
        return {"to_download": to_download, "skipped": skipped, "steps": steps}

    @traced_node("download")
    def download(state: IngestState) -> dict:
        filings_dir.mkdir(parents=True, exist_ok=True)
        docs: dict[str, str] = {}
        errors: list[str] = []
        steps: list[Step] = []
        for ref in state.get("to_download") or []:
            try:
                text = client.download(ref)
            except Exception as exc:  # EdgarError -> degrade this filing
                code = getattr(exc, "code", type(exc).__name__)
                errors.append(f"{ref.symbol}:{ref.accession}: {code}")
                steps.append(tool_call("edgar.download", {"accession": ref.accession}, note=code, ok=False))
                continue
            if not (text or "").strip():
                errors.append(f"{ref.symbol}:{ref.accession}: empty document")
                steps.append(tool_call("edgar.download", {"accession": ref.accession}, note="empty", ok=False))
                continue
            doc_id = ref.doc_id()
            path = filings_dir / f"{doc_id}.txt"
            path.write_text(text, encoding="utf-8")
            docs[doc_id] = text
            steps.append(
                tool_call("edgar.download", {"accession": ref.accession}, note=doc_id)
            )
        return {"docs": docs, "errors": errors, "steps": steps}

    @traced_node("ingest")
    def ingest(state: IngestState) -> dict:
        docs = state.get("docs") or {}
        if not docs:
            return {"ingest_result": IngestResult(), "_note": "no new documents"}
        # Reuse the existing RAG pipeline with the filings tuning
        # (small chunks + a title context prefix so the company identity
        # travels with every chunk) — same as FilingsService._ingest_docs.
        result = ingest_texts(
            docs,
            chunker=Chunker(target_chars=450),
            context_prefix=title_prefixes(docs),
        )
        step = tool_call(
            "rag.ingest_texts",
            {"documents": sorted(docs)},
            note=f"{len(result.chunks)} chunks / {len(result.documents)} docs",
        )
        return {"ingest_result": result, "steps": [step]}

    @traced_node("verify")
    def verify(state: IngestState) -> dict:
        manifest = _load_manifest(filings_dir)
        result = state.get("ingest_result") or IngestResult()
        ingested: list[str] = []
        new_errors: list[str] = []  # only THIS node's errors; the reducer accumulates
        # Only accessions whose docs actually chunked+embedded enter the
        # manifest; empty_documents from ingest_texts are surfaced as errors.
        for doc_id in result.documents:
            ref = next((r for r in state.get("refs") or [] if r.doc_id() == doc_id), None)
            if ref is None:
                continue
            ingested.append(doc_id)
            manifest[ref.accession] = {
                "symbol": ref.symbol,
                "form": ref.form,
                "path": f"{doc_id}.txt",
            }
        for doc_id in result.empty_documents:
            new_errors.append(f"{doc_id}: empty document after ingest")
        # Persist the manifest (only if anything changed, keep it tidy).
        path = _manifest_path(filings_dir)
        if manifest:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8"
            )
        prior_errors = len(state.get("errors") or [])
        step = tool_call(
            "verify.manifest",
            note=f"{len(ingested)} docs / {len(result.chunks)} chunks / "
            f"{prior_errors + len(new_errors)} errors",
        )
        return {
            "ingested_docs": ingested,
            "chunks": len(result.chunks),
            "errors": new_errors,
            "steps": [step],
        }

    graph = StateGraph(IngestState)
    graph.add_node("resolve_universe", resolve_universe)
    graph.add_node("query_edgar", query_edgar)
    graph.add_node("dedupe", dedupe)
    graph.add_node("download", download)
    graph.add_node("ingest", ingest)
    graph.add_node("verify", verify)

    graph.add_edge(START, "resolve_universe")
    graph.add_edge("resolve_universe", "query_edgar")
    graph.add_edge("query_edgar", "dedupe")
    graph.add_conditional_edges(
        "dedupe",
        lambda s: "download" if s.get("to_download") else "verify",
        {"download": "download", "verify": "verify"},
    )
    graph.add_edge("download", "ingest")
    graph.add_edge("ingest", "verify")
    graph.add_edge("verify", END)
    return graph.compile()


class IngestAgent:
    """Universe -> fetched + deduped + ingested filings, with a trajectory."""

    def __init__(
        self,
        client: EdgarClient | None = None,
        universe: Universe | None = None,
        filings_dir: Path | str | None = None,
        recursion_limit: int = 25,
    ) -> None:
        self.client = client or edgar_from_env("fixture")
        # `universe is not None`, not `universe or …`: an empty Universe is
        # falsy (len 0) but a legitimate "no targets" injection for tests.
        self.universe = universe if universe is not None else get_universe()
        self.filings_dir = Path(filings_dir or settings.DATA_DIR / "filings")
        self.recursion_limit = recursion_limit
        self.graph = build_ingest_graph(self.client, self.filings_dir, self.universe)

    def run(self, symbols: list[str] | None = None) -> IngestAgentResult:
        state: IngestState = {"symbols": symbols or [], "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        errors = final.get("errors") or []
        if final.get("fatal"):
            errors.append(final["fatal"])
        ingested_docs = final.get("ingested_docs") or []
        refs = final.get("refs") or []
        # `fetched` = the refs that actually made it through download+ingest
        # (in the manifest), NOT merely "not deduped" — a ref can survive
        # dedupe yet fail to download.
        fetched = [r for r in refs if r.doc_id() in set(ingested_docs)]
        return IngestAgentResult(
            targets=final.get("targets") or [],
            fetched=fetched,
            skipped=final.get("skipped") or [],
            ingested_docs=ingested_docs,
            chunks=final.get("chunks") or 0,
            errors=errors,
            trajectory=AgentTrajectory(steps=final.get("steps") or []),
        )
