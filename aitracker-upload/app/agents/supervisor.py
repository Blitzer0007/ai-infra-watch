"""SupervisorAgent — the Phase-5 multi-agent orchestrator.

Graph shape (hand-built StateGraph, deterministic classify + merge, so the
supervisor holds NO LLMClient and needs NO fixture — the routing is the only
thing under test):

    classify -> (route?) -> market  -\\
                        \\-> filings -+-> merge -> END
                         \\-> both = [market, filings]  (parallel fan-out)

Design notes
------------
* `classify` is a keyword classifier (`classify_question`), unit-testable in
  isolation. A cross-domain question fans out to BOTH specialists in parallel
  via a list-returning conditional edge; the `Annotated[list, operator.add]`
  step reducer accumulates both branches' steps and `merge` runs exactly once
  (fan-in).
* Specialists are called ONLY through their `.run()` -> pydantic-result
  interface — the supervisor never reaches into a specialist's graph/state.
  This is the roadmap's Agent-Isolation precondition and lets tests inject
  fake specialists to exercise orchestration without the real agents.
* Each delegation is wrapped in try/except: a specialist crash is recorded as
  a failed delegation step + a branch `error`, and the surviving specialist's
  answer still flows through `merge` (graceful degradation, roadmap chaos
  strategy). The supervisor degrades, it does not crash.
* `merge` uses an injectable `combiner` (default: deterministic text merge, no
  LLM call). Swap via `SupervisorAgent(combiner=...)` to upgrade to an LLM
  synthesizer later without changing the graph shape.
"""
from __future__ import annotations

import operator
from typing import Annotated, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.filings import FilingsAgent
from app.agents.market import MarketAgent
from app.agents.rotation import RotationAgent, RotationAgentResult
from app.agents.schemas import FilingsAgentResult, MarketAgentResult, SupervisorResult
from app.agents.trajectory import AgentTrajectory, Step, tool_call, traced_node

# Keyword cues for the deterministic router. Kept intentionally small and
# lexical: the classifier is a routing decision, not an answer, so it stays
# fixture-free and fully unit-testable.
MARKET_CUES = {
    "stock", "price", "move", "moved", "gain", "drop", "fell", "rose",
    "watchlist", "quote", "ticker", "today", "session", "up", "down", "%",
}
FILINGS_CUES = {
    "revenue", "filing", "10-k", "risk", "segment", "grow", "growth",
    "earnings", "margin", "guidance", "data center", "capital", "disclosed",
    "expenditure",
}
ROTATION_CUES = {
    "rotation", "rotate", "sector rot", "money flow", "flow", "capital flow",
    "hardware vs software", "hw vs sw", "ai hardware", "ai application",
    "ai software", "ai app", "outperformer", "laggard", "diverge",
    "divergence", "spread", "legs", "into ai", "out of ai",
}

# Combiner signature: (question, market_result, filings_result) -> summary text.
Combiner = Callable[[str, MarketAgentResult | None, FilingsAgentResult | None], str]


def _merge_error(left: str, right: str) -> str:
    """Reducer for the `error` channel: both parallel branches may report a
    failure in the same super-step, so errors must accumulate (a LastValue
    channel would raise InvalidUpdateError on the concurrent write)."""
    parts = [p for p in (left, right) if p]
    return "; ".join(parts)


def classify_question(question: str) -> str:
    """Route a question to "market", "filings", or "both" by keyword cues.

    Neutral (no cue) defaults to "market" — a watchlist overview is the
    sensible fallback for an unqualified question.
    """
    ql = question.lower()
    has_m = any(cue in ql for cue in MARKET_CUES)
    has_f = any(cue in ql for cue in FILINGS_CUES)
    if has_m and has_f:
        return "both"
    if has_f:
        return "filings"
    # Market cue OR no cue at all both fall through to "market": a watchlist
    # overview is the sensible default for an unqualified question.
    return "market"


def default_combine(
    question: str,
    market_result: MarketAgentResult | None,
    filings_result: FilingsAgentResult | None,
) -> str:
    """Merge specialist outputs into one text block — no LLM call.

    Pure and deterministic, so the supervisor stays fixture-free. Swap via
    `SupervisorAgent(combiner=...)` to upgrade to an LLM synthesizer without
    changing the graph.
    """
    parts: list[str] = []
    if market_result is not None and market_result.ok():
        parts.append("Market: " + market_result.synthesis.summary)
    if filings_result is not None and filings_result.ok():
        parts.append("Filings: " + filings_result.answer.answer)
    return "\n\n".join(parts) or "No specialist produced a usable answer."


