"""ToolRouterAgent — a LangGraph agent that discovers MCP tools at RUNTIME.

Every other specialist in this repo is wired to a hardcoded service dependency
(`StockService`, `Retriever`) injected at construction. This agent is different:
it takes an `MCPToolbox` and, at run time, asks it what tools the connected MCP
servers advertise, then routes the question to the best-matching tool(s) and
calls them over the wire. Add a new MCP server (or a new tool on an existing
one) and this agent can route to it with NO code change — that is the point of
dynamic tool routing.

Graph shape (hand-built StateGraph, no LLM in the default path):

    discover -> route -> (any plan?) -> execute -> finalize
                              \\-> finalize   (no tool matched)

Design notes
------------
* `discover` reads the live tool catalog from the toolbox and records it as a
  `mcp.discover` tool step, so the "discover before you route" ordering is
  visible in the trajectory (the same discipline as retrieve-before-generate).
* `route` delegates to an injectable **routing strategy** — a pure function
  `strategy(question, tools) -> list[ToolPlan]`. The default `keyword_router`
  is deterministic (no LLM), so the hermetic suite needs no fixtures; an
  LLM-backed strategy can be dropped in later behind the same seam. The
  strategy is responsible for BOTH picking tools and building their arguments
  from each tool's advertised `input_schema` — and it refuses to plan a tool
  whose required params it cannot satisfy (so a call never fails on a missing
  argument the router should have caught).
* `execute` calls each planned tool through the toolbox and records one tool
  step per call. A single tool erroring is caught, recorded (`ok=False`), and
  does not abort the remaining calls — the agent degrades, it does not crash.
* A question that matches no tool routes straight to `finalize` with an empty
  plan: a clean "I have no tool for this" outcome, not a failure.
"""
from __future__ import annotations

import operator
import re
from typing import Annotated, Any, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.schemas import RouterAgentResult, ToolCallRecord, ToolPlan
from app.agents.trajectory import AgentTrajectory, Step, tool_call, traced_node
from app.mcp_client import MCPToolbox, ToolInfo
from app.mcp_client.client import MCPClientError

# A RoutingStrategy maps a question + the discovered tool catalog to an ordered
# list of tool plans (best match first). Injected so an LLM router can replace
# the deterministic default without touching the graph.
RoutingStrategy = Callable[[str, list[ToolInfo]], list["ToolPlan"]]

# Tokens too generic to carry routing signal. Kept deliberately small: verbs
# like "get"/"list" DO appear in tool names and are useful signal, so they are
# NOT stopwords here.
_STOPWORDS = frozenset(
    {
        "the", "a", "an", "of", "for", "to", "in", "on", "is", "are", "and",
        "or", "what", "whats", "how", "do", "does", "me", "my", "our", "with",
        "about", "please", "can", "you", "i", "it", "this", "that", "s",
    }
)

# Keys we know how to fill from the question text when a tool requires them.
# A tool whose required params fall outside this set (e.g. a bare `symbol` we
# cannot reliably extract) is skipped rather than called with a guessed value.
_QUESTION_KEYS = frozenset({"question", "query", "q", "text", "prompt"})


