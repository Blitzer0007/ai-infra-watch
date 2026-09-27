"""Wire types for mcp-server-notifications (JSON-serializable).

These are the CONTRACT between the notifications MCP server and any
client (the Report/Supervisor agents, tests). Every tool returns one of
these models; contract tests assert the server's tool schemas match
them, so an agent can type-check against a stable shape.

An alert is the unit the server sends. `severity` gates whether a sink
delivers it (a channel can suppress below its threshold). `as_of` is an
ISO-8601 UTC timestamp string — kept a string (not datetime) so the wire
form is stable and JSON-native, same discipline as stocks.Quote.as_of.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["info", "warning", "critical"]

# Ordering for threshold comparisons ("deliver >= warning").
SEVERITY_ORDER: dict[str, int] = {"info": 0, "warning": 1, "critical": 2}


class Alert(BaseModel):
    """A single notification to deliver to one channel."""

    channel: str = Field(description="Target channel id, e.g. 'alerts' or 'email'")
    title: str = Field(description="Short alert headline")
    body: str = Field(default="", description="Alert detail body")
    severity: Severity = Field(default="info", description="info | warning | critical")
    as_of: str = Field(description="ISO-8601 UTC timestamp the alert was created")

    def one_line(self) -> str:
        """Human/agent-readable single line with the mandatory timestamp."""
        return f"[{self.severity.upper()}] {self.channel}: {self.title} (as of {self.as_of})"


class SendResult(BaseModel):
    """send_alert output — whether the alert was delivered and to where."""

    delivered: bool = Field(description="True if a sink accepted the alert")
    channel: str
    severity: Severity = "info"
    sink: str = Field(default="memory", description="Sink id that handled it (memory|webhook)")
    suppressed: bool = Field(default=False, description="True if below the channel threshold")
    detail: str = ""
    as_of: str = Field(description="ISO-8601 UTC timestamp of the send attempt")


class Channel(BaseModel):
    """A configured delivery channel and its minimum severity threshold."""

    name: str
    min_severity: Severity = "info"
    description: str = ""


class NotificationsHealth(BaseModel):
    """health output for mcp-server-notifications."""

    server: str = "mcp-server-notifications"
    mode: Literal["live", "fixture"] = "fixture"
    sink: str = Field(default="memory", description="Active sink id (memory|webhook)")
    channels: list[str] = Field(default_factory=list)
    sent: int = Field(default=0, description="Alerts delivered this process")
    suppressed: int = Field(default=0, description="Alerts suppressed below threshold")
    ok: bool = True
    detail: str = ""
