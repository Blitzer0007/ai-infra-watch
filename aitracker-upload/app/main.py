"""FastAPI app for ai-infra-watch backend.

Endpoints
---------
GET  /api/health        -> service + config summary (includes MCP pool status)
POST /api/eval          -> run the golden eval suite against the synthesis
                           pipeline; returns {metrics, failures}
GET  /api/eval          -> same, via query params (?case=golden-001)
POST /api/ask           -> route a free-text question through the supervisor
                           (market / filings / both / MCP fallback) and
                           return the merged answer
GET  /api/ask           -> same, via query param (?q=...&mcp=1)
GET  /api/earnings      -> past + upcoming earnings with historical price
                           reaction per symbol (?symbols=NBIS,DGXX)
POST /api/earnings      -> same, via {"symbols": [...]} body
GET  /api/milestones    -> auto-maintained milestone timeline per symbol,
                           derived from recent SEC 8-K filings (?symbols=...)
POST /api/milestones    -> same, via {"symbols": [...]} body
GET  /api/contracts     -> primary-source contract disclosures derived from
                           SEC 8-K item 1.01/1.02/2.03 (?symbols=...)
POST /api/contracts     -> same, via {"symbols": [...]} body
GET  /api/mcp/status    -> MCP toolbox pool: connected servers, discovered
                           tools, any startup errors
POST /api/mcp/reconnect -> drop and re-open the MCP singleton connection

MCP mode for /api/ask
---------------------
Default: in-process SupervisorAgent (hermetic, fast, byte-identical to tests).

Opt in two ways:
  1. Set env `USE_MCP=1` before launching uvicorn (makes MCP the default)
  2. Pass `?mcp=1` (GET) or `"use_mcp": true` (POST) on individual requests
     (overrides the env-based default).

In MCP mode the pipeline:
  - classifies the question with the SAME keyword cue table SupervisorAgent
    uses (route semantics are identical);
  - calls stocks.get_snapshot / filings.answer_question directly over the
    MCP toolbox singleton pool (one persistent connection);
  - if neither branch produced a usable answer, runs ToolRouterAgent over
    the FULL live tool catalog. Add a 4th MCP server (news, options,
    congress, macro…) and THIS PIPELINE DISCOVERS IT WITH ZERO CODE CHANGES.

Run:  uvicorn app.main:app --reload
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.config import settings
from app.eval.run_eval import run_eval_traced
from app.llm.client import LLMClient, LLMConfigError
from app.mcp_client import close_toolbox, toolbox_status, use_mcp


PROJECT_ROOT = Path(__file__).resolve().parent.parent


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """FastAPI lifespan: clean up the MCP toolbox pool on process shutdown.

    We intentionally don't `get_toolbox()` in startup — connection is paid
    on the FIRST `/api/ask` MCP request, not at `uvicorn launch` time, so
    a missing `mcp` optional dep doesn't prevent the app from booting.
    """
    yield
    try:
        close_toolbox()
    except Exception:  # noqa: BLE001 — shutdown is best-effort
        pass


app = FastAPI(
    title="ai-infra-watch backend",
    description="LLM synthesis + multi-agent + MCP stack (roadmap Phase 1-6).",
    version="0.6.0",
    lifespan=_lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # static dashboard is served from any origin
    allow_methods=["*"],
    allow_headers=["*"],
)

_EVAL_BODY_EXAMPLE = {
    "case_id": None,
    "case": None,
    "full_suite": True,
}


class EvalRequest(BaseModel):
    """Body for POST /api/eval. `case_id` runs a single golden test;
    omit (or set full_suite=true) to run the whole golden dataset."""

    case_id: str | None = Field(default=None, description="Run a single golden case by id")
    full_suite: bool = Field(default=True, description="Run the full golden dataset")


@app.get("/api/health")
def health() -> dict[str, Any]:
    s = settings.get_settings()
    return {
        "status": "ok",
        "provider": s["provider"],
        "model": s["model"],
        "stub_mode": s["stub_mode"],
        "golden_path": s["golden_path"],
        "semantic_threshold": s["semantic_threshold"],
        "api_key_configured": bool(settings.ANTHROPIC_API_KEY or settings.OPENAI_API_KEY),
        "mcp_default": use_mcp(),
        "mcp": toolbox_status(),
    }


# ---------------------------------------------------------------------------
# /api/mcp — MCP toolbox pool observability + admin
# ---------------------------------------------------------------------------


@app.get("/api/mcp/status")
def mcp_status() -> dict[str, Any]:
    """Live MCP pool snapshot: connected servers, discovered tools, errors.

    The toolbox connects ON FIRST USE (not at app startup), so before any
    MCP-flagged /api/ask request this returns `connected: false`. After the
    first use it returns the persistent pool's state.
    """
    return {
        "default_mode": "mcp" if use_mcp() else "in-process",
        "pool": toolbox_status(),
    }


@app.post("/api/mcp/reconnect")
def mcp_reconnect() -> dict[str, Any]:
    """Admin: drop current MCP pool connections and open a fresh set.

    Useful after changing MCP server code, fixing a Finnhub rate-limit, or
    when a stdio subprocess has died. Returns the freshly-connected pool
    snapshot.
    """
    from app.mcp_client import reconnect_toolbox
    from app.mcp_client.client import MCPClientError

    try:
        reconnect_toolbox()
    except MCPClientError as exc:
        raise HTTPException(status_code=503, detail=f"{exc.code}: {exc.message}") from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"reconnect failed: {exc}") from exc
    return {
        "default_mode": "mcp" if use_mcp() else "in-process",
        "pool": toolbox_status(),
    }


def _build_eval_response(out: dict[str, Any]) -> dict[str, Any]:
    """Shape the runner output into the documented response contract:
    {"metrics": {...}, "failures": [{"id", "reason", "trace"}], ...}"""
    return {
        "metrics": out["metrics"],
        "failures": out["failures"],
        "results": out["results"],
        "evaluated_at": None,  # set by caller if you want an ISO timestamp
    }


def _run_eval(case_id: str | None = None) -> dict[str, Any]:
    """Shared handler used by GET and POST. Fails fast with 401/400
    if the provider can't be reached because of config."""
    try:
        out = run_eval_traced(case_id=case_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surface eval failure as 422
        raise HTTPException(status_code=422, detail=f"eval failed: {exc}") from exc
    return _build_eval_response(out)


@app.post("/api/eval", response_model=None)
def post_eval(req: EvalRequest | None = None) -> dict[str, Any]:
    """Run the eval suite. `case_id` in the body selects one golden test."""
    req = req or EvalRequest()
    return _run_eval(case_id=req.case_id)


@app.get("/api/eval")
def get_eval(
    case: str | None = Query(default=None, description="Single golden case id to run"),
) -> dict[str, Any]:
    return _run_eval(case_id=case)


# ---------------------------------------------------------------------------
# /api/ask — free-text question -> SupervisorAgent (market | filings | both)
#
# Two modes, both share the SAME response contract (so no frontend rework):
#
#   * in-process (default): SupervisorAgent runs Market/Filings specialists
#     in-process against injected services. Fully hermetic, byte-identical
#     to the test suite.
#
#   * mcp: run_ask_over_mcp() routes the SAME classify_question output over the
#     MCP toolbox singleton pool, with the SAME classify + branch calls + ToolRouterAgent
#     BROAD FALLBACK when no branch matched. Opt in per-request or globally
#     with USE_MCP=1 env var.
#
# The agent is built lazily and reused: constructing it wires two LangGraph graphs,
# which we don't want to pay per request, and there's no per-request mutable
# state. The MCP toolbox is similarly a lazy singleton pool.
# ---------------------------------------------------------------------------
_supervisor = None


def _get_supervisor():
    """Lazily build and cache the SupervisorAgent (defaults to in-process
    Market + Filings specialists over the fixture services / stub LLM).

    FILINGS_CORRECTIVE=1 opts the filings branch into Corrective RAG (retrieve
    -> grade -> re-query/fall back). Default OFF keeps /api/ask byte-identical
    to the committed hermetic path (same prompt hashes, same fixtures)."""
    global _supervisor
    if _supervisor is None:
        import os

        from app.agents import FilingsAgent, SupervisorAgent

        corrective = (os.getenv("FILINGS_CORRECTIVE", "") or "").strip().lower() in {"1", "true", "yes", "on"}
        if corrective:
            _supervisor = SupervisorAgent(filings_agent=FilingsAgent(corrective=True))
        else:
            _supervisor = SupervisorAgent()
    return _supervisor


def _query_bool(raw: str | None) -> bool | None:
    """Parse a query-param boolean (case-insensitive); None means not provided."""
    if raw is None:
        return None
    s = raw.strip().lower()
    if s in {"1", "true", "yes", "on"}:
        return True
    if s in {"0", "false", "no", "off"}:
        return False
    return None


def _resolve_use_mcp(per_request: bool | None) -> bool:
    """Resolve the in-process-vs-MCP toggle. Priority:
    1. Explicit per-request flag (GET ?mcp=1 or POST "use_mcp":true).
    2. Global USE_MCP env var.
    3. Default: False (hermetic, byte-identical to committed path).
    """
    if per_request is not None:
        return bool(per_request)
    return use_mcp()


class AskRequest(BaseModel):
    """Body for POST /api/ask. `question` is free text; the supervisor
    classifies it to the market and/or filings specialist.

    `use_mcp` overrides the global USE_MCP env default for this one call."""

    question: str = Field(..., min_length=1, description="The question to route")
    use_mcp: bool | None = Field(
        default=None,
        description="Override USE_MCP env default for this request (true=MCP, false=in-process",
    )


def _shape_groundedness(report: Any) -> dict[str, Any] | None:
    """Compact a GroundednessReport for the wire: score + verdict + offenders.

    None passes through as None (branch not engaged, or a refusal with no
    generated answer to check) so the frontend can distinguish "not checked"
    from "checked and clean"."""
    if report is None:
        return None
    return {
        "score": report.groundedness,
        "grounded": report.grounded,
        "flagged": report.flagged(),
        "unsupported": list(report.unsupported),
    }


def _shape_fallback(fb: Any) -> dict[str, Any] | None:
    """Shape a ToolRouterAgent fallback result for the wire. Only called when
    the router-ran branch fired — returns None when no fallback ran."""
    if fb is None:
        return None
    calls: list[dict[str, Any]] = []
    for c in getattr(fb, "calls", []) or []:
        calls.append(
            {
                "tool": getattr(c, "tool", ""),
                "server": getattr(c, "server", ""),
                "args": getattr(c, "args", {}),
                "ok": getattr(c, "ok", False),
                "output": getattr(c, "output", None),
                "error": getattr(c, "error", None),
            }
        )
    return {
        "ok": bool(calls and all(getattr(c, "ok", False) for c in getattr(fb, "calls", []))),
        "strategy": getattr(fb, "strategy", "keyword"),
        "tool_count": getattr(fb, "tool_count", 0),
        "calls": calls,
    }


def _shape_ask_response(result: Any) -> dict[str, Any]:
    """Flatten a SupervisorResult OR MCPAskResult into a UI-friendly contract.

    Keeps the nested specialist results as their own inspectable objects and
    surfaces each layer's trajectory node-path so the frontend can show *how*
    the answer was reached, not just the text. `mode` tells the frontend
    whether this answer came from in-process agents or from the MCP pool;
    `fallback` is the ToolRouterAgent broad-fallback result (only present for
    MCPAskResult, None for in-process SupervisorResult).
    """
    market = result.market
    filings = result.filings
    mode = "mcp" if hasattr(result, "fallback") else "in-process"
    fallback = getattr(result, "fallback", None)
    return {
        "mode": mode,
        "question": result.question,
        "route": result.route,
        "ok": result.ok(),
        "degraded": result.degraded(),
        # Phase 6: a branch RAN but produced text its own grounding check
        # flagged. Orthogonal to `degraded` (a branch failing to run).
        "hallucination_flagged": result.hallucination_flagged(),
        "summary": result.summary,
        "error": result.error,
        "trajectory": result.trajectory.nodes(),
        "market": None
        if market is None
        else {
            "ok": market.ok(),
            "symbols": market.symbols,
            "summary": getattr(market.synthesis, "summary", "") if market.synthesis else "",
            "insights": getattr(market.synthesis, "insights", []) if market.synthesis else [],
            "groundedness": _shape_groundedness(getattr(market, "groundedness", None)),
            "error": market.error,
            "trajectory": market.trajectory.nodes(),
        },
        "filings": None
        if filings is None
        else {
            "ok": filings.ok(),
            "routed": filings.routed,
            "answer": getattr(filings.answer, "answer", "") if filings.answer else "",
            "citations": getattr(filings.answer, "citations", []) if filings.answer else [],
            "groundedness": _shape_groundedness(getattr(filings, "groundedness", None)),
            "corrective_fallback": getattr(filings, "corrective_fallback", False),
            "error": filings.error,
            "trajectory": filings.trajectory.nodes(),
        },
        "fallback": _shape_fallback(fallback),
    }


def _run_ask(question: str, mcp_flag: bool | None = None) -> dict[str, Any]:
    """Shared handler for GET/POST. A blank question is a 422 (the request is
    malformed); an LLM/config problem is a 400; anything else degrades to 422
    with the failure surfaced rather than a 500 stack trace.

    `mcp_flag` controls which pipeline runs (None = env default):
      False -> in-process SupervisorAgent
      True  -> MCP-backed run_ask_over_mcp()
    """
    q = (question or "").strip()
    if not q:
        raise HTTPException(status_code=422, detail="question must not be empty")
    try:
        if _resolve_use_mcp(mcp_flag):
            from app.agents.mcp_pipeline import run_ask_over_mcp
            result = run_ask_over_mcp(q)
        else:
            result = _get_supervisor().run(q)
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surface agent failure as 422
        raise HTTPException(status_code=422, detail=f"ask failed: {exc}") from exc
    return _shape_ask_response(result)


@app.post("/api/ask", response_model=None)
def post_ask(req: AskRequest) -> dict[str, Any]:
    """Route a free-text question through the supervisor and return the
    merged answer plus each specialist's sub-result and trajectory.

    Set `"use_mcp": true to go through the MCP pool (all discovered MCP servers
    + ToolRouterAgent broad fallback) instead of the default in-process
    specialists.
    """
    return _run_ask(req.question, mcp_flag=req.use_mcp)


@app.get("/api/ask")
def get_ask(
    q: str = Query(..., min_length=1, description="The question to route"),
    mcp: str | None = Query(
        default=None,
        description="1/true/yes=route via MCP pool; 0/false/no=in-process; default=USE_MCP env",
    ),
) -> dict[str, Any]:
    return _run_ask(q, mcp_flag=_query_bool(mcp))



# ---------------------------------------------------------------------------
# /api/ask/autonomous — bounded autonomous MCP investigation
#
# Unlike /api/ask, this endpoint does not pre-classify the request into fixed
# market/filings branches. The autonomous agent discovers the connected MCP
# catalog, asks the configured LLM which tool to use next, observes the result,
# and repeats until it settles or hits AUTONOMOUS_MAX_STEPS.
# ---------------------------------------------------------------------------

def _shape_autonomous_response(result: Any) -> dict[str, Any]:
    return {
        "mode": "autonomous-mcp",
        "question": result.question,
        "ok": result.ok(),
        "degraded": result.degraded(),
        "summary": result.summary,
        "error": result.error,
        "resolution": result.resolution,
        "discovered": result.discovered,
        "calls": [
            {
                "tool": call.tool,
                "arguments": call.arguments,
                "ok": call.ok,
                "output": call.output if call.ok else None,
                "error": call.error,
            }
            for call in result.calls
        ],
        "trajectory": [
            {
                "node": step.node,
                "kind": step.kind,
                "tool": step.tool,
                "args": step.args,
                "ok": step.ok,
                "note": step.note,
                "duration_ms": step.duration_ms,
            }
            for step in result.trajectory.steps
        ],
    }


def _run_autonomous(question: str) -> dict[str, Any]:
    q = (question or "").strip()
    if not q:
        raise HTTPException(status_code=422, detail="question must not be empty")
    try:
        from app.agents.autonomous import AutonomousMCPAgent
        from app.mcp_client.manager import get_toolbox

        result = AutonomousMCPAgent(get_toolbox()).run(q)
    except LLMConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"autonomous ask failed: {exc}") from exc
    return _shape_autonomous_response(result)


