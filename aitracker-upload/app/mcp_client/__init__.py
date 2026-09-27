"""MCP client layer — connects to N MCP servers, discovers tools, routes calls.

Usage (async context manager):
    async with MCPClient([stocks_cfg, filings_cfg]) as client:
        tools = client.tools()                        # all discovered tools
        result = await client.call_tool("get_quote", {"symbol": "NVDA"})
        text   = await client.read_resource("stocks://quotes/live")

Usage (sync, for LangGraph nodes):
    with MCPToolbox([stocks_cfg, filings_cfg]) as tb:
        result = tb.call("get_quote", {"symbol": "NVDA"})

Usage (app-level singleton pool):
    from app.mcp_client.manager import get_toolbox, use_mcp
    tb = get_toolbox()   # connects once, reused for the process lifetime

Tool namespacing: when two servers expose a tool with the same name, the
client prefixes both as "<server_name>.<tool_name>" so neither is shadowed.
Callers may use either the bare name (when unambiguous) or the prefixed form.
"""
from app.mcp_client.client import MCPClient, ServerConfig, ToolInfo
from app.mcp_client.toolbox import MCPToolbox
from app.mcp_client.servers import (
    default_configs,
    filings_config,
    live_configs,
    notifications_config,
    stocks_config,
)
from app.mcp_client.manager import (
    close_toolbox,
    get_toolbox,
    reconnect_toolbox,
    toolbox_status,
    use_mcp,
)

__all__ = [
    "MCPClient",
    "MCPToolbox",
    "ServerConfig",
    "ToolInfo",
    "stocks_config",
    "filings_config",
    "notifications_config",
    "default_configs",
    "live_configs",
    "get_toolbox",
    "close_toolbox",
    "reconnect_toolbox",
    "toolbox_status",
    "use_mcp",
]
