"""MCP-backed Ask pipeline — Supervisor-style classify + route, but over LIVE MCP.

The classic `/api/ask` runs in-process specialists (`MarketAgent`, `FilingsAgent`)
wired to injected services. That's hermetic and fast for tests, but it CAN'T
discover new data sources — every provider is a Python import + code change.

This module is the opposite:

  1. Reuse the EXISTING `classify_question` keyword router so route semantics
     (market / filings / both) stay byte-identical to the in-process path.
  2. Instead of calling `MarketAgent.run()`, call `MCPToolbox.call("stocks.get_snapshot")`
     + synthesize. Instead of `FilingsAgent.run(q)`, call `MCPToolbox.call("filings.answer_question", {"question": q})`.
  3. Run `ToolRouterAgent` as a BROAD FALLBACK — when neither stocks nor
     filings matched, ask the router to scan the entire live tool catalog.
     That's the magic: add an MCP server (news, options, congress, macro)
     and THIS pipeline uses it with ZERO code changes.

The pipeline returns a `SupervisorResult`-shaped object so the existing
`_shape_ask_response()` contract in main.py needs NO changes.
"""
from __future__ import annotations

import operator
from dataclasses import dataclass
from typing import Any

from app.agents.schemas import (
    FilingsAgentResult,
    MarketAgentResult,
    RouterAgentResult,
    SupervisorResult,
)
from app.agents.supervisor import classify_question
from app.agents.trajectory import AgentTrajectory, Step, tool_call
from app.mcp_client import MCPToolbox
from app.mcp_client.client import MCPClientError
from app.agents.router import ToolRouterAgent, keyword_router


@dataclass
class MCPAskResult:
    """Output of run_ask_over_mcp. Shaped like SupervisorResult.

    `route` / `market` / `filings` / `summary` / `error` / `trajectory`
    mirror SupervisorResult so `_shape_ask_response()` consumes both.
    `fallback` is the ToolRouterAgent result when the broad-fallback ran.
    """

    question: str
    route: str  # "market" | "filings" | "both" | "fallback"
    market: MarketAgentResult | None
    filings: FilingsAgentResult | None
    summary: str
    error: str
    trajectory: AgentTrajectory
    fallback: RouterAgentResult | None = None

    def ok(self) -> bool:
        succeeded = (self.market is not None and _market_ok(self.market)) or (
            self.filings is not None and _filings_ok(self.filings)
        )
        if self.fallback is not None and self.fallback.calls:
            succeeded = succeeded or any(c.ok for c in self.fallback.calls)
        return bool(self.summary) and succeeded

    def degraded(self) -> bool:
        if not self.ok():
            return False
        branch_failed = any(
            r is not None and not _ok(r) for r in (self.market, self.filings)
        )
        return bool(self.error) or branch_failed

    def hallucination_flagged(self) -> bool:
        for r in (self.market, self.filings):
            if r is not None and getattr(r, "groundedness", None) is not None:
                g = r.groundedness
                if getattr(g, "flagged", lambda: False)():
                    return True
        return False


def _ok(r: Any) -> bool:
    fn = getattr(r, "ok", None)
    return bool(fn and fn())


def _market_ok(m: MarketAgentResult) -> bool:
    return m.synthesis is not None and not m.error


def _filings_ok(f: FilingsAgentResult) -> bool:
    return f.routed == "generate" and f.answer is not None and not f.error


def _summary_text(
    market: MarketAgentResult | None,
    filings: FilingsAgentResult | None,
    fallback: RouterAgentResult | None,
) -> str:
    parts: list[str] = []
    if market is not None and _market_ok(market):
        s = getattr(market.synthesis, "summary", "")
        if s:
            parts.append("Market: " + s)
    if filings is not None and _filings_ok(filings):
        a = getattr(filings.answer, "answer", "")
        if a:
            parts.append("Filings: " + a)
    if fallback is not None and fallback.calls:
        ok_calls = [c for c in fallback.calls if c.ok]
        if ok_calls:
            for c in ok_calls:
                out = c.output
                preview = str(out)
                if len(preview) > 500:
                    preview = preview[:500] + "..."
                parts.append(f"[{c.tool}] {preview}")
    return "\n\n".join(parts) or "No MCP tool produced a usable answer."


def _market_via_mcp(toolbox: MCPToolbox) -> tuple[MarketAgentResult | None, list[Step], str]:
    """Call stocks.get_snapshot + build a MarketAgentResult-shaped object.

    If the stocks server is not connected or the call fails, returns
    (None, [failed_step], error_text) so the supervisor degrades this branch.
    """
    steps: list[Step] = []
    try:
        snap = toolbox.call("stocks.get_snapshot")
    except MCPClientError as exc:
        step = tool_call("stocks.get_snapshot", note=exc.code, ok=False)
        return None, [step], f"stocks_failed: {exc.code}: {exc.message}"
    except Exception as exc:  # noqa: BLE001
        step = tool_call("stocks.get_snapshot", note=type(exc).__name__, ok=False)
        return None, [step], f"stocks_failed: {exc}"

    steps.append(tool_call("stocks.get_snapshot", note=f"ok: {len(snap.get('quotes', []))} quotes"))

    quotes = snap.get("quotes", []) or []
    symbols = [q.get("symbol", "") for q in quotes if q.get("symbol")]

    lines: list[str] = []
    insights: list[Any] = []
    for q in quotes:
        sym = q.get("symbol", "?")
        price = q.get("price")
        change_pct = q.get("change_pct")
        line_parts = [f"{sym}"]
        if price is not None:
            line_parts.append(f"${price}")
        if change_pct is not None:
            arrow = "up" if change_pct >= 0 else "down"
            line_parts.append(f"{arrow} {change_pct:+.2f}%")
        lines.append(" ".join(line_parts))
        try:
            from app.synthesis.pipeline import TickerInsight
            insights.append(
                TickerInsight(
                    ticker=sym,
                    move_pct=float(change_pct) if change_pct is not None else 0.0,
                    reason=f"Last price ${price}" if price is not None else "From MCP snapshot",
                )
            )
        except Exception:  # noqa: BLE001 — fall through to plain string fallback if import fails
            pass

    summary = " | ".join(lines) if lines else "No quotes returned."

    from app.synthesis.pipeline import MarketSynthesis

    synthesis = MarketSynthesis(
        date=snap.get("as_of", "") or "",
        summary=summary,
        insights=insights,
        risks=[],
        generated_by="mcp-market",
    )
    result = MarketAgentResult(
        synthesis=synthesis,
        symbols=symbols,
        error="",
        groundedness=None,
        trajectory=AgentTrajectory(steps=steps),
    )
    return result, steps, ""