@app.post("/api/ask/autonomous", response_model=None)
def post_autonomous_ask(req: AskRequest) -> dict[str, Any]:
    """Run a bounded autonomous investigation over the discovered MCP tools."""
    return _run_autonomous(req.question)


@app.get("/api/ask/autonomous")
def get_autonomous_ask(
    q: str = Query(..., min_length=1, description="The question to investigate autonomously"),
) -> dict[str, Any]:
    return _run_autonomous(q)


# ---------------------------------------------------------------------------
# /api/earnings — past + upcoming earnings with historical price reaction
#
# Backed by the stocks EarningsService (fixture mode = hermetic, live mode =
# Finnhub + candle-derived reactions). The service is built lazily and reused:
# it loads a fixture / wires a candle service we don't want to pay per request,
# and it holds no per-request mutable state. Default symbols match the Progress
# Tracker page scope (NBIS + DGXX).
# ---------------------------------------------------------------------------
_earnings_service = None
DEFAULT_EARNINGS_SYMBOLS = ["NBIS", "DGXX"]


def _get_earnings_service():
    """Lazily build and cache the EarningsService.

    Mode comes from STOCKS_MODE (default "fixture" → hermetic, offline), the
    same env var mcp_servers/stocks/server.py reads. `live` wires the Finnhub
    provider + a live candle service for reaction enrichment.
    """
    global _earnings_service
    if _earnings_service is None:
        import os

        from mcp_servers.stocks.earnings import EarningsService

        mode = os.getenv("STOCKS_MODE", "fixture") or "fixture"
        _earnings_service = EarningsService.from_env(mode)
    return _earnings_service


