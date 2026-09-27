"""Contract tests for the notifications MCP server.

These drive the REAL MCP dispatch path (server.list_tools / call_tool,
both async) rather than calling the service directly — so they prove the
wire contract an agent sees:

  * the exact tool set is registered
  * each tool's input_schema advertises the params agents pass
  * call_tool results round-trip back into the pydantic schemas
  * structured errors (bad severity/channel) surface as ToolError, not crashes

If a future refactor drops a tool or renames a field, these fail — which
is the point (contract = schema matches what agents expect). Mirrors
tests/mcp/test_stocks_contract.py.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from mcp.server.mcpserver.exceptions import ToolError

from mcp_servers.notifications import (
    Alert,
    MemorySink,
    NotificationService,
    NotificationsHealth,
    SendResult,
)
from mcp_servers.notifications.server import build_server

EXPECTED_TOOLS = {"send_alert", "list_channels", "get_history", "health"}


@pytest.fixture
def sink() -> MemorySink:
    return MemorySink()


@pytest.fixture
def server(sink):
    svc = NotificationService(sink=sink)
    return build_server(svc)


def _run(coro):
    return asyncio.run(coro)


def _text(result) -> str:
    """Extract the text payload from a CallToolResult."""
    assert not result.is_error, f"tool errored: {result}"
    return result.content[0].text


# ---- tool registration -------------------------------------------------
def test_expected_tools_are_registered(server):
    tools = _run(server.list_tools())
    names = {t.name for t in tools}
    assert names == EXPECTED_TOOLS


def test_send_alert_input_schema_advertises_params(server):
    tools = _run(server.list_tools())
    tool = next(t for t in tools if t.name == "send_alert")
    props = (tool.input_schema or {}).get("properties", {})
    assert "channel" in props and "title" in props and "severity" in props


# ---- call round-trips into the schemas ---------------------------------
def test_send_alert_result_roundtrips_and_reaches_sink(server, sink):
    result = _run(
        server.call_tool("send_alert", {"channel": "alerts", "title": "NVDA +5%", "severity": "info"})
    )
    sent = SendResult.model_validate_json(_text(result))
    assert sent.delivered is True
    assert sent.channel == "alerts"
    assert sent.as_of  # timestamp guardrail: never empty
    assert len(sink.outbox) == 1
    assert sink.outbox[0].title == "NVDA +5%"


def test_suppressed_alert_roundtrips_not_delivered(server, sink):
    result = _run(
        server.call_tool("send_alert", {"channel": "oncall", "title": "blip", "severity": "info"})
    )
    sent = SendResult.model_validate_json(_text(result))
    assert sent.delivered is False
    assert sent.suppressed is True
    assert sink.outbox == []


def test_list_channels_returns_channel_objects(server):
    # A tool returning list[dict] renders one TextContent per element.
    result = _run(server.call_tool("list_channels", {}))
    assert not result.is_error
    names = {json.loads(block.text)["name"] for block in result.content}
    assert {"alerts", "oncall", "digest"} <= names


def test_get_history_roundtrips_to_alerts(server):
    _run(server.call_tool("send_alert", {"channel": "alerts", "title": "one", "severity": "info"}))
    _run(server.call_tool("send_alert", {"channel": "alerts", "title": "two", "severity": "warning"}))
    result = _run(server.call_tool("get_history", {"limit": 20}))
    assert not result.is_error
    titles = {Alert.model_validate_json(block.text).title for block in result.content}
    assert {"one", "two"} <= titles


def test_health_tool_reports_notifications_server(server):
    result = _run(server.call_tool("health", {}))
    health = NotificationsHealth.model_validate_json(_text(result))
    assert health.server == "mcp-server-notifications"
    assert health.sink == "memory"
    assert "alerts" in health.channels


# ---- structured errors surface as ToolError ----------------------------
def test_bad_severity_raises_tool_error(server):
    with pytest.raises(ToolError):
        _run(server.call_tool("send_alert", {"channel": "alerts", "title": "x", "severity": "nuke"}))


def test_unknown_channel_raises_tool_error(server):
    with pytest.raises(ToolError):
        _run(server.call_tool("send_alert", {"channel": "ghost", "title": "x", "severity": "info"}))


def test_empty_title_raises_tool_error(server):
    with pytest.raises(ToolError):
        _run(server.call_tool("send_alert", {"channel": "alerts", "title": "  ", "severity": "info"}))


# ---- resource ----------------------------------------------------------
def test_recent_outbox_resource_returns_json(server):
    _run(server.call_tool("send_alert", {"channel": "alerts", "title": "res", "severity": "info"}))
    contents = _run(server.read_resource("notifications://outbox/recent"))
    # server.read_resource returns a list of ReadResourceContents; payload on .content
    payload = json.loads(contents[0].content)
    assert any(a["title"] == "res" for a in payload)


# ---- live smoke — real stdio through the sync facade -------------------
@pytest.mark.live
def test_live_notifications_over_stdio():
    """Drive mcp_servers.notifications.server over real stdio via MCPToolbox.

    This exercises the DICT-return path over the wire (send_alert/health return
    dicts) — the case that surfaced the unwrap_result JSON-parse fix. A dict
    return arrives with structured_content=None and JSON in a text block, so a
    naive client would hand back a raw string here.
    """
    import sys

    from app.mcp_client import MCPToolbox, ServerConfig

    cfg = ServerConfig(
        name="notifications",
        command=sys.executable,
        args=["-m", "mcp_servers.notifications.server"],
    )
    with MCPToolbox([cfg]) as tb:
        names = {t.name for t in tb.tools()}
        assert {"send_alert", "list_channels", "get_history", "health"} <= names

        channels = tb.call("list_channels")  # list return
        assert isinstance(channels, list) and {c["name"] for c in channels} >= {"alerts", "oncall"}

        sent = tb.call("send_alert", {"channel": "alerts", "title": "live smoke", "severity": "info"})
        assert isinstance(sent, dict) and sent["delivered"] is True  # dict return, parsed

        suppressed = tb.call("send_alert", {"channel": "oncall", "title": "blip", "severity": "info"})
        assert suppressed["suppressed"] is True

        health = tb.call("health")  # dict return
        assert isinstance(health, dict) and health["server"] == "mcp-server-notifications"

        text = tb.read("notifications://outbox/recent")
        assert "live smoke" in text