class SupervisorState(TypedDict, total=False):
    question: str
    route: str  # "market" | "filings" | "both"
    market_result: MarketAgentResult | None
    filings_result: FilingsAgentResult | None
    summary: str
    error: Annotated[str, _merge_error]
    # Trajectory accumulates across nodes (incl. parallel branches) via the reducer.
    steps: Annotated[list[Step], operator.add]


def build_supervisor_graph(
    market_agent: MarketAgent,
    filings_agent: FilingsAgent,
    combiner: Combiner,
):
    """Compile the supervisor's state graph over injected specialists + combiner."""

    @traced_node("classify")
    def classify(state: SupervisorState) -> dict:
        route = classify_question(state.get("question", ""))
        return {"route": route, "_note": f"route={route}"}

    def route_question(state: SupervisorState) -> list[str]:
        # Total by construction: the conditional-edge map only wires "market"
        # and "filings", so any route the classifier emits that isn't one of
        # those (or "both") must clamp to a real destination — otherwise
        # LangGraph raises KeyError on the unknown branch. An injected or
        # upgraded classifier degrades to the market overview instead of
        # crashing the supervisor.
        route = state.get("route", "market")
        if route == "both":
            return ["market", "filings"]
        if route in {"market", "filings"}:
            return [route]
        return ["market"]

    @traced_node("market")
    def market_node(state: SupervisorState) -> dict:
        try:
            # The market specialist is a daily-overview ("what moved today")
            # over the watchlist snapshot; it is intentionally NOT conditioned
            # on the free-text question, so the offline stub demo answers any
            # market route from the one committed overview fixture. Query-
            # conditioned synthesis is exercised via the eval path + live mode.
            result = market_agent.run()
        except Exception as exc:  # specialist crash -> degrade this branch
            step = tool_call("agent:market", note=type(exc).__name__, ok=False)
            return {"market_result": None, "error": f"market_failed: {exc}", "steps": [step]}
        if result is None:  # misbehaving specialist -> degrade, don't crash
            step = tool_call("agent:market", note="no result", ok=False)
            return {"market_result": None, "error": "market_failed: no result", "steps": [step]}
        note = "ok" if result.ok() else (result.error or "no synthesis")
        step = tool_call("agent:market", note=note, ok=result.ok())
        return {"market_result": result, "steps": [step]}

    @traced_node("filings")
    def filings_node(state: SupervisorState) -> dict:
        question = state.get("question", "")
        try:
            result = filings_agent.run(question)
        except Exception as exc:  # specialist crash -> degrade this branch
            step = tool_call("agent:filings", note=type(exc).__name__, ok=False)
            return {"filings_result": None, "error": f"filings_failed: {exc}", "steps": [step]}
        if result is None:  # misbehaving specialist -> degrade, don't crash
            step = tool_call("agent:filings", note="no result", ok=False)
            return {"filings_result": None, "error": "filings_failed: no result", "steps": [step]}
        note = "ok" if result.ok() else (result.routed or result.error or "no answer")
        step = tool_call("agent:filings", note=note, ok=result.ok())
        return {"filings_result": result, "steps": [step]}

    @traced_node("merge")
    def merge(state: SupervisorState) -> dict:
        summary = combiner(
            state.get("question", ""),
            state.get("market_result"),
            state.get("filings_result"),
        )
        return {"summary": summary, "_note": f"{len(summary)} chars"}

    graph = StateGraph(SupervisorState)
    graph.add_node("classify", classify)
    graph.add_node("market", market_node)
    graph.add_node("filings", filings_node)
    graph.add_node("merge", merge)

    graph.add_edge(START, "classify")
    graph.add_conditional_edges(
        "classify",
        route_question,
        {"market": "market", "filings": "filings"},
    )
    graph.add_edge("market", "merge")
    graph.add_edge("filings", "merge")
    graph.add_edge("merge", END)
    return graph.compile()


class SupervisorAgent:
    """Routes a question to the Market/Filings specialists (or both) and merges."""

    def __init__(
        self,
        market_agent: MarketAgent | None = None,
        filings_agent: FilingsAgent | None = None,
        combiner: Combiner = default_combine,
        recursion_limit: int = 25,
    ) -> None:
        self.market_agent = market_agent or MarketAgent()
        self.filings_agent = filings_agent or FilingsAgent()
        self.combiner = combiner
        self.recursion_limit = recursion_limit
        self.graph = build_supervisor_graph(
            self.market_agent, self.filings_agent, self.combiner
        )

    def run(self, question: str) -> SupervisorResult:
        state: SupervisorState = {"question": question, "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        return SupervisorResult(
            question=question,
            route=final.get("route", ""),
            market=final.get("market_result"),
            filings=final.get("filings_result"),
            summary=final.get("summary", ""),
            error=final.get("error", ""),
            trajectory=AgentTrajectory(steps=final.get("steps", [])),
        )