class EarningsRequest(BaseModel):
    """Body for POST /api/earnings. Omit `symbols` for the default page scope."""

    symbols: list[str] | None = Field(
        default=None, description="Symbols to fetch; defaults to NBIS + DGXX"
    )


def _shape_earnings_event(event: Any) -> dict[str, Any]:
    return {
        "date": event.date,
        "when": event.when,
        "period": event.period,
        "hour": event.hour,
        "eps_actual": event.eps_actual,
        "eps_estimate": event.eps_estimate,
        "revenue_actual": event.revenue_actual,
        "revenue_estimate": event.revenue_estimate,
        "surprise_pct": event.surprise_pct,
        "price_reaction_pct": event.price_reaction_pct,
    }


def _shape_earnings_response(
    histories: dict[str, Any], requested: list[str]
) -> dict[str, Any]:
    """Shape {symbol: EarningsHistory} into the UI contract: one entry per
    symbol with split past/upcoming lists + the next event, and the list of
    requested symbols that produced no data (best-effort degradation)."""
    out: dict[str, Any] = {}
    for symbol, history in histories.items():
        nxt = history.next_event()
        out[symbol] = {
            "symbol": symbol,
            "source": history.source,
            "past": [_shape_earnings_event(e) for e in history.past()],
            "upcoming": [_shape_earnings_event(e) for e in history.upcoming()],
            "next": _shape_earnings_event(nxt) if nxt else None,
        }
    missing = [s for s in requested if s.upper() not in histories]
    return {"symbols": list(histories.keys()), "missing": missing, "earnings": out}


