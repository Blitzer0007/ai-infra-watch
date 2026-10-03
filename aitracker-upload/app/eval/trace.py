"""Trace storage: every eval run (and synthesis call) appends a JSONL
line to data/traces/<timestamp>.jsonl.

    data/traces/2026-08-03T14-03-22.jsonl
      {"kind":"eval", "metrics": {...}, "failures": [...]}
      {"kind":"call", "prompt": "...", "response": "...", "metadata": {...}}

Simple, append-only, greppable. A later milestone can swap this for
LangSmith / Langfuse without changing callers.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.config import settings


def _trace_file() -> Path:
    ts = time.strftime("%Y-%m-%dT%H-%M-%S")
    return settings.TRACES_DIR / f"{ts}.jsonl"


def _append(obj: dict[str, Any]) -> None:
    if not settings.TRACE_ENABLED:
        return
    try:
        settings.TRACES_DIR.mkdir(parents=True, exist_ok=True)
        with _trace_file().open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except OSError:
        pass  # tracing must never break the caller


def record_eval(metrics: dict[str, Any], failures: list[dict[str, Any]]) -> None:
    _append({"kind": "eval", "ts": time.time(), "metrics": metrics, "failures": failures})


def record_event(kind: str, metadata: dict[str, Any] | None = None) -> None:
    """Record a lightweight operational event without capturing prompts."""
    _append({
        "kind": "event",
        "event_kind": kind,
        "ts": time.time(),
        "event_id": uuid.uuid4().hex,
        "metadata": metadata or {},
    })


def record_call(
    kind: str,
    prompt: str,
    response: str,
    metadata: dict[str, Any] | None = None,
    retrieved_docs: list[dict[str, Any]] | None = None,
) -> None:
    from app.llm.client import estimate_tokens

    _append(
        {
            "kind": "call",
            "call_kind": kind,
            "ts": time.time(),
            "event_id": uuid.uuid4().hex,
            "prompt": prompt,
            "retrieved_docs": retrieved_docs or [],
            "metadata": metadata or {},
            "response": response,
            "tokens_estimate": {
                "prompt": estimate_tokens(prompt),
                "completion": estimate_tokens(response),
            },
        }
    )
