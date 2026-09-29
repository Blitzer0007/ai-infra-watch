"""Server-side TypeSafe Jev client for fast, typed platform decisions.

Jev is used only for structured decisions (Choice / Score / Noul), never for
prose generation. Multiple questions can be evaluated in one System One call.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import time
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


@dataclass
class JevAnswer:
    type: str = ""
    choice: str = ""
    confidence: float | None = None
    probabilities: dict[str, float] = field(default_factory=dict)
    score: float | None = None
    legend: dict[str, str] = field(default_factory=dict)
    noul: float | None = None


@dataclass
class JevEvaluation:
    answers: dict[str, JevAnswer] = field(default_factory=dict)
    model: str = ""
    latency_ms: float = 0.0
    input_tokens: int | None = None
    error: str = ""

    @property
    def usable(self) -> bool:
        return bool(self.answers) and not self.error


class JevClient:
    """Minimal, server-side-only client for TypeSafe System One."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout_sec: float | None = None,
    ) -> None:
        self.api_key = settings.JEV_API_KEY if api_key is None else api_key
        self.model = settings.JEV_MODEL if model is None else model
        self.timeout_sec = settings.JEV_TIMEOUT_SEC if timeout_sec is None else timeout_sec

    @property
    def enabled(self) -> bool:
        return settings.JEV_ENABLED and bool(self.api_key)

    @staticmethod
    def _normalise_probabilities(value: Any) -> dict[str, float]:
        if not isinstance(value, dict):
            return {}
        output: dict[str, float] = {}
        for key, number in value.items():
            if isinstance(number, (int, float)):
                output[str(key)] = float(number)
        return output

    def evaluate(
        self,
        *,
        state: str,
        questions: dict[str, dict[str, Any]],
    ) -> JevEvaluation:
        if not self.enabled:
            return JevEvaluation(
                error="Jev is disabled or TYPESAFE_API_KEY is not configured."
            )
        if not questions:
            return JevEvaluation(error="No Jev questions supplied.")
        if not isinstance(state, str) or not state.strip():
            return JevEvaluation(error="Jev state must be a non-empty string.")

        body = {
            "state": state,
            "model": self.model,
            "questions": questions,
        }

        try:
            started_at = time.perf_counter()
            with httpx.Client(timeout=httpx.Timeout(self.timeout_sec)) as client:
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
            raw_answers = payload.get("answers") or {}
            answers: dict[str, JevAnswer] = {}
            for key, raw in raw_answers.items():
                if not isinstance(raw, dict):
                    continue
                answers[str(key)] = JevAnswer(
                    type=str(raw.get("type") or ""),
                    choice=str(raw.get("choice") or ""),
                    confidence=(
                        float(raw["confidence"])
                        if isinstance(raw.get("confidence"), (int, float))
                        else None
                    ),
                    probabilities=self._normalise_probabilities(raw.get("probabilities")),
                    score=(
                        float(raw["score"])
                        if isinstance(raw.get("score"), (int, float))
                        else None
                    ),
                    legend={
                        str(k): str(v)
                        for k, v in (raw.get("legend") or {}).items()
                    } if isinstance(raw.get("legend"), dict) else {},
                    noul=(
                        float(raw["noul"])
                        if isinstance(raw.get("noul"), (int, float))
                        else None
                    ),
                )

            usage = payload.get("usage") or {}
            input_tokens = usage.get("input_tokens")
            return JevEvaluation(
                answers=answers,
                model=str(payload.get("model") or self.model),
                latency_ms=(time.perf_counter() - started_at) * 1000.0,
                input_tokens=int(input_tokens) if isinstance(input_tokens, (int, float)) else None,
            )
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            return JevEvaluation(error=f"{type(exc).__name__}: {exc}")

    def choose(
        self,
        *,
        state: str,
        instructions: str,
        criteria: dict[str, str],
    ) -> JevDecision:
        evaluation = self.evaluate(
            state=state,
            questions={
                "route": {
                    "type": "choice",
                    "instructions": instructions,
                    "criteria": criteria,
                }
            },
        )
        if not evaluation.usable:
            return JevDecision(
                model=evaluation.model or self.model,
                latency_ms=evaluation.latency_ms,
                error=evaluation.error,
            )

        answer = evaluation.answers.get("route") or JevAnswer()
        return JevDecision(
            choice=answer.choice,
            confidence=answer.confidence or 0.0,
            probabilities=answer.probabilities or None,
            model=evaluation.model or self.model,
            latency_ms=evaluation.latency_ms,
        )


__all__ = ["JevClient", "JevDecision", "JevAnswer", "JevEvaluation"]