def _run_earnings(symbols: list[str] | None) -> dict[str, Any]:
    """Shared handler for GET/POST. A total outage (every symbol failed) is a
    422 with the failure surfaced; a config problem is a 400."""
    requested = [s.strip().upper() for s in (symbols or DEFAULT_EARNINGS_SYMBOLS) if s and s.strip()]
    if not requested:
        raise HTTPException(status_code=422, detail="at least one symbol is required")
    try:
        histories = _get_earnings_service().get_many(requested)
    except LLMConfigError as exc:  # defensive: earnings path is LLM-free today
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - surface provider failure as 422
        raise HTTPException(status_code=422, detail=f"earnings failed: {exc}") from exc
    return _shape_earnings_response(histories, requested)


@app.post("/api/earnings", response_model=None)
def post_earnings(req: EarningsRequest | None = None) -> dict[str, Any]:
    """Past + upcoming earnings (with historical price reaction) per symbol."""
    req = req or EarningsRequest()
    return _run_earnings(req.symbols)


@app.get("/api/earnings")
def get_earnings(
    symbols: str | None = Query(
        default=None, description="Comma-separated symbols; defaults to NBIS,DGXX"
    ),
) -> dict[str, Any]:
    parsed = [s for s in (symbols or "").split(",")] if symbols else None
    return _run_earnings(parsed)


