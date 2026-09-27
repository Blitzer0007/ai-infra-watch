"""MCPClient — connect to multiple MCP servers, discover + route tool calls.

Mirrors the server-side layout (a transport-independent core with an injected
seam): `MCPClient` speaks to any object satisfying the minimal `Session`
Protocol below, so tests drive it over an in-process fake session (no
subprocess, no stdio) while production connects over real stdio transport.
That keeps the client suite hermetic and fast, with a `@pytest.mark.live`
smoke exercising the real subprocess path.

Design notes
------------
* `ServerConfig` describes one launchable server (command + args + env). It
  converts to the SDK's `StdioServerParameters` only on the live path — the
  hermetic path never touches it.
* Tool discovery is per-server; each discovered tool is recorded as a
  `ToolInfo` carrying its origin server. `call_tool` routes by tool name.
* Namespacing: a bare tool name maps to exactly one server UNLESS two servers
  export the same name (e.g. both stocks and filings expose `health`). Then
  only the prefixed form "<server>.<tool>" resolves; the bare name raises a
  clear ambiguity error rather than silently picking one.
"""
from __future__ import annotations

import json
from contextlib import AsyncExitStack
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable

from pydantic import BaseModel, Field

# NAMESPACE_SEP joins a server name and tool name into the prefixed form.
NAMESPACE_SEP = "."


