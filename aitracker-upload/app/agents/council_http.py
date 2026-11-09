"""Private manual development route, isolated from the general planner and senders."""
from __future__ import annotations
import json
import os
from threading import BoundedSemaphore
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from app.agents.portfolio_council import PortfolioCouncil, FictionalCouncilModel, fictional_packet, parse_packet, decode, MAX_INPUT_BYTES
from app.agents.council_model import development_enabled

_slot = BoundedSemaphore(1)


def loaded_model():
    if os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true":
        return None
    from app.config import settings
    from app.agents.council_model import NvidiaCouncilModel
    # Reuse existing server-only provider configuration, never caller-selected hosts/models.
    if settings.OPENAI_BASE_URL.rstrip("/") != "https://integrate.api.nvidia.com/v1":
        return None
    try:
        return NvidiaCouncilModel(settings.OPENAI_API_KEY, os.getenv("COUNCIL_MODEL") or settings.LLM_MODEL)
    except ValueError:
        return None


async def council_http(request, require_auth, configured_token):
    require_auth(request.headers.get("authorization"))
    if not development_enabled():
        raise HTTPException(status_code=404, detail="Council development unavailable")
    if not configured_token:
        raise HTTPException(status_code=503, detail="Private access is not configured")
    if request.method != "POST":
        raise HTTPException(status_code=405, detail="POST required")
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(status_code=415, detail="JSON required")
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="Request too large")
        body.extend(chunk)
    try:
        value = decode(bytes(body))
        if not isinstance(value, dict):
            raise ValueError()
        if value.get("mode") == "jev" and set(value) == {"mode", "run_id", "state"}:
            from app.jev.council import valid_summary, assess_council_summary
            import re
            if not isinstance(value["run_id"], str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", value["run_id"]) or not valid_summary(value["state"]):
                raise ValueError()
            if not _slot.acquire(blocking=False):
                raise HTTPException(status_code=429, detail="Council is busy")
            try:
                result = await run_in_threadpool(assess_council_summary, value["state"], value["run_id"])
                return JSONResponse(result, headers={"Cache-Control": "no-store"})
            finally:
                _slot.release()
        if value.get("mode") == "demo" and set(value) == {"mode", "run_id", "assessed_at"}:
            packet = fictional_packet(value["run_id"], value["assessed_at"])
            model = FictionalCouncilModel()
        elif value.get("mode") == "loaded" and set(value) == {"mode", "packet"}:
            packet = parse_packet(json.dumps(value["packet"], allow_nan=False).encode())
            model = loaded_model()
            if model is None:
                raise HTTPException(status_code=503, detail="Council development model is not configured")
        else:
            raise ValueError()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid council request") from None
    if not _slot.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Council is busy")
    try:
        result = await run_in_threadpool(PortfolioCouncil(model).run, packet)
        return JSONResponse(result, headers={"Cache-Control": "no-store"})
    finally:
        _slot.release()