def _tokenize(text: str) -> list[str]:
    """Lowercase word tokens with stopwords + 1-char noise removed."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    return [w for w in words if len(w) > 1 and w not in _STOPWORDS]


def _tool_vocab(tool: ToolInfo) -> set[str]:
    """The bag of tokens a tool advertises (name split on _ + its description)."""
    vocab = set(_tokenize(tool.name.replace("_", " ")))
    vocab.update(_tokenize(tool.description or ""))
    return vocab


def _required_params(tool: ToolInfo) -> list[str]:
    schema = tool.input_schema or {}
    req = schema.get("required")
    return list(req) if isinstance(req, list) else []


_COMMON_UPPERCASE_WORDS = frozenset({
    "I", "AI", "US", "UK", "CEO", "CFO", "CTO", "SEC", "ETF", "IPO",
    "EPS", "GDP", "CPI", "MCP", "LLM", "API", "RAG", "Q1", "Q2", "Q3", "Q4",
})


def extract_symbols(question: str, max_symbols: int = 10) -> list[str]:
    """Extract explicit ticker symbols from natural-language questions.

    Supports dollar-prefixed symbols, "ticker/symbol/stock NAME" phrases,
    and conservative uppercase ticker tokens.
    """
    symbols: list[str] = []

    for match in re.finditer(r"\$([A-Z][A-Z0-9.-]{0,5})\b", question):
        sym = match.group(1).upper()
        if sym not in symbols:
            symbols.append(sym)

    for match in re.finditer(
        r"\b(?:ticker|symbol|stock)\s*[:#-]?\s*([A-Z][A-Z0-9.-]{0,5})\b",
        question,
        flags=re.IGNORECASE,
    ):
        sym = match.group(1).upper()
        if sym not in _COMMON_UPPERCASE_WORDS and sym not in symbols:
            symbols.append(sym)

    for token in re.findall(r"\b[A-Z][A-Z0-9.-]{1,5}\b", question):
        sym = token.upper().rstrip(".")
        if (
            sym not in _COMMON_UPPERCASE_WORDS
            and any(ch.isalpha() for ch in sym)
            and sym not in symbols
        ):
            symbols.append(sym)

    return symbols[:max_symbols]


def _build_arguments(tool: ToolInfo, question: str) -> dict[str, Any] | None:
    """Fill a tool's args from the question, or return None if we can't.

    Only question-shaped string params are filled (see `_QUESTION_KEYS`). If a
    tool REQUIRES a param we don't know how to supply, return None so the
    strategy drops it — better to not route than to call with a guessed value.
    """
    props = (tool.input_schema or {}).get("properties") or {}
    required = set(_required_params(tool))
    args: dict[str, Any] = {}
    for name in props:
        if name in _QUESTION_KEYS:
            args[name] = question
    symbols = extract_symbols(question)
    if "symbol" in props and symbols:
        args["symbol"] = symbols[0]
    if "symbols" in props and symbols:
        args["symbols"] = symbols
    # Every required param must be satisfiable.
    for name in required:
        if name not in args:
            return None
    return args


def keyword_router(
    question: str,
    tools: list[ToolInfo],
    *,
    max_tools: int = 3,
    floor: int = 1,
) -> list[ToolPlan]:
    """Deterministic default strategy: score tools by keyword overlap.

    Score = number of question tokens that appear in the tool's vocabulary
    (name tokens + description tokens). Ties break by qualified name so the
    plan is stable/reproducible. A tool is only planned if (a) it clears the
    `floor` of at least `floor` overlapping tokens AND (b) its required args
    are satisfiable from the question. Returns at most `max_tools` plans.
    """
    q_tokens = set(_tokenize(question))
    scored: list[tuple[int, str, ToolPlan]] = []
    for tool in tools:
        overlap = q_tokens & _tool_vocab(tool)
        score = len(overlap)
        if score < floor:
            continue
        arguments = _build_arguments(tool, question)
        if arguments is None:
            continue  # required param we can't fill — don't route to it
        plan = ToolPlan(
            tool=tool.qualified_name,
            arguments=arguments,
            score=float(score),
            reason=f"matched {sorted(overlap)}",
        )
        scored.append((score, tool.qualified_name, plan))
    # Highest score first; qualified name ascending as the deterministic tiebreak.
    scored.sort(key=lambda t: (-t[0], t[1]))
    if scored:
        return [plan for _, _, plan in scored[:max_tools]]

    # Generic ticker questions such as "Tell me about IONQ" contain the
    # symbol but no vocabulary that overlaps a tool description. In that
    # case the deterministic fallback must still use the discovered market
    # catalog rather than incorrectly concluding that no tool applies.
    # Prefer the generic quote tool for an otherwise unqualified symbol;
    # more specific questions (earnings, contracts, filings, etc.) already
    # match their corresponding tool vocabulary above.
    symbols = extract_symbols(question)
    if symbols:
        quote_candidates: list[ToolPlan] = []
        for tool in tools:
            props = (tool.input_schema or {}).get("properties") or {}
            if "symbol" not in props and "symbols" not in props:
                continue
            arguments = _build_arguments(tool, question)
            if arguments is None:
                continue
            if tool.qualified_name.endswith(".get_quote"):
                quote_candidates.append(
                    ToolPlan(
                        tool=tool.qualified_name,
                        arguments=arguments,
                        score=0.5,
                        reason="explicit ticker with generic market question",
                    )
                )
        if quote_candidates:
            return quote_candidates[:max_tools]

    return []


class RouterState(TypedDict, total=False):
    question: str
    discovered: list[ToolInfo]
    plan: list[ToolPlan]
    calls: list[ToolCallRecord]
    routed: str
    error: str
    steps: Annotated[list[Step], operator.add]


def build_router_graph(toolbox: MCPToolbox, strategy: RoutingStrategy):
    """Compile the router's state graph over a connected toolbox + strategy."""

    @traced_node("discover")
    def discover(state: RouterState) -> dict:
        try:
            tools = toolbox.tools()
        except MCPClientError as exc:
            step = tool_call("mcp.discover", ok=False, note=exc.code)
            return {"discovered": [], "error": f"{exc.code}: {exc.message}", "steps": [step]}
        step = tool_call("mcp.discover", note=f"{len(tools)} tools")
        return {"discovered": tools, "steps": [step]}

    @traced_node("route")
    def route(state: RouterState) -> dict:
        question = (state.get("question") or "").strip()
        tools = state.get("discovered") or []
        if not question or not tools:
            return {"plan": [], "_note": "nothing to route"}
        plan = strategy(question, tools)
        return {"plan": plan, "_note": f"{len(plan)} tool(s) planned"}

    def route_after_plan(state: RouterState) -> str:
        return "execute" if state.get("plan") else "finalize"

    @traced_node("execute")
    def execute(state: RouterState) -> dict:
        plan = state.get("plan") or []
        calls: list[ToolCallRecord] = []
        steps: list[Step] = []
        for tp in plan:
            try:
                output = toolbox.call(tp.tool, tp.arguments)
            except Exception as exc:  # noqa: BLE001 — one bad tool must not abort the rest
                code = getattr(exc, "code", type(exc).__name__)
                calls.append(
                    ToolCallRecord(tool=tp.tool, arguments=tp.arguments, ok=False, error=str(exc))
                )
                steps.append(tool_call(tp.tool, tp.arguments, ok=False, note=str(code)))
            else:
                calls.append(
                    ToolCallRecord(tool=tp.tool, arguments=tp.arguments, ok=True, output=output)
                )
                steps.append(tool_call(tp.tool, tp.arguments, note="ok"))
        return {"calls": calls, "routed": "execute", "steps": steps}

    @traced_node("finalize")
    def finalize(state: RouterState) -> dict:
        # Reaching finalize with no plan is a clean "no tool matched" outcome.
        if not state.get("plan"):
            return {"routed": state.get("routed") or "no_route", "_note": "no tool matched"}
        return {"_note": "done"}

    graph = StateGraph(RouterState)
    graph.add_node("discover", discover)
    graph.add_node("route", route)
    graph.add_node("execute", execute)
    graph.add_node("finalize", finalize)

    graph.add_edge(START, "discover")
    graph.add_edge("discover", "route")
    graph.add_conditional_edges(
        "route",
        route_after_plan,
        {"execute": "execute", "finalize": "finalize"},
    )
    graph.add_edge("execute", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


class ToolRouterAgent:
    """Question -> best-matching MCP tool call(s), discovered at runtime.

    The `toolbox` is a SHARED resource whose lifecycle the caller owns: it must
    already be connected when `run()` is called, and the agent never closes it.
    That mirrors how a supervisor would hand one connected toolbox to several
    agents. The routing `strategy` is injectable; the default is deterministic
    keyword matching so the agent runs offline with no LLM and no fixtures.
    """

    def __init__(
        self,
        toolbox: MCPToolbox,
        strategy: RoutingStrategy = keyword_router,
        recursion_limit: int = 25,
    ) -> None:
        self.toolbox = toolbox
        self.strategy = strategy
        self.recursion_limit = recursion_limit
        self.graph = build_router_graph(self.toolbox, self.strategy)

    def run(self, question: str) -> RouterAgentResult:
        state: RouterState = {"question": question, "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        discovered = [t.qualified_name for t in (final.get("discovered") or [])]
        return RouterAgentResult(
            question=question,
            discovered=discovered,
            plan=final.get("plan", []),
            calls=final.get("calls", []),
            routed=final.get("routed", ""),
            error=final.get("error", ""),
            trajectory=AgentTrajectory(steps=final.get("steps", [])),
        )
