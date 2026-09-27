"""Shared in-process MCP session fakes + helpers for the Phase-5 test suites.

Four suites (`tests/mcp/test_client.py`, `tests/mcp/test_toolbox.py`,
`tests/agents/test_router_agent.py`, `tests/agents/test_chaos.py`) each drive
the SAME `session_factory` seam the real MCPClient uses, so no subprocess or
stdio is ever launched. They had independently grown near-identical copies of
`_tool` / `_call_result` / `_factory` / `_cfg` and three subtly-different
session stubs. This module is the ONE canonical set; each suite imports from
here and passes the flags it needs.

The one `FakeSession` covers all three historical contracts via flags:

  * `unknown_ok=False` (default, client/toolbox/router): a `call_tool` for a
    name not in `call_returns` raises `MCPClientError("UNKNOWN_TOOL", ...)` —
    the client-layer / router contract.
  * `unknown_ok=True` (chaos): an absent name returns `call_result(None)`
    instead of raising — the chaos contract, where a call reaching a tool with
    no canned value is a clean empty result, not an error.
  * `boom={...}`: a named tool raises `MCPClientError("TOOL_ERROR", ...)` — a
    clean tool-level failure (router's adversarial case).
  * `crash_after=N`: the session serves `N` calls, then EVERY further call
    raises `MCPClientError("SERVER_DOWN", ...)` — a dead subprocess surfacing
    as a transport error mid-run (chaos's server-death case). `crash_after=0`
    means dead from the first call; `None` (default) means never crashes.

Tools are specified either as bare names (`["get_quote"]`) or as full spec
dicts (`[{"name": ..., "description": ..., "input_schema": ...}]`) so a
discovered `ToolInfo` carries the vocabulary/schema the router reads.
"""
from __future__ import annotations

from contextlib import AsyncExitStack
from typing import Any
from unittest.mock import MagicMock

from app.mcp_client import ServerConfig
from app.mcp_client.client import MCPClientError


def mk_tool(name: str, description: str = "", input_schema: dict | None = None) -> Any:
    """A discovered-tool stub exposing name/description/input_schema."""
    t = MagicMock()
    t.name = name
    t.description = description
    t.input_schema = input_schema or {}
    return t


def call_result(value: Any, is_error: bool = False) -> Any:
    """A call-tool result stub in the client-side shape (structured_content)."""
    r = MagicMock()
    r.is_error = is_error
    r.structured_content = {"result": value} if not is_error else None
    r.content = []
    return r


def resource_result(text: str) -> list[Any]:
    """A read-resource result: a single item exposing `.text` and nothing else.

    A bare MagicMock makes every getattr truthy; `spec=["text"]` forces
    `.content` absent so the client's unwrap picks the text branch.
    """
    item = MagicMock(spec=["text"])
    item.text = text
    return [item]


def _norm_specs(tools: list) -> list[dict]:
    """Accept bare names or full spec dicts; normalize to spec dicts."""
    specs: list[dict] = []
    for t in tools:
        if isinstance(t, str):
            specs.append({"name": t, "description": "", "input_schema": {}})
        else:
            specs.append(t)
    return specs


class FakeSession:
    """One in-process session stub covering every Phase-5 test contract.

    See the module docstring for the `unknown_ok` / `boom` / `crash_after`
    flags. `name` is embedded in `read_resource` output so a routing test can
    prove a URI reached the RIGHT server, not merely that the URI echoes back.
    """

    def __init__(
        self,
        tools: list | None = None,
        call_returns: dict[str, Any] | None = None,
        *,
        specs: list | None = None,
        name: str = "",
        boom: set[str] | None = None,
        unknown_ok: bool = False,
        crash_after: int | None = None,
    ) -> None:
        # `tools` (positional) and `specs` (keyword) are two names for the same
        # thing — bare names or full spec dicts. The router suite passes
        # `specs=[{...}]`; the client/toolbox suites pass `["name", ...]`.
        self._specs = _norm_specs(specs if specs is not None else (tools or []))
        self._call_returns = call_returns or {}
        self._name = name
        self._boom = boom or set()
        self._unknown_ok = unknown_ok
        self._crash_after = crash_after
        self.calls: list[tuple[str, dict]] = []

    async def initialize(self) -> None:
        pass

    async def list_tools(self) -> list[Any]:
        return [mk_tool(**s) for s in self._specs]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any:
        self.calls.append((name, arguments))
        # Transport death: after crash_after healthy calls, the subprocess is
        # gone and the transport raises rather than returning.
        if self._crash_after is not None and len(self.calls) > self._crash_after:
            raise MCPClientError("SERVER_DOWN", f"{name}: connection to server lost")
        if name in self._boom:
            raise MCPClientError("TOOL_ERROR", f"{name} blew up")
        if name not in self._call_returns:
            if self._unknown_ok:
                return call_result(self._call_returns.get(name))
            raise MCPClientError("UNKNOWN_TOOL", f"fake: no tool {name!r}")
        return call_result(self._call_returns[name])

    async def read_resource(self, uri: str) -> list[Any]:
        suffix = f"@{self._name}" if self._name else ""
        return resource_result(f"resource:{uri}{suffix}")


def make_factory(sessions: dict[str, FakeSession]):
    """A session_factory that hands back the pre-built session for each server."""

    async def factory(cfg: ServerConfig, stack: AsyncExitStack) -> FakeSession:
        return sessions[cfg.name]

    return factory


def cfg(name: str) -> ServerConfig:
    """A minimal ServerConfig (no command/args — the fake factory ignores them)."""
    return ServerConfig(name=name)