class MCPClientError(RuntimeError):
    """Raised for client-side routing/lookup failures (unknown/ambiguous tool)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ServerConfig(BaseModel):
    """How to launch/identify one MCP server over stdio."""

    name: str = Field(description="Stable logical name; used for tool namespacing")
    command: str = Field(default="python", description="Executable to spawn")
    args: list[str] = Field(default_factory=list, description="Args to the command")
    env: dict[str, str] = Field(default_factory=dict, description="Extra env vars")
    cwd: str | None = Field(default=None, description="Working dir for the process")


class ToolInfo(BaseModel):
    """A tool discovered on a connected server."""

    server: str = Field(description="Origin server name")
    name: str = Field(description="Bare tool name as the server advertises it")
    description: str = ""
    input_schema: dict[str, Any] = Field(default_factory=dict)

    @property
    def qualified_name(self) -> str:
        """The prefixed, always-unambiguous name '<server>.<tool>'."""
        return f"{self.server}{NAMESPACE_SEP}{self.name}"


@runtime_checkable
class Session(Protocol):
    """The minimal async MCP session surface MCPClient depends on.

    Both the real `mcp.ClientSession` and the test's in-process fake satisfy
    this — the client never calls anything outside these four coroutines.
    """

    async def initialize(self) -> Any: ...
    async def list_tools(self) -> Any: ...
    async def call_tool(self, name: str, arguments: dict[str, Any]) -> Any: ...
    async def read_resource(self, uri: str) -> Any: ...


# A SessionFactory opens a Session for one ServerConfig and registers its
# cleanup on the supplied AsyncExitStack. Injected so tests bypass stdio.
SessionFactory = Callable[[ServerConfig, AsyncExitStack], Awaitable[Session]]


async def _stdio_session_factory(cfg: ServerConfig, stack: AsyncExitStack) -> Session:
    """Default factory: spawn the server as a subprocess over stdio.

    Imported lazily so the hermetic test path never imports transport code.
    """
    import os

    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    params = StdioServerParameters(
        command=cfg.command,
        args=cfg.args,
        env={**os.environ, **cfg.env},
        cwd=cfg.cwd,
    )
    read, write = await stack.enter_async_context(stdio_client(params))
    session = await stack.enter_async_context(ClientSession(read, write))
    await session.initialize()
    return session


def _tools_of(list_tools_result: Any) -> list[Any]:
    """Normalize list_tools() output to a plain list of tool objects.

    The SDK returns a `ListToolsResult` (with a `.tools` attr) over the wire
    but a server's own `list_tools()` may return a bare list — accept both.
    """
    return getattr(list_tools_result, "tools", list_tools_result)


def unwrap_result(result: Any) -> Any:
    """Extract a plain Python value from a CallToolResult.

    Prefers `structured_content` (the server's JSON return, possibly wrapped
    in a {"result": ...} envelope for scalar/list returns); falls back to the
    concatenated text of `content` blocks. Raises on `is_error`.

    Note the SDK's asymmetry: scalar and list returns arrive enveloped in
    `structured_content` as {"result": <value>}, but a **dict** return arrives
    with `structured_content=None` and its JSON serialized into a single text
    block. So when there's no structured content we try to parse the joined
    text as JSON first (recovering the dict/list the tool actually returned),
    and only return the raw string if it isn't JSON.
    """
    if getattr(result, "is_error", False):
        text = _content_text(result)
        raise MCPClientError("TOOL_ERROR", text or "tool reported an error")
    structured = getattr(result, "structured_content", None)
    if structured is not None:
        # Scalar/list returns are enveloped as {"result": <value>} by the SDK.
        if isinstance(structured, dict) and set(structured.keys()) == {"result"}:
            return structured["result"]
        return structured
    text = _content_text(result)
    return _maybe_json(text)


def _maybe_json(text: str) -> Any:
    """Parse `text` as JSON when it looks like a JSON object/array, else return
    the raw string. Guards on the first non-space char so plain-string tool
    returns (the common case) are never mangled by a speculative json.loads."""
    if not text:
        return text
    head = text.lstrip()[:1]
    if head in ("{", "["):
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            return text
    return text


def _content_text(result: Any) -> str:
    """Join the text of all TextContent blocks on a result (best-effort)."""
    parts: list[str] = []
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if text is not None:
            parts.append(text)
    return "\n".join(parts)


class MCPClient:
    """Connects to several MCP servers at once; discovers and routes tools.

    Async context manager: entering connects every configured server and
    discovers its tools; exiting tears every session down (via the internal
    AsyncExitStack) in reverse order.
    """

    def __init__(
        self,
        servers: list[ServerConfig],
        session_factory: SessionFactory = _stdio_session_factory,
    ) -> None:
        self._servers = list(servers)
        self._session_factory = session_factory
        self._stack: AsyncExitStack | None = None
        self._sessions: dict[str, Session] = {}
        self._tools: list[ToolInfo] = []

    # -- lifecycle ---------------------------------------------------------
    async def __aenter__(self) -> "MCPClient":
        self._stack = AsyncExitStack()
        await self._stack.__aenter__()
        try:
            for cfg in self._servers:
                session = await self._session_factory(cfg, self._stack)
                self._sessions[cfg.name] = session
                await self._discover(cfg.name, session)
        except BaseException:
            # Connecting server N failed — unwind the ones already open.
            await self._stack.aclose()
            self._stack = None
            self._sessions.clear()
            self._tools.clear()
            raise
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._stack is not None:
            await self._stack.aclose()
            self._stack = None
        self._sessions.clear()
        self._tools.clear()

    async def _discover(self, server_name: str, session: Session) -> None:
        for tool in _tools_of(await session.list_tools()):
            self._tools.append(
                ToolInfo(
                    server=server_name,
                    name=tool.name,
                    description=getattr(tool, "description", "") or "",
                    input_schema=getattr(tool, "input_schema", None) or {},
                )
            )

    # -- discovery / introspection ----------------------------------------
    def tools(self) -> list[ToolInfo]:
        """All discovered tools across every connected server, in connect order."""
        return list(self._tools)

    def tool_names(self) -> list[str]:
        """Qualified names of every discovered tool ('<server>.<tool>')."""
        return [t.qualified_name for t in self._tools]

    def servers(self) -> list[str]:
        """Names of the connected servers."""
        return list(self._sessions)

    def _resolve(self, name: str) -> ToolInfo:
        """Map a bare or qualified tool name to exactly one ToolInfo.

        Qualified '<server>.<tool>' resolves directly. A bare name resolves
        only when unique across servers; a name exported by two servers raises
        an ambiguity error rather than silently picking one.
        """
        if NAMESPACE_SEP in name:
            server, _, bare = name.partition(NAMESPACE_SEP)
            matches = [t for t in self._tools if t.server == server and t.name == bare]
            if not matches:
                raise MCPClientError("UNKNOWN_TOOL", f"no tool {name!r} on any server")
            return matches[0]
        matches = [t for t in self._tools if t.name == name]
        if not matches:
            raise MCPClientError("UNKNOWN_TOOL", f"no tool named {name!r} on any server")
        if len(matches) > 1:
            servers = ", ".join(sorted(t.server for t in matches))
            raise MCPClientError(
                "AMBIGUOUS_TOOL",
                f"tool {name!r} exported by multiple servers ({servers}); "
                f"use a qualified name like '{matches[0].qualified_name}'",
            )
        return matches[0]

    # -- calls -------------------------------------------------------------
    async def call_tool(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        """Route a tool call to its owning server and unwrap the result.

        `name` is a bare tool name (when unambiguous) or a qualified
        '<server>.<tool>'. Returns the plain Python value the tool produced.
        """
        info = self._resolve(name)
        session = self._sessions[info.server]
        result = await session.call_tool(info.name, arguments or {})
        return unwrap_result(result)

    async def read_resource(self, uri: str, server: str | None = None) -> str:
        """Read a resource by URI. If `server` is omitted, the scheme's owning
        server is inferred from the URI prefix; pass `server` to disambiguate.
        """
        target = server or self._server_for_uri(uri)
        session = self._sessions[target]
        result = await session.read_resource(uri)
        # A real ClientSession returns ReadResourceResult(.contents=[...]) whose
        # items are TextResourceContents(.text); a server's own read_resource
        # returns a bare list of items with .content. Accept both shapes.
        items = getattr(result, "contents", result) or []
        parts = [getattr(c, "text", None) or getattr(c, "content", "") for c in items]
        return "\n".join(p for p in parts if p)

    def _server_for_uri(self, uri: str) -> str:
        """Best-effort: match a resource URI scheme to a server by name prefix."""
        scheme = uri.split("://", 1)[0]
        for name in self._sessions:
            if scheme in name:  # 'stocks' in 'mcp-server-stocks'
                return name
        # Single-server case: unambiguous.
        if len(self._sessions) == 1:
            return next(iter(self._sessions))
        raise MCPClientError("UNKNOWN_RESOURCE", f"cannot route resource {uri!r}")
