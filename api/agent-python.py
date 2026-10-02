"""Vercel-native Python entrypoint for AI Infra Watch autonomous research.

This keeps the public frontend and autonomous MCP API on the same Vercel
deployment. The heavier application code remains under aitracker-upload/app.
"""
from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parent.parent / "aitracker-upload"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import settings
from app.mcp_client.manager import get_toolbox, toolbox_status
from app.agents.autonomous import AutonomousMCPAgent

app = FastAPI(
    title="AI Infra Watch Autonomous Agent",
    version="1.0.0",
)


def _require_auth(authorization: str | None) -> None:
    expected = settings.AGENT_API_TOKEN
    if not expected:
        return
    prefix = "Bearer "
    if not authorization or not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="missing bearer token")
    supplied = authorization[len(prefix):].strip()
    if not supplied or supplied != expected:
        raise HTTPException(status_code=403, detail="invalid bearer token")


class AutonomousRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Question to investigate with MCP tools")


def _shape(result: Any) -> dict[str, Any]:
    return {
        "mode": "autonomous-mcp",
        "question": result.question,
        "ok": result.ok(),
        "degraded": result.degraded(),
        "summary": result.summary,
        "answer_source": result.answer_source,
        "jev": result.jev,
        "hallucination": result.hallucination,
        "debate": result.debate,
        "error": result.error,
        "resolution": result.resolution,
        "discovered": result.discovered,
        "calls": [
            {
                "tool": call.tool,
                "arguments": call.arguments,
                "ok": call.ok,
                "output": call.output if call.ok else None,
                "error": call.error,
            }
            for call in result.calls
        ],
        "trajectory": [
            {
                "node": step.node,
                "kind": step.kind,
                "tool": step.tool,
                "args": step.args,
                "ok": step.ok,
                "note": step.note,
                "duration_ms": step.duration_ms,
            }
            for step in result.trajectory.steps
        ],
    }


@app.get("/api/agent-python")
def health(
    authorization: str | None = Header(default=None),
    probe_mcp: bool = Query(default=False),
) -> dict[str, Any]:
    _require_auth(authorization)
    config = settings.get_settings()
    probe_error = None
    if probe_mcp:
        try:
            get_toolbox()
        except Exception as exc:  # noqa: BLE001 — expose structured readiness diagnostics
            probe_error = f"{type(exc).__name__}: {exc}"
    mcp = toolbox_status()
    return {
        "status": "ok" if not probe_error else "degraded",
        "service": "autonomous-mcp",
        "provider": config["provider"],
        "model": config["model"],
        "api_key_configured": bool(
            settings.ANTHROPIC_API_KEY or settings.OPENAI_API_KEY
        ),
        "jev_enabled": settings.JEV_ENABLED,
        "jev_api_key_configured": bool(settings.JEV_API_KEY),
        "mcp": mcp,
        "mcp_probe": probe_mcp,
        "mcp_ready": bool(mcp.get("connected")) if probe_mcp else None,
        "mcp_probe_error": probe_error,
    }


@app.post("/api/agent-python")
def autonomous(
    req: AutonomousRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _require_auth(authorization)

    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=422, detail="question must not be empty")

    try:
        max_steps = int(os.getenv("AUTONOMOUS_MAX_STEPS", "4" if os.getenv("VERCEL") else "6"))
        result = AutonomousMCPAgent(get_toolbox(), max_steps=max_steps).run(question)
    except Exception as exc:  # noqa: BLE001 — return structured agent failures
        print(traceback.format_exc(), flush=True)
        raise HTTPException(
            status_code=422,
            detail=f"autonomous ask failed: {type(exc).__name__}: {exc}",
        ) from exc

    return _shape(result)
