"""mcp-server-filings — RAG over SEC filings as MCP tools.

Public service/schema names are preserved, but service imports are lazy so
importing mcp_servers.filings.schemas does not pull the heavy RAG stack into
the lightweight Vercel autonomous entrypoint.
"""
from __future__ import annotations

from importlib import import_module
from typing import Any

_LAZY: dict[str, tuple[str, str]] = {
    "FilingsService": ("mcp_servers.filings.service", "FilingsService"),
    "from_env": ("mcp_servers.filings.service", "from_env"),
    "AnswerResult": ("mcp_servers.filings.schemas", "AnswerResult"),
    "Citation": ("mcp_servers.filings.schemas", "Citation"),
    "FilingsHealth": ("mcp_servers.filings.schemas", "FilingsHealth"),
    "SearchHit": ("mcp_servers.filings.schemas", "SearchHit"),
    "SearchResult": ("mcp_servers.filings.schemas", "SearchResult"),
}

__all__ = list(_LAZY)


def __getattr__(name: str) -> Any:
    """Resolve filings exports only when a caller actually uses them."""
    target = _LAZY.get(name)
    if target is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr_name = target
    value = getattr(import_module(module_name), attr_name)
    globals()[name] = value
    return value
