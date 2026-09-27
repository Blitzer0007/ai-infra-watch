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
    raw = text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*\})\s*```", raw, flags=re.DOTALL)
    candidate = match.group(1) if match else raw
    try:
        value = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


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
{"action":"tool","tool":"server.tool","arguments":{},"reason":"..."}
or:
{"action":"final","answer":"..."}

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
            used = {
                (str(item.get("tool", "")), json.dumps(item.get("arguments") or {}, sort_keys=True))
                for item in history
                if isinstance(item, dict) and item.get("tool")
            }
            candidates = [
                tool for tool in tools
                if (tool.qualified_name, json.dumps({}, sort_keys=True)) not in used
            ]
            # Avoid exact duplicate calls while still allowing tools with
            # symbol/symbols arguments to be selected when the arguments differ.
            filtered = []
            for tool in tools:
                candidate_args = {}
                props = (tool.input_schema or {}).get("properties") or {}
                symbols = extract_symbols(question)
                if "symbol" in props and symbols:
                    candidate_args["symbol"] = symbols[0]
                if "symbols" in props and symbols:
                    candidate_args["symbols"] = symbols
                key = (tool.qualified_name, json.dumps(candidate_args, sort_keys=True))
                if key not in used:
                    filtered.append(tool)
            plans = keyword_router(question, filtered, max_tools=1)
            if not plans:
                return {"action": "final", "answer": "No unused MCP tool matches the question; the retrieved evidence can be finalized."}
            plan = plans[0]
            return {"action": "tool", "tool": plan.tool, "arguments": plan.arguments, "reason": "deterministic fallback router"}
        raw = self.client.generate(_planner_prompt(question, tools, history), max_tokens=800, temperature=0.0)
        parsed = _extract_json_object(raw)
        if not parsed:
            raise ValueError("planner did not return a valid JSON object")
        return parsed

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
            plan = self._plan(question, tools, history)
            steps.append(Step(node="plan", kind="node", note=f"iteration={iteration}"))
            action = str(plan.get("action", "")).strip().lower()
            if action == "final":
                answer = str(plan.get("answer", "")).strip()
                if answer:
                    steps.append(Step(node="finalize", kind="node", note="planner settled"))
                    return AutonomousResult(question, answer, calls, discovered, AgentTrajectory(steps=steps))
            if action != "tool":
                error = "planner returned neither a valid tool action nor a final answer"
                steps.append(tool_call("autonomous.planner", ok=False, note=error))
                return AutonomousResult(question, "", calls, discovered, AgentTrajectory(steps=steps), error=error, resolution="error")

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