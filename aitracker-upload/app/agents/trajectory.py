"""Trajectory primitives — the shared observability layer for agent graphs.

Every LangGraph node is wrapped with `@traced_node`, which records a
node-visit `Step` into the graph state's `steps` list (accumulated across
nodes by the `Annotated[list, operator.add]` reducer) and mirrors it to the
existing JSONL trace sink (`app.eval.trace.record_call`) so agent runs show
up in `data/traces/` alongside synthesis and eval calls.

Steps are deliberately plain pydantic models (JSON-native) — a trajectory
serializes with `model_dump_json()` for the dashboard and a Phase-5
supervisor, with no extra plumbing.
"""
from __future__ import annotations

import functools
import time
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field

from app.config import settings

StepKind = Literal["node", "tool", "llm"]


class Step(BaseModel):
    """One recorded event in an agent run."""

    node: str = Field(description="Graph node that produced this step")
    kind: StepKind = Field(description="node visit | tool call | llm call")
    tool: str = ""
    args: dict[str, Any] = Field(default_factory=dict)
    ok: bool = True
    note: str = ""
    duration_ms: float = 0.0


class AgentTrajectory(BaseModel):
    """The ordered list of steps an agent took, with query helpers."""

    steps: list[Step] = Field(default_factory=list)

    def nodes(self) -> list[str]:
        """Distinct node visits in order (the graph's state-machine path)."""
        return [s.node for s in self.steps if s.kind == "node"]

    def tools(self) -> list[str]:
        """Tool names actually invoked, in call order."""
        return [s.tool for s in self.steps if s.kind == "tool"]

    def reached(self, node: str) -> bool:
        return any(s.node == node for s in self.steps)


def tool_call(
    tool: str,
    args: dict[str, Any] | None = None,
    note: str = "",
    ok: bool = True,
) -> Step:
    """Build a tool-call Step (appended by the node that performed the call)."""
    return Step(node="", kind="tool", tool=tool, args=args or {}, ok=ok, note=note)


def llm_call(
    tool: str,
    args: dict[str, Any] | None = None,
    note: str = "",
    ok: bool = True,
) -> Step:
    """Build an llm-call Step (appended by a node that invoked the model).

    Kept distinct from `tool_call` so `AgentTrajectory` can answer "was the
    model called, and did a tool run before it?" — the behavioral test's
    search-before-answer invariant reads exactly this `kind == "llm"`.
    """
    return Step(node="", kind="llm", tool=tool, args=args or {}, ok=ok, note=note)


def traced_node(name: str, kind: Literal["node", "llm"] = "node") -> Callable:
    """Decorator for LangGraph node functions.

    Wraps `fn(state) -> partial_state`: times the call, prepends a node-visit
    Step to the (possibly empty) `steps` the node returned, and mirrors the
    visit to the JSONL trace sink under `kind="agent:<name>"` when
    TRACE_ENABLED.

    Transient keys a node MAY return (consumed here so they never enter graph
    state):
      * `_note`      — string carried in the node Step's `note`
      * `_prompt`    — prompt recorded to the trace sink (e.g. the LLM prompt)
      * `_trace_out` — response recorded to the trace sink (e.g. LLM output)

    The node is still responsible for appending any tool/llm Steps to its
    returned `steps` via `tool_call(...)` / `llm_call(...)`; the node-visit
    Step is prepended automatically so every tool/llm step is preceded by
    its node step. When TRACE_ENABLED every node visit is mirrored to the
    trace sink as `kind="agent:<name>"` (with prompt/out attached if the
    node supplied them), so agent runs show up in data/traces/.
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapped(state: dict[str, Any]) -> dict[str, Any]:
            start = time.perf_counter()
            partial = fn(state) or {}
            duration_ms = (time.perf_counter() - start) * 1000.0
            note = partial.pop("_note", "")
            prompt = partial.pop("_prompt", "")
            trace_out = partial.pop("_trace_out", "")
            steps = partial.pop("steps", [])
            visit = Step(node=name, kind=kind, ok=True, note=note, duration_ms=duration_ms)
            # tool/llm steps emitted by the node inherit its node name.
            for s in steps:
                if not s.node:
                    s.node = name
            partial["steps"] = [visit] + list(steps)
            if settings.TRACE_ENABLED:
                from app.eval.trace import record_call

                record_call(
                    kind=f"agent:{name}",
                    prompt=prompt,
                    response=trace_out or "",
                    metadata={"agent": name},
                )
            return partial
        return wrapped
    return decorator