# ---------------------------------------------------------------------------
# /api/contracts — primary-source contract intelligence from SEC 8-K filings
#
# ContractService filters recent 8-Ks by material-agreement / financial-
# obligation item codes and extracts conservative evidence fields while
# preserving accession numbers + direct EDGAR URLs. It is best-effort per
# symbol and follows FILINGS_MODE/EDGAR_MODE.
# ---------------------------------------------------------------------------
_contract_service = None
DEFAULT_CONTRACT_SYMBOLS = [
    "NVDA",
    "MU",
    "SNDK",
    "AMD",
    "NBIS",
    "DGXX",
    "META",
    "MSFT",
    "GOOGL",
    "NOW",
    "AMZN",
    "CRM",
    "TEAM",
    "TSM",
    "IREN",
    "CIFR",
]


def _get_contract_service():
    global _contract_service
    if _contract_service is None:
        import os

        from mcp_servers.filings.contracts import ContractService

        mode = os.getenv("FILINGS_MODE") or os.getenv("EDGAR_MODE") or "live"
        _contract_service = ContractService.from_env(mode)
    return _contract_service


class ContractRequest(BaseModel):
    """Body for POST /api/contracts. Omit symbols for the default scope."""

    symbols: list[str] | None = Field(
        default=None,
        description="Symbols to fetch; defaults to the AI infrastructure contract universe",
    )


