"""Autonomous MCP investigation agent.

The agent runs a bounded discover -> plan/act -> observe loop.
A real LLM chooses the next tool from the live MCP catalog and prior outputs.
Every proposed call is schema-validated before execution. The loop has a hard
step bound, records a trajectory, and falls back to the deterministic keyword
router when no LLM planner is available.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

from app.agents.router import extract_symbols, keyword_router
from app.agents.schemas import ToolCallRecord
from app.agents.trajectory import AgentTrajectory, Step, llm_call, tool_call
from app.llm.client import LLMClient
from app.mcp_client import MCPToolbox, ToolInfo
from app.mcp_client.client import MCPClientError


@dataclass
class AutonomousResult:
    question: str
    summary: str
    calls: list[ToolCallRecord]
    discovered: list[str]
    trajectory: AgentTrajectory
    error: str = ""
    resolution: str = "completed"

    def ok(self) -> bool:
        return bool(self.summary) and any(c.ok for c in self.calls)

    def degraded(self) -> bool:
        return self.ok() and (bool(self.error) or any(not c.ok for c in self.calls))


def _required_params(tool: ToolInfo) -> list[str]:
    schema = tool.input_schema or {}
    required = schema.get("required")
    return list(required) if isinstance(required, list) else []


def _validate_arguments(tool: ToolInfo, arguments: dict[str, Any]) -> str | None:
    missing = [name for name in _required_params(tool) if name not in arguments]
    return f"missing required args: {', '.join(missing)}" if missing else None


def _tool_catalog_text(tools: list[ToolInfo]) -> str:
    rows = []
    for tool in tools:
        rows.append(json.dumps({
            "tool": tool.qualified_name,
            "description": tool.description,
            "input_schema": tool.input_schema,
        }, ensure_ascii=False))
    return "\n".join(rows)


def _result_preview(value: Any, limit: int = 5000) -> str:
    try:
        text = json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        text = str(value)
    return text[:limit] + ("..." if len(text) > limit else "")


def _extract_json_object(text: str) -> dict[str, Any] | None:
    """Extract the first valid JSON object from model output.

    OpenAI-compatible reasoning models may wrap the requested JSON in
    markdown or explanatory text. Tolerate those wrappers while still
    requiring the extracted value to be a JSON object.
    """
    raw = text.strip()
    if not raw:
        return None

    candidates: list[str] = []
    fenced = re.search(
        r"```(?:json)?\s*(\{.*?\})\s*```",
        raw,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if fenced:
        candidates.append(fenced.group(1))

    # Scan for balanced JSON objects embedded in prose/reasoning.
    for start_match in re.finditer(r"\{", raw):
        start = start_match.start()
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(raw)):
            char = raw[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == chr(92):
                    escaped = True
                elif char == chr(34):
                    in_string = False
                continue
            if char == chr(34):
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(raw[start:index + 1])
                    break

    candidates.append(raw)
    for candidate in candidates:
        try:
            value = json.loads(candidate.strip())
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
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
    """Build a bounded evidence sequence for 'what changed / why / drivers' questions.

    Prefer one batched quote call, then historical earnings-event reaction, then
    a filing search. This avoids spending the six-step budget on repeated
    per-symbol quote calls and gives the synthesizer evidence about both price
    reaction and material disclosures.
    """
    lower = question.lower()
    terms = ("driver", "drivers", "why", "cause", "causes", "catalyst", "catalysts", "changed recently", "what changed")
    if not any(term in lower for term in terms):
        return None
    symbols = [s.upper() for s in extract_symbols(question)]
    if not symbols:
        return None

    def successful_tool(predicate):
        return any(c.ok and predicate(c) for c in calls)

    # Step 1: one quote batch for all explicitly named symbols.
    batch = next(
        (
            t for t in tools
            if t.qualified_name.lower().endswith(".get_quotes")
            and "symbols" in ((t.input_schema or {}).get("properties") or {})
        ),
        None,
    )
    if batch is not None and not successful_tool(
        lambda c: c.tool.lower().endswith(".get_quotes")
        or c.tool.lower().endswith(".get_quote")
    ):
        return {
            "action": "tool",
            "tool": batch.qualified_name,
            "arguments": {"symbols": symbols},
            "reason": "driver question: batch current quotes before causal research",
        }

    # Step 2: historical earnings-event reaction for every named ticker.
    event_tools = [
        t for t in tools
        if t.qualified_name.lower().endswith(".get_event_study")
        and "symbol" in ((t.input_schema or {}).get("properties") or {})
    ]
    completed_events = {
        str((c.arguments or {}).get("symbol", "")).upper()
        for c in calls
        if c.ok and c.tool.lower().endswith(".get_event_study")
    }
    for symbol in symbols:
        if symbol not in completed_events and event_tools:
            return {
                "action": "tool",
                "tool": event_tools[0].qualified_name,
                "arguments": {"symbol": symbol},
                "reason": f"driver question: retrieve historical earnings price reaction for {symbol}",
            }

    # Step 3: retrieve company-specific SEC evidence in one batched call.
    # The generic RAG corpus may contain sector-level documents that do not
    # mention the requested tickers. get_catalysts uses primary EDGAR 8-K data
    # and preserves accession URLs, material-event items, and contract evidence.
    catalyst_tool = next(
        (
            t for t in tools
            if t.qualified_name.lower().endswith(".get_catalysts")
            and "symbols" in ((t.input_schema or {}).get("properties") or {})
        ),
        None,
    )
    if catalyst_tool is not None and not successful_tool(
        lambda c: c.tool.lower().endswith(".get_catalysts")
    ):
        return {
            "action": "tool",
            "tool": catalyst_tool.qualified_name,
            "arguments": {"symbols": symbols},
            "reason": "driver question: retrieve company-specific SEC catalyst evidence",
        }

    # Once quotes, historical event studies, and SEC catalyst evidence have
    # all been collected, stop the bounded investigation. Do not let the LLM
    # spend the final step repeating quote retrieval.
    if successful_tool(lambda c: c.tool.lower().endswith(".get_catalysts")):
        return {"action": "final", "answer": ""}

    return None

def _final_prompt(question: str, calls: list[ToolCallRecord]) -> str:
    evidence = [{
        "tool": c.tool,
        "ok": c.ok,
        "arguments": c.arguments,
        "output": c.output if c.ok else c.error,
    } for c in calls]
    return f'''Answer this AI Infra Watch question using only the retrieved evidence.

Question:
{question}

Retrieved evidence:
{json.dumps(evidence, ensure_ascii=False, indent=2, default=str)}

Requirements:
- Separate retrieved facts from interpretation.
- State missing or conflicting evidence.
- Do not invent prices, events, contracts, or causal explanations.
- Do not present model signals as guaranteed outcomes.
- For event-study output, report the actual number of returned events and distinguish
  an empty events list from events whose return fields are null.
- Prefer company-specific primary SEC evidence over generic sector-level filing text
  when explaining possible catalysts.
- For each named ticker, identify what is directly observed and label any driver
  not directly supported by retrieved evidence as a hypothesis.
- Return only the final user-facing answer. Do not restate these instructions,
  the question, or the full retrieved-evidence payload.
- Keep the answer concise but complete, with a clear Facts section followed by
  Interpretation/Hypotheses.
'''


class AutonomousMCPAgent:
    def __init__(self, toolbox: MCPToolbox, client: LLMClient | None = None, max_steps: int | None = None, planner: Any | None = None) -> None:
        self.toolbox = toolbox
        self.client = client or LLMClient()
        self.max_steps = max_steps or int(os.getenv("AUTONOMOUS_MAX_STEPS", "6"))
        self.planner = planner

    def _plan(self, question: str, tools: list[ToolInfo], history: list[dict[str, Any]]) -> dict[str, Any]:
        if self.planner is not None:
            return self.planner(question, tools, history)
        mode = os.getenv("AUTONOMOUS_MODE", "llm").strip().lower()
        if mode == "keyword" or self.client.provider == "stub":
            used_tools = {
                str(item.get("tool", ""))
                for item in history
                if isinstance(item, dict) and item.get("tool")
            }
            # A single investigation should use each discovered tool at most
            # once; this prevents a keyword fallback from looping on the same
            # tool and encourages cross-source evidence gathering.
            filtered = []
            for tool in tools:
                candidate_args = {}
                props = (tool.input_schema or {}).get("properties") or {}
                symbols = extract_symbols(question)
                if "symbol" in props and symbols:
                    candidate_args["symbol"] = symbols[0]
                if "symbols" in props and symbols:
                    candidate_args["symbols"] = symbols
                if tool.qualified_name not in used_tools:
                    filtered.append(tool)
            plans = keyword_router(question, filtered, max_tools=1)
            if not plans:
                return {"action": "final", "answer": "No unused MCP tool matches the question; the retrieved evidence can be finalized."}
            plan = plans[0]
            return {"action": "tool", "tool": plan.tool, "arguments": plan.arguments, "reason": "deterministic fallback router"}
        # Keep ticker-focused investigations inside the explicitly named\n        # symbols. Broad relationship/rotation tools can otherwise query a\n        # default universe of many tickers and hit the Vercel timeout.\n        planning_tools = tools\n        symbols = extract_symbols(question)\n        if symbols:\n            lower_question = question.lower()\n            filing_terms = (\n                "sec", "filing", "filings", "10-k", "10-q", "8-k",\n                "contract", "contracts", "disclosure", "disclosures", "cik",\n            )\n            is_filing_question = any(term in lower_question for term in filing_terms)\n            ticker_tools = []\n            for tool in tools:\n                props = (tool.input_schema or {}).get("properties") or {}\n                if "symbol" not in props and "symbols" not in props:\n                    continue\n                if not is_filing_question and "milestone" in tool.qualified_name.lower():\n                    continue\n                ticker_tools.append(tool)\n            if ticker_tools:\n                planning_tools = ticker_tools\n\n        raw = self.client.generate(\n            _planner_prompt(question, planning_tools, history),\n            max_tokens=800,\n            temperature=0.0,\n        )\n        parsed = _extract_json_object(raw)\n        if not parsed:\n            raise ValueError("planner did not return a valid JSON object")\n        return parsed

    def _finalize(self, question: str, calls: list[ToolCallRecord], steps: list[Step]) -> AutonomousResult:
        successful = [c for c in calls if c.ok]
        if not successful:
            steps.append(Step(node="finalize", kind="node", note="no successful calls"))
            return AutonomousResult(
                question,
                "No MCP tool produced usable evidence.",
                calls,
                [tool.qualified_name for tool in self.toolbox.tools()],
                AgentTrajectory(steps=steps),
                error="no successful tool calls",
                resolution="error",
            )
        # Stub mode is intentionally offline and may not have a matching
        # final-answer fixture for every possible question. The MCP result is
        # still valid evidence, so fall back to a deterministic JSON rendering
        # instead of marking a successful investigation as degraded.
        if self.client.stub:
            final_text = _result_preview(successful[-1].output, 4000)
            steps.append(Step(node="finalize", kind="node", note="deterministic evidence synthesis"))
            return AutonomousResult(
                question,
                final_text,
                calls,
                [tool.qualified_name for tool in self.toolbox.tools()],
                AgentTrajectory(steps=steps),
                resolution="completed",
            )

        try:
            final_text = self.client.generate(
                _final_prompt(question, successful),
                max_tokens=2400,
                temperature=0.0,
            )
        except Exception as exc:
            final_text = _result_preview(successful[-1].output, 2000)
            error = f"finalization_failed: {type(exc).__name__}: {exc}"
            steps.append(Step(node="finalize", kind="node", note=error))
            return AutonomousResult(
                question,
                final_text,
                calls,
                [tool.qualified_name for tool in self.toolbox.tools()],
                AgentTrajectory(steps=steps),
                error=error,
                resolution="completed",
            )
        steps.append(llm_call("autonomous.finalize", note="evidence synthesis"))
        steps.append(Step(node="finalize", kind="node", note="evidence sufficient"))
        return AutonomousResult(
            question,
            final_text,
            calls,
            [tool.qualified_name for tool in self.toolbox.tools()],
            AgentTrajectory(steps=steps),
            resolution="completed",
        )

    def run(self, question: str) -> AutonomousResult:
        tools = self.toolbox.tools()
        discovered = [tool.qualified_name for tool in tools]
        by_name = {tool.qualified_name: tool for tool in tools}
        history: list[dict[str, Any]] = []
        calls: list[ToolCallRecord] = []
        steps: list[Step] = [Step(node="discover", kind="node", note=f"{len(tools)} tools")]
        if not tools:
            return AutonomousResult(question, "No MCP tools are currently available.", [], [], AgentTrajectory(steps=steps), resolution="no_tool")

        for iteration in range(1, self.max_steps + 1):
            # For "what changed / why / drivers" questions, require evidence
            # retrieval before allowing the LLM planner to settle on quote-only
            # data. This prevents repeated quote calls from consuming all steps.
            forced_driver = _driver_research_plan(question, tools, calls)
            plan = forced_driver if forced_driver is not None else self._plan(question, tools, history)
            steps.append(Step(
                node="plan",
                kind="node",
                note=f"iteration={iteration}" + ("; forced driver evidence" if forced_driver else ""),
            ))
            # Never allow a malformed/empty planner result to crash the whole
            # request. This also protects production when an OpenAI-compatible
            # model returns an empty/null JSON response.
            if not isinstance(plan, dict):
                fallback_plans = keyword_router(question, tools, max_tools=1)
                if fallback_plans:
                    fallback = fallback_plans[0]
                    plan = {
                        "action": "tool",
                        "tool": fallback.tool,
                        "arguments": fallback.arguments,
                        "reason": "planner returned no usable action; deterministic fallback",
                    }
                    steps.append(Step(node="plan", kind="node", note="planner fallback"))
                else:
                    error = "planner returned no usable action"
                    steps.append(tool_call("autonomous.planner", ok=False, note=error))
                    return AutonomousResult(
                        question, "", calls, discovered, AgentTrajectory(steps=steps),
                        error=error, resolution="error"
                    )
            action = str(plan.get("action", "")).strip().lower()
            if action == "final":
                forced = _driver_research_plan(question, tools, calls)
                if forced is not None:
                    forced_action = str(forced.get("action", "")).strip().lower()
                    if forced_action == "final":
                        # Driver research is complete. The forced planner uses
                        # an empty final action only as a bounded stop signal;
                        # never convert it into a tool call with an empty name.
                        steps.append(Step(
                            node="finalize",
                            kind="node",
                            note="forced driver evidence complete",
                        ))
                        return self._finalize(question, calls, steps)
                    plan = forced
                    action = "tool"
                    steps.append(Step(node="plan", kind="node", note="forced driver evidence"))
                else:
                    # Respect an explicit planner answer. If the deterministic
                    # fallback emits an empty final action after successful calls,
                    # synthesize the retrieved evidence instead.
                    answer = str(plan.get("answer", "")).strip()
                    placeholder = "No unused MCP tool matches the question; the retrieved evidence can be finalized."
                    if any(c.ok for c in calls) and answer == placeholder:
                        return self._finalize(question, calls, steps)
                    if answer:
                        steps.append(Step(node="finalize", kind="node", note="planner settled"))
                        return AutonomousResult(question, answer, calls, discovered, AgentTrajectory(steps=steps))
                    if any(c.ok for c in calls):
                        return self._finalize(question, calls, steps)
            tool_name = str(plan.get("tool", "")).strip()
            tool = by_name.get(tool_name)
            if tool is None:
                error = f"unknown discovered tool: {tool_name}"
                steps.append(tool_call(tool_name or "unknown", ok=False, note=error))
                return AutonomousResult(question, "", calls, discovered, AgentTrajectory(steps=steps), error=error, resolution="error")

            arguments = plan.get("arguments") or {}
            if not isinstance(arguments, dict):
                arguments = {}
            symbols = extract_symbols(question)
            props = (tool.input_schema or {}).get("properties") or {}
            if "symbol" in props and "symbol" not in arguments and symbols:
                arguments["symbol"] = symbols[0]
            if "symbols" in props and "symbols" not in arguments and symbols:
                arguments["symbols"] = symbols

            validation_error = _validate_arguments(tool, arguments)
            if validation_error:
                record = ToolCallRecord(tool=tool_name, arguments=arguments, ok=False, error=validation_error)
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, ok=False, note=validation_error))
                history.append({"tool": tool_name, "arguments": arguments, "error": validation_error})
                continue

            try:
                output = self.toolbox.call(tool_name, arguments)
            except MCPClientError as exc:
                record = ToolCallRecord(tool=tool_name, arguments=arguments, ok=False, error=f"{exc.code}: {exc.message}")
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, ok=False, note=exc.code))
                history.append({"tool": tool_name, "arguments": arguments, "error": record.error})
            except Exception as exc:
                record = ToolCallRecord(tool=tool_name, arguments=arguments, ok=False, error=f"{type(exc).__name__}: {exc}")
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, ok=False, note=type(exc).__name__))
                history.append({"tool": tool_name, "arguments": arguments, "error": record.error})
            else:
                record = ToolCallRecord(tool=tool_name, arguments=arguments, ok=True, output=output)
                calls.append(record)
                steps.append(tool_call(tool_name, arguments, note="ok"))
                history.append({"tool": tool_name, "arguments": arguments, "output": _result_preview(output)})

        successful = [c for c in calls if c.ok]
        if successful:
            try:
                final_text = self.client.generate(_final_prompt(question, successful), max_tokens=1200, temperature=0.0)
            except Exception as exc:
                final_text = _result_preview(successful[-1].output, 2000)
                error = f"finalization_failed: {type(exc).__name__}: {exc}"
                steps.append(Step(node="finalize", kind="node", note=error))
                return AutonomousResult(question, final_text, calls, discovered, AgentTrajectory(steps=steps), error=error, resolution="max_steps")
            steps.append(llm_call("autonomous.finalize", note="evidence synthesis"))
            steps.append(Step(node="finalize", kind="node", note="max steps reached"))
            return AutonomousResult(question, final_text, calls, discovered, AgentTrajectory(steps=steps), resolution="max_steps")

        steps.append(Step(node="finalize", kind="node", note="no successful calls"))
        return AutonomousResult(question, "No MCP tool produced usable evidence.", calls, discovered, AgentTrajectory(steps=steps), error="no successful tool calls", resolution="error")

__all__ = ["AutonomousMCPAgent", "AutonomousResult"]