def _filings_via_mcp(
    toolbox: MCPToolbox, question: str
) -> tuple[FilingsAgentResult | None, list[Step], str]:
    """Call filings.answer_question + build a FilingsAgentResult-shaped object."""
    steps: list[Step] = []
    try:
        res = toolbox.call("filings.answer_question", {"question": question})
    except MCPClientError as exc:
        step = tool_call("filings.answer_question", {"question": question}, note=exc.code, ok=False)
        return None, [step], f"filings_failed: {exc.code}: {exc.message}"
    except Exception as exc:  # noqa: BLE001
        step = tool_call("filings.answer_question", {"question": question}, note=type(exc).__name__, ok=False)
        return None, [step], f"filings_failed: {exc}"

    steps.append(
        tool_call(
            "filings.answer_question",
            {"question": question},
            note=f"ok: {len(res.get('answer', ''))} chars, {len(res.get('citations', []))} cites",
        )
    )

    answer_text = res.get("answer", "") or ""
    citations_raw = res.get("citations", []) or []
    routed = "generate" if answer_text else "no_answer"

    from mcp_servers.filings.schemas import AnswerResult, Citation

    citations = [
        Citation(
            document_id=c.get("document_id", ""),
            chunk_index=c.get("chunk_index", 0),
            text=c.get("text", ""),
            score=float(c.get("score", 0.0)),
            source=c.get("source", ""),
        )
        for c in citations_raw
    ]
    answer = AnswerResult(
        answer=answer_text,
        citations=citations,
        sources_footer=res.get("sources_footer", ""),
    )

    result = FilingsAgentResult(
        question=question,
        answer=answer,
        routed=routed,
        error="",
        groundedness=None,
        corrective_fallback=bool(res.get("corrective_fallback", False)),
        trajectory=AgentTrajectory(steps=steps),
    )
    return result, steps, ""


def run_ask_over_mcp(
    question: str,
    toolbox: MCPToolbox | None = None,
    router_strategy: Any = keyword_router,
) -> MCPAskResult:
    """Route `question` through the connected MCP toolbox and return a shaped result.

    Flow:
      1. classify_question (same as SupervisorAgent) -> market | filings | both
      2. For each branch, call the matching MCP tool over `toolbox`
      3. Merge summaries
      4. If neither branch produced anything, fall back to ToolRouterAgent
         over the full live tool catalog — this is the "discover ANY new
         server with zero code changes" path.
    """
    from app.mcp_client.manager import get_toolbox

    tb = toolbox or get_toolbox()
    route = classify_question(question)

    all_steps: list[Step] = []
    errors: list[str] = []
    market_result: MarketAgentResult | None = None
    filings_result: FilingsAgentResult | None = None
    fallback_result: RouterAgentResult | None = None
    final_route = route

    run_market = route in {"market", "both"}
    run_filings = route in {"filings", "both"}

    all_steps.append(Step(node="classify", kind="node", note=f"route={route}"))

    if run_market:
        all_steps.append(Step(node="market", kind="node"))
        mr, ms, me = _market_via_mcp(tb)
        all_steps.extend(ms)
        market_result = mr
        if me:
            errors.append(me)

    if run_filings:
        all_steps.append(Step(node="filings", kind="node"))
        fr, fs, fe = _filings_via_mcp(tb, question)
        all_steps.extend(fs)
        filings_result = fr
        if fe:
            errors.append(fe)

    any_branch_usable = (market_result is not None and _market_ok(market_result)) or (
        filings_result is not None and _filings_ok(filings_result)
    )

    if not any_branch_usable:
        try:
            router = ToolRouterAgent(tb, strategy=router_strategy)
            fallback_result = router.run(question)
            all_steps.extend(fallback_result.trajectory.steps)
            final_route = "fallback"
        except Exception as exc:  # noqa: BLE001
            errors.append(f"fallback_failed: {exc}")
            step = tool_call("mcp.router", note=type(exc).__name__, ok=False)
            all_steps.append(step)

    summary = _summary_text(market_result, filings_result, fallback_result)

    return MCPAskResult(
        question=question,
        route=final_route,
        market=market_result,
        filings=filings_result,
        summary=summary,
        error="; ".join(errors),
        trajectory=AgentTrajectory(steps=all_steps),
        fallback=fallback_result,
    )


__all__ = ["MCPAskResult", "run_ask_over_mcp"]