def _shape_contract_record(record: Any) -> dict[str, Any]:
    return {
        "symbol": record.symbol,
        "date": record.date,
        "form": record.form,
        "accession": record.accession,
        "url": record.url,
        "items": record.items,
        "title": record.title,
        "counterparties": record.counterparties,
        "disclosed_values": record.disclosed_values,
        "evidence": record.evidence,
        "source": record.source,
        "confidence": record.confidence,
    }


def _run_contracts(symbols: list[str] | None) -> dict[str, Any]:
    requested = [
        s.strip().upper()
        for s in (symbols or DEFAULT_CONTRACT_SYMBOLS)
        if s and s.strip()
    ]
    if not requested:
        raise HTTPException(status_code=422, detail="at least one symbol is required")
    try:
        timelines = _get_contract_service().get_many(requested)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"contracts failed: {exc}") from exc

    contracts = {
        symbol: {
            "symbol": timeline.symbol,
            "source": timeline.source,
            "contracts": [_shape_contract_record(record) for record in timeline.contracts],
        }
        for symbol, timeline in timelines.items()
    }
    missing = [s for s in requested if s not in timelines]
    return {
        "symbols": list(contracts.keys()),
        "missing": missing,
        "contracts": contracts,
    }


@app.post("/api/contracts", response_model=None)
def post_contracts(req: ContractRequest | None = None) -> dict[str, Any]:
    """Primary-source SEC contract disclosures by symbol."""
    req = req or ContractRequest()
    return _run_contracts(req.symbols)


@app.get("/api/contracts")
def get_contracts(
    symbols: str | None = Query(
        default=None,
        description="Comma-separated symbols; defaults to the AI infrastructure contract universe",
    ),
) -> dict[str, Any]:
    parsed = [s for s in symbols.split(",")] if symbols else None
    return _run_contracts(parsed)


# ---------------------------------------------------------------------------
# /api/milestones — auto-maintained milestone timeline from SEC 8-K filings
#
# Backed by MilestoneService over the EdgarClient. Unlike earnings (fixture by
# default), milestones default to LIVE EDGAR — the point is a self-updating
# timeline of each company's material events. Set EDGAR_MODE=fixture (or
# FILINGS_MODE) for a hermetic/offline run (tests, CI, no network). Default
# symbols match the tracker page's watchlist scope.
# ---------------------------------------------------------------------------
_milestone_service = None
_milestone_candle_service = None
DEFAULT_MILESTONE_SYMBOLS = [
    "NVDA",
    "MU",
    "SNDK",
    "AMPG",
    "AMD",
    "NBIS",
    "DGXX",
    "META",
    "MSFT",
    "GOOG",
    "NOW",
]


def _get_milestone_service():
    """Lazily build and cache the MilestoneService.

    Mode resolves from FILINGS_MODE, then EDGAR_MODE, defaulting to "live" so
    the timeline auto-updates from real 8-K filings. `live` requires a
    descriptive EDGAR_USER_AGENT (SEC blocks blank-UA requests).
    """
    global _milestone_service
    if _milestone_service is None:
        import os

        from mcp_servers.filings.milestones import MilestoneService

        mode = (
            os.getenv("FILINGS_MODE")
            or os.getenv("EDGAR_MODE")
            or "live"
        )
        _milestone_service = MilestoneService.from_env(mode)
    return _milestone_service


def _get_milestone_candle_service():
    """Best-effort daily price history for milestone date enrichment.

    Uses the same stocks candle service as the rest of the backend. Set
    CANDLES_MODE=fixture for tests/offline runs. In normal use it defaults to
    live Stooq daily closes so the Tracker can show price-at-milestone without
    requiring a market-data API key.
    """
    global _milestone_candle_service
    if _milestone_candle_service is None:
        import os

        from mcp_servers.stocks.candles import CandleService

        mode = (
            os.getenv("CANDLES_MODE")
            or os.getenv("STOCKS_MODE")
            or "live"
        )
        _milestone_candle_service = CandleService.from_env(mode, lookback=900)
    return _milestone_candle_service


