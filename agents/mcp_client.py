from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass
from typing import Any

from mcp import Client, StdioServerParameters


@dataclass(frozen=True)
class MCPConfig:
    name: str
    url: str | None = None
    command: str | None = None
    args: tuple[str, ...] = ()


def load_mcp_config(name: str) -> MCPConfig | None:
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
            )

    url = os.getenv(f"AI_INFRA_WATCH_{name.upper()}_MCP_URL", "").strip()
    if url:
        return MCPConfig(name=name, url=url)

    command = os.getenv(f"AI_INFRA_WATCH_{name.upper()}_MCP_COMMAND", "").strip()
    if command:
        args_raw = os.getenv(f"AI_INFRA_WATCH_{name.upper()}_MCP_ARGS", "[]")
        return MCPConfig(name=name, command=command, args=tuple(json.loads(args_raw)))

    return None


async def discover_tools(config: MCPConfig) -> list[dict[str, Any]]:
    if config.url:
        server = config.url
    elif config.command:
        server = StdioServerParameters(command=config.command, args=list(config.args))
    else:
        raise ValueError(f"MCP config for {config.name!r} has no url or command")

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
    if config.url:
        server = config.url
    elif config.command:
        server = StdioServerParameters(command=config.command, args=list(config.args))
    else:
        raise ValueError(f"MCP config for {config.name!r} has no url or command")

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
