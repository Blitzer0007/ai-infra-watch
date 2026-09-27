from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


from mcp import Client, StdioServerParameters


@dataclass(frozen=True)
class MCPConfig:
    name: str
    url: str | None = None
    command: str | None = None
    args: tuple[str, ...] = ()
    cwd: str | None = None
    env: dict[str, str] | None = None


def _selected_env(*names: str, defaults: dict[str, str] | None = None) -> dict[str, str]:
    """Pass only MCP-relevant environment variables to local child servers."""
    values = dict(defaults or {})
    for name in names:
        value = os.getenv(name)
        if value is not None and value != "":
            values[name] = value
    return values


def _local_server_config(name: str) -> MCPConfig | None:
    """Use the committed aitracker-upload MCP server when no external config is set."""
    project_root = Path(__file__).resolve().parents[1]
    server_root = project_root / "aitracker-upload"
    package_root = server_root / "mcp_servers" / name
    if not package_root.is_dir():
        return None

    if name == "stocks":
        env = _selected_env(
            "FINNHUB_API_KEY",
            "STOCKS_MODE",
            defaults={"STOCKS_MODE": "live"},
        )
    elif name == "filings":
        env = _selected_env(
            "FILINGS_MODE",
            "EDGAR_USER_AGENT",
            "LLM_PROVIDER",
            "LLM_MODEL",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            defaults={"FILINGS_MODE": "live"},
        )
    elif name == "notifications":
        env = _selected_env(
            "NOTIFY_MODE",
            "NOTIFY_WEBHOOK_URL",
            defaults={"NOTIFY_MODE": "fixture"},
        )
    else:
        env = {}

    return MCPConfig(
        name=name,
        command=sys.executable,
        args=("-m", f"mcp_servers.{name}.server"),
        cwd=str(server_root),
        env=env or None,
    )


def load_mcp_config(name: str) -> MCPConfig | None:
    """Load explicit MCP configuration, otherwise use the committed local server."""
    raw = os.getenv("AI_INFRA_WATCH_MCP_CONFIG", "").strip()
    if raw:
        config = json.loads(raw)
        item = config.get(name)
        if item:
            return MCPConfig(
                name=name,
                url=item.get("url"),
                command=item.get("command"),
                args=tuple(item.get("args", [])),
                cwd=item.get("cwd"),
                env=item.get("env"),
            )

    prefix = f"AI_INFRA_WATCH_{name.upper()}_MCP"

    url = os.getenv(f"{prefix}_URL", "").strip()
    if url:
        return MCPConfig(name=name, url=url)

    command = os.getenv(f"{prefix}_COMMAND", "").strip()
    if command:
        args_raw = os.getenv(f"{prefix}_ARGS", "[]")
        env_raw = os.getenv(f"{prefix}_ENV_JSON", "").strip()
        cwd = os.getenv(f"{prefix}_CWD", "").strip() or None
        env = json.loads(env_raw) if env_raw else None
        return MCPConfig(
            name=name,
            command=command,
            args=tuple(json.loads(args_raw)),
            cwd=cwd,
            env=env,
        )

    return _local_server_config(name)


def _server_parameters(config: MCPConfig) -> str | StdioServerParameters:
    if config.url:
        return config.url
    if config.command:
        return StdioServerParameters(
            command=config.command,
            args=list(config.args),
            cwd=config.cwd,
            env=config.env,
        )
    raise ValueError(f"MCP config for {config.name!r} has no url or command")


async def discover_tools(config: MCPConfig) -> list[dict[str, Any]]:
    server = _server_parameters(config)

    async with Client(server) as client:
        result = await client.list_tools()
        return [
            {
                "name": tool.name,
                "title": getattr(tool, "title", None),
                "description": getattr(tool, "description", None),
                "inputSchema": getattr(tool, "inputSchema", None),
            }
            for tool in result.tools
        ]


async def call_tool(
    config: MCPConfig,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> Any:
    server = _server_parameters(config)

    async with Client(server) as client:
        result = await client.call_tool(tool_name, arguments or {})
        if getattr(result, "is_error", False):
            raise RuntimeError(f"MCP tool {tool_name!r} returned an error result")
        return getattr(result, "structured_content", None) or {
            "content": [getattr(block, "text", str(block)) for block in result.content]
        }


def discover_tools_sync(config: MCPConfig) -> list[dict[str, Any]]:
    return asyncio.run(discover_tools(config))


def call_tool_sync(
    config: MCPConfig,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> Any:
    return asyncio.run(call_tool(config, tool_name, arguments))
