"""Singleton MCP toolbox pool — one persistent MCPToolbox for the app lifetime.

Motivation
----------
`MCPToolbox` spawns a background thread + a dedicated asyncio loop + three
stdio subprocesses on `connect()`. Paying that cost per `/api/ask` request
would be brutal: ~1-3s of subprocess boot + Python interpreter startup for
EVERY question. This manager holds ONE connected toolbox and lazily (re)
connects it on demand — the same pattern `_get_supervisor()` /
`_get_earnings_service()` already use for the other singletons in main.py.

Lifecycle
---------
  * `get_toolbox()`  -> returns the connected singleton, connecting if needed
  * `close_toolbox()` -> teardown (called by FastAPI lifespan on shutdown)
  * `reconnect_toolbox()` -> drop current connection, open a fresh one
                        (for SIGUSR1 / admin / after a server crash)

Graceful degradation
--------------------
If connecting any of the 3 MCP servers fails, the manager records which and
continues with whatever DID connect. An unreachable stocks server should not
take down filings + notifications — exactly like the agent layer degrades.
The caller sees whatever subset of tools the surviving servers advertise.
"""
from __future__ import annotations

import os
import threading
from typing import Any

from app.mcp_client import MCPToolbox, ServerConfig, ToolInfo
from app.mcp_client.client import MCPClientError
from app.mcp_client.servers import default_configs

_toolbox: MCPToolbox | None = None
_lock = threading.Lock()
_connect_errors: list[str] = []


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def use_mcp() -> bool:
    """True when USE_MCP=1 or when the caller explicitly opts in per-request.

    Default OFF keeps the existing in-process `/api/ask` byte-identical to
    the committed hermetic path (same prompt hashes, same fixtures). Flip
    USE_MCP=1 to make MCP the default mode.
    """
    return _env_bool("USE_MCP", False)


def _build_default_configs() -> list[ServerConfig]:
    """Build the 3-server config list. Exposed as a seam so tests inject fakes."""
    return default_configs()


def get_toolbox(
    configs: list[ServerConfig] | None = None,
    session_factory: Any = None,
) -> MCPToolbox:
    """Return the connected singleton toolbox, connecting on first call.

    A connect failure on ANY single server is recorded and swallowed — the
    remaining servers are still reachable. A total failure (zero servers
    reachable) re-raises the first connect error so the caller sees a
    clear failure instead of an empty toolbox.
    """
    global _toolbox
    if _toolbox is not None:
        return _toolbox
    with _lock:
        if _toolbox is not None:
            return _toolbox
        cfgs = list(configs or _build_default_configs())
        errors_this_call: list[str] = []

        for i in range(len(cfgs), 0, -1):
            subset = cfgs[:i]
            tb_kwargs: dict[str, Any] = {}
            if session_factory is not None:
                tb_kwargs["session_factory"] = session_factory
            tb = MCPToolbox(subset, **tb_kwargs)
            try:
                tb.connect()
            except BaseException as exc:  # noqa: BLE001 — degrade server-by-server
                errors_this_call.append(
                    f"{subset[-1].name}: {type(exc).__name__}: {exc}"
                )
                continue
            _toolbox = tb
            _connect_errors.extend(errors_this_call)
            return _toolbox

        _connect_errors.extend(errors_this_call)
        raise MCPClientError(
            "NO_SERVERS",
            f"failed to connect any MCP server: {'; '.join(errors_this_call) or 'unknown'}",
        )


def close_toolbox() -> None:
    """Tear down the singleton toolbox; safe to call multiple times."""
    global _toolbox, _connect_errors
    with _lock:
        if _toolbox is not None:
            try:
                _toolbox.close()
            finally:
                _toolbox = None
                _connect_errors = []


def reconnect_toolbox(
    configs: list[ServerConfig] | None = None,
    session_factory: Any = None,
) -> MCPToolbox:
    """Close then re-open the singleton. For server crashes / SIGUSR1 / admin."""
    close_toolbox()
    return get_toolbox(configs=configs, session_factory=session_factory)


def toolbox_status() -> dict[str, Any]:
    """Observability snapshot for /api/health or a dashboard tile."""
    if _toolbox is None:
        return {
            "connected": False,
            "servers": [],
            "tools": [],
            "connect_errors": list(_connect_errors),
        }
    try:
        servers = _toolbox.servers()
        tools: list[ToolInfo] = _toolbox.tools()
    except MCPClientError as exc:
        return {
            "connected": False,
            "servers": [],
            "tools": [],
            "connect_errors": [f"{exc.code}: {exc.message}"],
        }
    return {
        "connected": True,
        "servers": servers,
        "tool_count": len(tools),
        "tools": [t.qualified_name for t in tools],
        "connect_errors": list(_connect_errors),
    }


__all__ = [
    "get_toolbox",
    "close_toolbox",
    "reconnect_toolbox",
    "toolbox_status",
    "use_mcp",
]
