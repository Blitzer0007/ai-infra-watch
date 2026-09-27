"""NotificationService — transport-independent alert delivery.

Sends alerts to configured channels through an injectable SINK — the
same Agent-Isolation seam as every other server:

  * MemorySink   — records what WOULD be sent, in memory (hermetic default;
                   no network, offline). Tests assert against .outbox.
  * WebhookSink   — POSTs a JSON payload to a Slack/Discord incoming webhook
                   (live mode). Never touched by the hermetic path.

Operations the MCP tools delegate to:

  * send_alert(channel, title, body, severity) -> SendResult
  * list_channels()                            -> list[Channel]
  * get_history(limit)                         -> list[Alert]
  * health()                                   -> NotificationsHealth

A channel carries a minimum-severity threshold: an alert below it is
SUPPRESSED (delivered=False, suppressed=True) rather than sent — so a
noisy 'info' can't page an on-call 'critical' channel. Unknown channels
raise ValueError (surfaces as a ToolError on the wire), matching how the
other servers reject bad input.
"""
from __future__ import annotations

import json
import os
from typing import Protocol

from mcp_servers.notifications.schemas import (
    SEVERITY_ORDER,
    Alert,
    Channel,
    NotificationsHealth,
    SendResult,
)

# Default channels available in fixture mode. `min_severity` gates delivery.
DEFAULT_CHANNELS: tuple[Channel, ...] = (
    Channel(name="alerts", min_severity="info", description="General alerts feed"),
    Channel(name="oncall", min_severity="critical", description="Pages on-call; critical only"),
    Channel(name="digest", min_severity="warning", description="Warning+ rollups"),
)

# Fixed clock for hermetic determinism; production passes a real one.
_FIXED_CLOCK = "2026-08-03T00:00:00Z"


class Sink(Protocol):
    """A delivery backend. `deliver` returns a short sink id string on success
    and raises on failure (the service turns a raise into delivered=False)."""

    id: str

    def deliver(self, alert: Alert) -> str: ...


class MemorySink:
    """In-memory sink — records every delivered alert; no network. Hermetic
    default so tests (and CI) never hit a real webhook."""

    id = "memory"

    def __init__(self) -> None:
        self.outbox: list[Alert] = []

    def deliver(self, alert: Alert) -> str:
        self.outbox.append(alert)
        return self.id


class WebhookSink:
    """POSTs alerts to an incoming webhook (Slack/Discord). Live mode only.

    httpx is imported lazily so the hermetic path never requires it and the
    default install (requirements.txt) stays light.
    """

    id = "webhook"

    def __init__(self, url: str, timeout: float = 5.0) -> None:
        if not url:
            raise ValueError("WebhookSink requires a non-empty webhook URL")
        self._url = url
        self._timeout = timeout

    def deliver(self, alert: Alert) -> str:
        import httpx  # lazy: only needed on the live path

        payload = {"text": alert.one_line(), "alert": alert.model_dump()}
        resp = httpx.post(self._url, json=payload, timeout=self._timeout)
        resp.raise_for_status()
        return self.id


class NotificationService:
    def __init__(
        self,
        sink: Sink | None = None,
        channels: tuple[Channel, ...] = DEFAULT_CHANNELS,
        mode: str = "fixture",
        clock=lambda: _FIXED_CLOCK,
    ) -> None:
        self._sink: Sink = sink or MemorySink()
        self._channels = {c.name: c for c in channels}
        self.mode = mode
        self._clock = clock
        self._history: list[Alert] = []
        self._sent = 0
        self._suppressed = 0

    # ---- operations --------------------------------------------------
    def send_alert(
        self, channel: str, title: str, body: str = "", severity: str = "info"
    ) -> SendResult:
        if not title or not title.strip():
            raise ValueError("title must be a non-empty string")
        if severity not in SEVERITY_ORDER:
            raise ValueError(
                f"severity must be one of {sorted(SEVERITY_ORDER)}, got {severity!r}"
            )
        ch = self._channels.get(channel)
        if ch is None:
            raise ValueError(
                f"unknown channel {channel!r}; known: {sorted(self._channels)}"
            )

        now = self._clock()
        alert = Alert(
            channel=channel, title=title, body=body, severity=severity, as_of=now
        )
        self._history.append(alert)

        # Threshold gate: suppress alerts below the channel's minimum severity.
        if SEVERITY_ORDER[severity] < SEVERITY_ORDER[ch.min_severity]:
            self._suppressed += 1
            return SendResult(
                delivered=False,
                channel=channel,
                severity=severity,
                sink=self._sink.id,
                suppressed=True,
                detail=f"severity {severity} below channel minimum {ch.min_severity}",
                as_of=now,
            )

        try:
            sink_id = self._sink.deliver(alert)
        except Exception as exc:  # noqa: BLE001 - a sink failure is a soft failure
            return SendResult(
                delivered=False,
                channel=channel,
                severity=severity,
                sink=self._sink.id,
                suppressed=False,
                detail=f"sink error: {exc}",
                as_of=now,
            )

        self._sent += 1
        return SendResult(
            delivered=True,
            channel=channel,
            severity=severity,
            sink=sink_id,
            suppressed=False,
            as_of=now,
        )

    def list_channels(self) -> list[Channel]:
        return [self._channels[name] for name in sorted(self._channels)]

    def get_history(self, limit: int = 20) -> list[Alert]:
        if limit < 0:
            raise ValueError("limit must be >= 0")
        return self._history[-limit:] if limit else list(self._history)

    def health(self) -> NotificationsHealth:
        return NotificationsHealth(
            mode=self.mode,
            sink=self._sink.id,
            channels=sorted(self._channels),
            sent=self._sent,
            suppressed=self._suppressed,
            ok=True,
        )

    # ---- introspection for tests -------------------------------------
    @property
    def outbox(self) -> list[Alert]:
        """The MemorySink outbox, when using one (empty list otherwise)."""
        return getattr(self._sink, "outbox", [])


def from_env(mode: str | None = None) -> NotificationService:
    """Build a NotificationService from the environment.

    NOTIFY_MODE=fixture (default) -> MemorySink (records, no network).
    NOTIFY_MODE=live               -> WebhookSink if NOTIFY_WEBHOOK_URL is set,
                                       else falls back to MemorySink so the
                                       server still starts and health() explains.
    """
    mode = (mode or os.getenv("NOTIFY_MODE", "fixture")).strip().lower()
    if mode == "live":
        url = os.getenv("NOTIFY_WEBHOOK_URL", "").strip()
        if url:
            return NotificationService(sink=WebhookSink(url), mode="live", clock=_real_clock)
        # No webhook configured — degrade to memory, still live-mode-labelled.
        svc = NotificationService(sink=MemorySink(), mode="live", clock=_real_clock)
        return svc
    return NotificationService(sink=MemorySink(), mode="fixture")


def _real_clock() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
