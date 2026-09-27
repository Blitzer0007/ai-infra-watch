"""mcp-server-notifications — send alerts to channels as MCP tools.

The 3rd custom MCP server the roadmap's Phase 5 calls for (financial
data + document store + notifications). Lets an agent (Report/Supervisor)
push alerts to Slack/webhook channels with severity thresholds.

Layout mirrors mcp_servers/stocks and mcp_servers/filings:
  service.py  — NotificationService (transport-independent, unit-tested)
                + injectable Sink (MemorySink hermetic / WebhookSink live)
  server.py   — build_server(service) MCP shell (contract-tested)
  schemas.py  — wire types (Alert, SendResult, Channel, Health)
"""
from mcp_servers.notifications.service import (
    MemorySink,
    NotificationService,
    WebhookSink,
    from_env,
)
from mcp_servers.notifications.schemas import (
    Alert,
    Channel,
    NotificationsHealth,
    SendResult,
)

__all__ = [
    "NotificationService",
    "MemorySink",
    "WebhookSink",
    "from_env",
    "Alert",
    "Channel",
    "NotificationsHealth",
    "SendResult",
]
