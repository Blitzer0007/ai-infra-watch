"""Unit tests for NotificationService (transport-independent).

Drive the service directly (no MCP dispatch) to prove the delivery
logic: sink recording, severity-threshold suppression, history, channel
validation, and sink-failure degradation. The contract test
(test_notifications_contract.py) proves the SAME methods over the wire.

Strategies:
  1. Delivery — an alert at/above threshold reaches the sink outbox
  2. Suppression — an alert below the channel threshold is NOT delivered
  3. Validation — empty title / bad severity / unknown channel raise
  4. History — get_history returns created alerts (incl. suppressed), limited
  5. Sink failure — a raising sink degrades to delivered=False, no crash
  6. Health — counts sent vs suppressed, reports sink + channels
"""
from __future__ import annotations

import pytest

from mcp_servers.notifications.service import (
    DEFAULT_CHANNELS,
    MemorySink,
    NotificationService,
)


def _svc(sink=None) -> NotificationService:
    return NotificationService(sink=sink or MemorySink())


# ---- 1. delivery -------------------------------------------------------
def test_alert_at_threshold_is_delivered_to_sink():
    sink = MemorySink()
    svc = _svc(sink)
    result = svc.send_alert("alerts", "NVDA up 5%", body="rotation into hardware", severity="info")
    assert result.delivered is True
    assert result.suppressed is False
    assert result.sink == "memory"
    assert len(sink.outbox) == 1
    assert sink.outbox[0].title == "NVDA up 5%"


def test_critical_reaches_oncall():
    sink = MemorySink()
    svc = _svc(sink)
    result = svc.send_alert("oncall", "Feed down", severity="critical")
    assert result.delivered is True
    assert len(sink.outbox) == 1


# ---- 2. suppression ----------------------------------------------------
def test_info_below_oncall_threshold_is_suppressed():
    sink = MemorySink()
    svc = _svc(sink)
    result = svc.send_alert("oncall", "minor blip", severity="info")
    assert result.delivered is False
    assert result.suppressed is True
    assert "below channel minimum" in result.detail
    assert sink.outbox == []  # never reached the sink


def test_warning_below_critical_threshold_is_suppressed():
    svc = _svc()
    result = svc.send_alert("oncall", "elevated errors", severity="warning")
    assert result.suppressed is True


def test_warning_meets_digest_threshold():
    sink = MemorySink()
    svc = _svc(sink)
    result = svc.send_alert("digest", "weekly rollup", severity="warning")
    assert result.delivered is True
    assert len(sink.outbox) == 1


# ---- 3. validation -----------------------------------------------------
def test_empty_title_raises():
    with pytest.raises(ValueError, match="title"):
        _svc().send_alert("alerts", "   ", severity="info")


def test_bad_severity_raises():
    with pytest.raises(ValueError, match="severity"):
        _svc().send_alert("alerts", "hi", severity="nuclear")


def test_unknown_channel_raises():
    with pytest.raises(ValueError, match="unknown channel"):
        _svc().send_alert("nope", "hi", severity="info")


# ---- 4. history --------------------------------------------------------
def test_history_records_delivered_and_suppressed():
    svc = _svc()
    svc.send_alert("alerts", "one", severity="info")
    svc.send_alert("oncall", "two", severity="info")  # suppressed
    history = svc.get_history()
    assert [a.title for a in history] == ["one", "two"]  # both recorded


def test_history_limit_returns_last_n():
    svc = _svc()
    for i in range(5):
        svc.send_alert("alerts", f"msg{i}", severity="info")
    last2 = svc.get_history(limit=2)
    assert [a.title for a in last2] == ["msg3", "msg4"]


def test_history_negative_limit_raises():
    with pytest.raises(ValueError, match="limit"):
        _svc().get_history(limit=-1)


# ---- 5. sink failure degrades gracefully -------------------------------
def test_raising_sink_degrades_to_not_delivered():
    class BoomSink:
        id = "boom"

        def deliver(self, alert):
            raise RuntimeError("webhook 500")

    svc = _svc(BoomSink())
    result = svc.send_alert("alerts", "will fail", severity="info")
    assert result.delivered is False
    assert result.suppressed is False
    assert "sink error" in result.detail
    # still recorded in history even though delivery failed
    assert len(svc.get_history()) == 1


# ---- 6. health ---------------------------------------------------------
def test_health_counts_sent_and_suppressed():
    svc = _svc()
    svc.send_alert("alerts", "a", severity="info")       # sent
    svc.send_alert("alerts", "b", severity="warning")    # sent
    svc.send_alert("oncall", "c", severity="info")       # suppressed
    h = svc.health()
    assert h.server == "mcp-server-notifications"
    assert h.sent == 2
    assert h.suppressed == 1
    assert h.sink == "memory"
    assert set(h.channels) == {c.name for c in DEFAULT_CHANNELS}
    assert h.ok is True


def test_list_channels_sorted_with_thresholds():
    channels = _svc().list_channels()
    names = [c.name for c in channels]
    assert names == sorted(names)
    oncall = next(c for c in channels if c.name == "oncall")
    assert oncall.min_severity == "critical"
