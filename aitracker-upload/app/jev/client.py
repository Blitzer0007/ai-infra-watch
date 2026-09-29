"""Small TypeSafe Jev client for bounded typed decisions.

Jev is used only for structured decisions (Choice / Noul), never for prose.
The official TypeSafe route is documented at:
https://api.typesafe.ai/v1/systemone
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings


@dataclass
class JevDecision:
    choice: str = ""
    confidence: float = 0.0
    probabilities: dict[str, float] | None = None
    model: str = ""
    latency_ms: float = 0.0
    error: str = ""

    @property
    def usable(self) -> bool:
        return bool(self.choice) and not self.error


class JevClient:
    """Minimal, server-side-only client for TypeSafe System One."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_sec: float | None = None,
    ) -> None:
        self.api_key = api_key or settings.JEV_API_KEY
        self.model = model or settings.JEV_MODEL
        self.timeout_sec = timeout_sec or settings.JEV_TIMEOUT_SEC

    @property
    def enabled(self) -> bool:
        return settings.JEV_ENABLED and bool(self.api_key)

    def choose(
        self,
        *,
        state: str,
        instructions: str,
        criteria: dict[str, str],
    ) -> JevDecision:
        if not self.enabled:
            return JevDecision(error="Jev is disabled or TYPESAFE_API_KEY is not configured.")

        body = {
            "state": state,
            "model": self.model,
            "questions": {
                "route": {
                    "type": "choice",
                    "instructions": instructions,
                    "criteria": criteria,
                }
            },
        }

        try:
            started = httpx.Timeout(self.timeout_sec)
            with httpx.Client(timeout=started) as client:
                response = client.post(
                    f"{settings.JEV_BASE_URL.rstrip('/')}/v1/systemone",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
            response.raise_for_status()
            payload = response.json()
            answer = (payload.get("answers") or {}).get("route") or {}
            probabilities = answer.get("probabilities")
            if isinstance(probabilities, dict):
                normalized = {
                    str(key): float(value)
                    for key, value in probabilities.items()
                    if isinstance(value, (int, float))
                }
            else:
                normalized = None

            return JevDecision(
                choice=str(answer.get("choice") or ""),
                confidence=float(answer.get("confidence") or 0.0),
                probabilities=normalized,
                model=str(payload.get("model") or self.model),
            )
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            return JevDecision(error=f"{type(exc).__name__}: {exc}")


__all__ = ["JevClient", "JevDecision"]
