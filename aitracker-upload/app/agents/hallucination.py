"""Lightweight claim-grounding audit for autonomous AI synthesis.

This intentionally uses lexical evidence matching so the audit works in the
existing lean/serverless environment without an additional model dependency.
It is a diagnostic signal, not a proof of factual correctness.
"""
from __future__ import annotations

import re
from typing import Any


_STOP = {
    "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this",
    "these", "those", "is", "are", "was", "were", "be", "been", "to", "of",
    "in", "on", "for", "from", "with", "as", "by", "at", "it", "its", "into",
    "about", "what", "why", "how", "can", "could", "would", "should", "do",
    "does", "did", "not", "no", "recent", "current", "also", "may", "might",
}


def _tokens(text: str) -> set[str]:
    values = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_.%$-]{2,}", str(text).lower())
    return {value for value in values if value not in _STOP}


def _claims(text: str) -> list[str]:
    return [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+|\n+", str(text or ""))
        if len(part.strip()) >= 18
    ]


def _flatten_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        parts: list[str] = []
        for key, child in value.items():
            if key in {"error", "status"}:
                continue
            parts.append(str(key))
            parts.append(_flatten_output(child))
        return " ".join(parts)
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten_output(item) for item in value)
    return str(value)


def audit(summary: str, calls: list[Any], threshold: float = 0.18) -> dict[str, Any]:
    claims = _claims(summary)
    sources = "\n".join(
        _flatten_output(getattr(call, "output", None))
        for call in calls
        if getattr(call, "ok", False)
    )
    source_tokens = _tokens(sources)

    results: list[dict[str, Any]] = []
    for index, claim in enumerate(claims):
        tokens = _tokens(claim)
        overlap = len(tokens & source_tokens) / max(1, len(tokens))
        grounded = overlap >= threshold
        results.append({
            "index": index + 1,
            "claim": claim,
            "grounded": grounded,
            "overlap": round(overlap, 3),
        })

    grounded_count = sum(1 for item in results if item["grounded"])
    ungrounded = [item for item in results if not item["grounded"]]
    hallucination_rate = (
        round((len(ungrounded) / len(results)) * 100, 1) if results else None
    )

    return {
        "enabled": True,
        "evaluator": "deterministic-lexical-v1",
        "claimCount": len(results),
        "groundedClaims": grounded_count,
        "ungroundedClaims": len(ungrounded),
        "hallucinationRate": hallucination_rate,
        "status": "REVIEW" if ungrounded else "CLEAR",
        "threshold": threshold,
        "flaggedClaims": ungrounded[:8],
        "note": "Heuristic claim-to-tool-output overlap; review flagged claims against primary sources before treating them as established facts.",
    }
