"""MarketAgent — a LangGraph agent that turns a watchlist into a synthesis.

Graph shape (hand-built StateGraph, not create_react_agent, so every
LLM call maps to a committed fixture by exact prompt hash):

    gather_quotes -> build_data -> (has data?) -> synthesize -> finalize
                                        \\-> finalize   (degraded: no data)

Design notes
------------
* `gather_quotes` is best-effort: `StockService.get_quotes` already omits
  symbols that error and only raises when EVERY symbol fails, so a partial
  outage still produces a synthesis over whatever survived. A total outage
  (QuoteError) is caught here, recorded as a failed tool step, and routed
  straight to `finalize` — the agent degrades, it does not crash.
* `synthesize` reuses the production `synthesize()` pipeline with the
  agent's own `LLMClient`, so the market agent and the /api/eval path grade
  identically and share fixtures.
* Every node is wrapped in `traced_node`, so the returned trajectory is a
  faithful, ordered record of nodes visited + tools called — the substrate
  the agent tests assert against (trajectory / tool-call / state-machine).
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents._convert import quotes_to_stock_data, stock_data_facts
from app.agents.schemas import MarketAgentResult
from app.rag.groundedness import check_groundedness
from app.agents.trajectory import AgentTrajectory, Step, llm_call, tool_call, traced_node
from app.llm.client import LLMClient
from app.synthesis.pipeline import MarketSynthesis, synthesize
from mcp_servers.stocks.providers import QuoteError
from mcp_servers.stocks.service import StockService


class MarketState(TypedDict, total=False):
    symbols: list[str]
    question: str
    stock_data: list[dict[str, Any]]
    synthesis: MarketSynthesis | None
    error: str
    # Trajectory accumulates across nodes via the list-add reducer.
    steps: Annotated[list[Step], operator.add]


def build_market_graph(service: StockService, client: LLMClient):
    """Compile the market agent's state graph over an injected service+client."""

    @traced_node("gather_quotes")
    def gather_quotes(state: MarketState) -> dict:
        symbols = state.get("symbols") or service.list_watchlist()
        try:
            batch = service.get_quotes(symbols)
        except QuoteError as exc:
            # Total outage: no data at all. Record the failure, hand an
            # empty batch downstream so the router degrades to finalize.
            step = tool_call("stocks.get_quotes", {"symbols": symbols}, note=exc.code, ok=False)
            return {"stock_data": [], "error": f"{exc.code}: {exc.message}", "steps": [step]}
        rows = quotes_to_stock_data(batch)
        step = tool_call(
            "stocks.get_quotes",
            {"symbols": symbols},
            note=f"{len(rows)} quotes",
        )
        return {"stock_data": rows, "steps": [step]}

    @traced_node("build_data")
    def build_data(state: MarketState) -> dict:
        # Conversion already happened in gather_quotes; this node is the
        # explicit "shape the model input" checkpoint the router branches on.
        rows = state.get("stock_data") or []
        return {"_note": f"{len(rows)} rows ready"}

    def route_after_build(state: MarketState) -> str:
        return "synthesize" if state.get("stock_data") else "finalize"

    @traced_node("synthesize", kind="node")
    def synthesize_node(state: MarketState) -> dict:
        rows = state.get("stock_data") or []
        try:
            result = synthesize(rows, client=client, question=state.get("question", ""))
        except Exception as exc:  # narrow synthesis/parse failure -> degrade
            step = llm_call("synthesis.synthesize", note=type(exc).__name__, ok=False)
            return {"synthesis": None, "error": f"synthesis_failed: {exc}", "steps": [step]}
        step = llm_call("synthesis.synthesize", note=f"{len(result.insights)} insights")
        return {"synthesis": result, "steps": [step]}

    @traced_node("finalize")
    def finalize(state: MarketState) -> dict:
        return {"_note": "done"}

    graph = StateGraph(MarketState)
    graph.add_node("gather_quotes", gather_quotes)
    graph.add_node("build_data", build_data)
    graph.add_node("synthesize", synthesize_node)
    graph.add_node("finalize", finalize)

    graph.add_edge(START, "gather_quotes")
    graph.add_edge("gather_quotes", "build_data")
    graph.add_conditional_edges(
        "build_data",
        route_after_build,
        {"synthesize": "synthesize", "finalize": "finalize"},
    )
    graph.add_edge("synthesize", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


class MarketAgent:
    """Watchlist -> grounded market synthesis, with a recorded trajectory."""

    def __init__(
        self,
        service: StockService | None = None,
        client: LLMClient | None = None,
        recursion_limit: int = 25,
    ) -> None:
        self.service = service or StockService.from_env("fixture")
        self.client = client or LLMClient()
        self.recursion_limit = recursion_limit
        self.graph = build_market_graph(self.service, self.client)

    def run(self, symbols: list[str] | None = None, question: str = "") -> MarketAgentResult:
        state: MarketState = {"symbols": symbols or [], "question": question, "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        synthesis = final.get("synthesis")
        # Hallucination detection (Phase 6): ground the generated summary
        # against the data facts it was synthesized from (the same fact set
        # /api/eval grades against). Only when a synthesis was produced — a
        # degraded (no-data) run has no summary to check.
        groundedness = None
        if synthesis is not None:
            facts = stock_data_facts(final.get("stock_data") or [])
            # A summary claim typically spans SEVERAL rows ("NVDA, MSFT ...
            # gained while NBIS slipped"), so it grounds against no single
            # per-ticker fact. Add the union of all facts as one candidate —
            # the exact source-set shaping app/eval/run_eval.check_grounding
            # uses — so a multi-fact claim grounds against the whole data set.
            sources = facts + ([" ".join(facts)] if facts else [])
            groundedness = check_groundedness(synthesis.summary, sources)
        return MarketAgentResult(
            synthesis=synthesis,
            symbols=list(symbols or self.service.list_watchlist()),
            error=final.get("error", ""),
            groundedness=groundedness,
            trajectory=AgentTrajectory(steps=final.get("steps", [])),
        )
