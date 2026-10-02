"""Vercel-native endpoint for controlled Jev platform assessments."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parent.parent / "aitracker-upload"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.jev.assess import ASSESSMENTS, assess


app = FastAPI(title="AI Infra Watch Jev Assessment", version="1.0.0")


def _require_auth(authorization: str | None) -> None:
    import os
    expected = (os.getenv("AIW_ACCESS_TOKEN") or os.getenv("AGENT_API_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Private access is not configured")
    if not authorization or not authorization.startswith("Bearer ") or authorization[7:].strip() != expected:
        raise HTTPException(status_code=401, detail="Authentication required")


class JevAssessRequest(BaseModel):
    kind: str = Field(..., min_length=1, max_length=32)
    state: Any


@app.get("/api/jev-assess")
def health(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_auth(authorization)
    return {
        "status": "ok",
        "service": "jev-assessment",
        "enabled": settings.JEV_ENABLED,
        "api_key_configured": bool(settings.JEV_API_KEY),
        "model": settings.JEV_MODEL,
        "kinds": sorted(ASSESSMENTS),
    }


@app.post("/api/jev-assess")
def evaluate(req: JevAssessRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_auth(authorization)
    kind = req.kind.strip().lower()
    if kind not in ASSESSMENTS:
        raise HTTPException(
            status_code=400,
            detail={"error": "unknown assessment kind", "allowed": sorted(ASSESSMENTS)},
        )

    evaluation = assess(kind, req.state)
    if not evaluation.usable:
        status = 503 if settings.JEV_ENABLED and settings.JEV_API_KEY else 200
        return {
            "ok": False,
            "kind": kind,
            "enabled": settings.JEV_ENABLED,
            "model": evaluation.model or settings.JEV_MODEL,
            "latency_ms": evaluation.latency_ms,
            "input_tokens": evaluation.input_tokens,
            "answers": {},
            "error": evaluation.error or "Jev assessment unavailable",
            "fallback": True,
        }

    return {
        "ok": True,
        "kind": kind,
        "enabled": True,
        "model": evaluation.model,
        "latency_ms": round(evaluation.latency_ms, 1),
        "input_tokens": evaluation.input_tokens,
        "answers": {
            key: {
                "type": answer.type,
                "choice": answer.choice or None,
                "confidence": answer.confidence,
                "probabilities": answer.probabilities,
                "score": answer.score,
                "legend": answer.legend,
                "noul": answer.noul,
            }
            for key, answer in evaluation.answers.items()
        },
        "fallback": False,
    }
