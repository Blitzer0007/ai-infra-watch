                }
            return {
                "enabled": True,
                "action": "fallback",
                "error": f"{type(exc).__name__}: {exc}; retry={type(retry_exc).__name__}: {retry_exc}",
            }

def _tool_for_jev_route(route: str, tools: list[ToolInfo]) -> ToolInfo | None:
    patterns = JEV_ROUTE_PATTERNS.get(route, ())
    if not patterns:
        return None
    for tool in tools:
        name = tool.qualified_name.lower()
        if any(pattern.lower() in name for pattern in patterns):
            return tool
    return None

def _planner_prompt(question: str, tools: list[ToolInfo], history: list[dict[str, Any]]) -> str:
    return f'''You are the autonomous tool planner for AI Infra Watch.

User question:
{question}

Available MCP tools:
{_tool_catalog_text(tools)}

Recent execution history:
{json.dumps(history[-6:], ensure_ascii=False, indent=2)}

Choose exactly one next action.
Return JSON only:
{{"action":"tool","tool":"server.tool","arguments":{{}},"reason":"..."}}
or:
{{"action":"final","answer":"..."}}

Rules:
- Use only a discovered tool.
- Respect its input schema. Do not invent required arguments.
- Prefer evidence retrieval before interpretation.
- Use explicitly named tickers when the selected schema supports symbol/symbols.
- Do not claim current facts unless retrieved from a tool result.
- Stop when the evidence is sufficient.
- Do not repeat the exact same tool with the exact same arguments unless the
  prior call failed and retrying is necessary.
'''


def _driver_research_plan(question: str, tools: list[ToolInfo], calls: list[ToolCallRecord]) -> dict[str, Any] | None:
    """Build a bounded evidence sequence for price-move/catalyst questions.

    These questions get a deterministic cross-source packet before synthesis:
    quote -> recent news -> SEC/company filings -> earnings -> event study.
    Each channel is attempted at most once and the gate later decides whether
    the resulting evidence is sufficient.
    """
    lower = question.lower()
    terms = ("driver", "drivers", "why", "cause", "causes", "catalyst", "catalysts",
             "changed recently", "what changed", "recent developments", "could affect",
             "affect", "stock price", "large move", "price move", "price movement")
    if not any(term in lower for term in terms):
        return None
    symbols = [s.upper() for s in extract_symbols(question)]
    if not symbols:
        return None

    def successful(predicate):
        return any(c.ok and predicate(c) for c in calls)

    def tool_ending(name: str, required: str | None = None):
        return next(
            (t for t in tools
             if t.qualified_name.lower().endswith(name)
             and (required is None or required in ((t.input_schema or {}).get("properties") or {}))),
            None,
        )

    # 1. Current market state.
    quote_batch = tool_ending(".get_quotes", "symbols")
    if quote_batch is not None and not successful(lambda c: c.tool.lower().endswith(".get_quotes")):
        return {"action": "tool", "tool": quote_batch.qualified_name,
                "arguments": {"symbols": symbols},
                "reason": "driver question: establish the observed price move first"}

    # 2. Recent news is a primary driver-discovery channel.
    news = next(
        (t for t in tools if t.qualified_name.lower().endswith(".search")
         and t.qualified_name.lower().startswith("news.")
         and "query" in ((t.input_schema or {}).get("properties") or {})),
        None,
    )
    if news is not None and not successful(lambda c: c.tool.lower().startswith("news.") and c.tool.lower().endswith(".search")):
        return {"action": "tool", "tool": news.qualified_name,
                "arguments": {"query": " ".join(symbols), "days": 7},
                "reason": "driver question: retrieve recent news for named symbols"}

    # 3. Primary SEC/company disclosure evidence.
    catalysts = next(
        (t for t in tools if t.qualified_name.lower().endswith(".get_catalysts")
         and "symbols" in ((t.input_schema or {}).get("properties") or {})),
        None,
    )
    if catalysts is not None and not successful(lambda c: c.tool.lower().endswith(".get_catalysts")):
        return {"action": "tool", "tool": catalysts.qualified_name,
                "arguments": {"symbols": symbols},
                "reason": "driver question: retrieve company-specific SEC catalyst evidence"}

    # 4. Earnings/results context even when the user did not explicitly say "earnings".
    earnings = tool_ending(".get_earnings", "symbol")
    completed_earnings = {str((c.arguments or {}).get("symbol", "")).upper()
                          for c in calls if c.ok and c.tool.lower().endswith(".get_earnings")}
    if earnings is not None:
        for symbol in symbols[:1]:
            if symbol not in completed_earnings:
                return {"action": "tool", "tool": earnings.qualified_name,
                        "arguments": {"symbol": symbol},
                        "reason": f"driver question: check earnings/results context for {symbol}"}

    # Explicit analyst questions must retrieve the actual analyst-consensus
    # channel rather than relying on the generic planner to discover it later.
    # This keeps analyst ratings/targets as first-class evidence for JEV.
    analyst_requested = any(term in lower for term in (
        "analyst", "price target", "target price", "consensus", "wall street",
        "estimate revision", "rating",
    ))
    analyst = tool_ending(".get_analyst_expectations", "symbol")
    completed_analyst = {
        str((c.arguments or {}).get("symbol", "")).upper()
        for c in calls if c.ok and c.tool.lower().endswith(".get_analyst_expectations")
    }
    if analyst_requested and analyst is not None:
        for symbol in symbols[:1]:
            if symbol not in completed_analyst:
                return {"action": "tool", "tool": analyst.qualified_name,
                        "arguments": {"symbol": symbol},
                        "reason": f"analyst question: retrieve external ratings and price-target consensus for {symbol}"}

    # 5. Historical event evidence, useful for distinguishing a current move from
    # a recurring earnings/event reaction pattern.
    event = tool_ending(".get_event_study", "symbol")
    completed_events = {str((c.arguments or {}).get("symbol", "")).upper()
                        for c in calls if c.ok and c.tool.lower().endswith(".get_event_study")}
    if event is not None:
        for symbol in symbols[:1]:
            if symbol not in completed_events:
                return {"action": "tool", "tool": event.qualified_name,
                        "arguments": {"symbol": symbol},
                        "reason": f"driver question: retrieve historical event-study evidence for {symbol}"}

    return {"action": "final", "answer": ""}

def _portfolio_research_symbols(calls: list[ToolCallRecord]) -> list[str]:
    """Extract held ticker symbols from the live portfolio-context result."""
    symbols: list[str] = []
    def walk(value: Any) -> None:
        if isinstance(value, dict):
            if "symbol" in value:
                candidate = str(value.get("symbol") or "").strip().upper()
                if re.fullmatch(r"[A-Z][A-Z0-9.]{0,5}", candidate) and candidate not in symbols:
                    symbols.append(candidate)
            for child in value.values():