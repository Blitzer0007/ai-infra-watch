"""MCP server: send alerts to channels as tools + a live outbox resource.

Run (stdio transport, the MCP default):
    python -m mcp_servers.notifications.server
or
    python -c "import mcp_servers.notifications.server as s; s.main()"

Tools:
    send_alert(channel, title, body, severity) -> SendResult
    list_channels()                            -> list[Channel]
    get_history(limit)                         -> list[Alert]
    health()                                   -> NotificationsHealth

Resource:
    notifications://outbox/recent  -> recent alert history as JSON text

Every tool delegates to NotificationService (service.py) — the SAME
methods the unit + contract tests exercise directly, so the tested API
and the wire API cannot drift. This is the 3rd custom MCP server the
roadmap's Phase 5 calls for (financial data + document store + this).
"""
from __future__ import annotations

import json

from mcp.server import MCPServer
from mcp.types import ToolResultContent  # noqa: F401  (re-export for contract tests)

from mcp_servers.notifications.service import NotificationService, from_env as _from_env


def build_server(service: NotificationService | None = None) -> MCPServer:
    """Construct the MCPServer shell around a NotificationService.

    `service` is injectable so tests can hand in a MemorySink-backed
    service; production uses from_env(mode=...).
    """
    svc = service or _from_env()

    server = MCPServer(
        name="mcp-server-notifications",
        title="Notifications",
        description="Send alerts to channels (Slack/webhook) with severity thresholds.",
    )

    @server.tool(
        name="send_alert",
        description="Send an alert to a channel. Suppressed if below the channel's severity threshold.",
    )
    def send_alert(channel: str, title: str, body: str = "", severity: str = "info") -> dict:
        return svc.send_alert(channel, title, body=body, severity=severity).model_dump()

    @server.tool(name="list_channels", description="List the configured delivery channels and thresholds.")
    def list_channels() -> list[dict]:
        return [c.model_dump() for c in svc.list_channels()]

    @server.tool(name="get_history", description="Return the most recent alerts created this session.")
    def get_history(limit: int = 20) -> list[dict]:
        return [a.model_dump() for a in svc.get_history(limit=limit)]

    @server.tool(name="health", description="Notifications server health snapshot for observability.")
    def health() -> dict:
        return svc.health().model_dump()

    @server.resource(
        uri="notifications://outbox/recent",
        name="recent_outbox",
        description="Recent alert history (JSON text).",
        mime_type="application/json",
    )
    def recent_outbox() -> str:
        history = [a.model_dump() for a in svc.get_history(limit=20)]
        return json.dumps(history, ensure_ascii=False)

    return server


def from_env(mode: str = "fixture") -> NotificationService:
    """Fixture or live service selected by the caller (usually via env)."""
    return _from_env(mode)


def main() -> None:
    import os

    mode = os.getenv("NOTIFY_MODE", "fixture")
    server = build_server(_from_env(mode=mode))
    server.run(transport="stdio")


if __name__ == "__main__":
    main()