class MilestoneRequest(BaseModel):
    """Body for POST /api/milestones. Omit `symbols` for the default page scope."""

    symbols: list[str] | None = Field(
        default=None, description="Symbols to fetch; defaults to the watchlist"
    )


def _price_on_or_before(candles: list[Any], event_date: str) -> Any | None:
    """Return the latest candle on/before the event date, else None."""
    eligible = [c for c in candles if getattr(c, "date", "") <= event_date]
    return eligible[-1] if eligible else None


def _shape_milestone_event(
    event: Any,
    price_by_date: dict[str, Any] | None = None,
    price_source: str | None = None,
) -> dict[str, Any]:
    candle = _price_on_or_before(list((price_by_date or {}).values()), event.date)
    return {
        "date": event.date,
        "title": event.title,
        "description": event.description,
        "status": event.status,
        "form": event.form,
        "accession": event.accession,
        "url": event.url,
        "items": list(event.items),
        "price_at_event": candle.close if candle else None,
        "price_date": candle.date if candle else None,
        "price_source": price_source,
    }


def _shape_milestone_response(
    timelines: dict[str, Any], requested: list[str]
) -> dict[str, Any]:
    """Shape {symbol: MilestoneTimeline} into the UI contract: one entry per
    symbol with its newest-first events + provenance, and the list of requested
    symbols that produced no data (best-effort degradation)."""
    price_histories: dict[str, Any] = {}
    try:
        price_histories = _get_milestone_candle_service().get_histories(
            list(timelines.keys()), lookback=900
        )
    except Exception:  # noqa: BLE001 - price enrichment must not break filings
        price_histories = {}

    out: dict[str, Any] = {}
    for symbol, timeline in timelines.items():
        series = price_histories.get(symbol)
        price_by_date = {c.date: c for c in series.candles} if series else {}
        out[symbol] = {
            "symbol": symbol,
            "source": timeline.source,
            "price_source": series.source if series else None,
            "events": [
                _shape_milestone_event(
                    e,
                    price_by_date=price_by_date,
                    price_source=series.source if series else None,
                )
                for e in timeline.events
            ],
        }
    missing = [s for s in requested if s.upper() not in timelines]
    return {"symbols": list(timelines.keys()), "missing": missing, "milestones": out}


def _run_milestones(symbols: list[str] | None) -> dict[str, Any]:
    """Shared handler for GET/POST. A total outage (every symbol failed) is a
    422 with the failure surfaced, so the page shows an error notice rather than
    a blank panel."""
    requested = [
        s.strip().upper() for s in (symbols or DEFAULT_MILESTONE_SYMBOLS) if s and s.strip()
    ]
    if not requested:
        raise HTTPException(status_code=422, detail="at least one symbol is required")
    try:
        timelines = _get_milestone_service().get_many(requested)
    except Exception as exc:  # noqa: BLE001 - surface EDGAR failure as 422
        raise HTTPException(status_code=422, detail=f"milestones failed: {exc}") from exc
    return _shape_milestone_response(timelines, requested)


@app.post("/api/milestones", response_model=None)
def post_milestones(req: MilestoneRequest | None = None) -> dict[str, Any]:
    """Auto-maintained milestone timeline (from SEC 8-K filings) per symbol."""
    req = req or MilestoneRequest()
    return _run_milestones(req.symbols)


@app.get("/api/milestones")
def get_milestones(
    symbols: str | None = Query(
        default=None, description="Comma-separated symbols; defaults to the watchlist"
    ),
) -> dict[str, Any]:
    parsed = [s for s in (symbols or "").split(",")] if symbols else None
    return _run_milestones(parsed)


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "service": "ai-infra-watch backend",
        "version": "0.6.0",
        "docs": "/docs",
        "eval": "/api/eval",
        "ask": "/api/ask",
        "ask_mcp": "/api/ask?mcp=1",
        "ask_autonomous": "/api/ask/autonomous",
        "earnings": "/api/earnings",
        "milestones": "/api/milestones",
        "mcp_status": "/api/mcp/status",
        "health": "/api/health",
    }
