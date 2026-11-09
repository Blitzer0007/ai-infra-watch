"""One-attempt, bounded NVIDIA development adapter. Constructed only by explicit opt-in."""
from __future__ import annotations
import json
import os
import re
import time
import math
import httpx


def development_enabled():
    return (os.getenv("COUNCIL_DEV_ENABLED") == "true" and not os.getenv("VERCEL")
            and os.getenv("NODE_ENV") != "production" and os.getenv("VERCEL_ENV") != "production")


class NvidiaCouncilModel:
    mode = "nvidia"

    def __init__(self, api_key, model, *, transport=None):
        if not development_enabled() or os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true":
            raise ValueError("Council live development is disabled")
        if not isinstance(api_key, str) or not api_key or not isinstance(model, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", model):
            raise ValueError("Council development model configuration is unavailable")
        self._key, self._model, self._transport = api_key, model, transport
        self.http_attempts = 0

    def complete(self, role, messages, *, timeout_seconds, max_output_tokens):
        if not development_enabled() or os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true" or role not in ("bull", "bear", "judge") or self.http_attempts >= 6:
            raise ValueError("Council live development is disabled")
        if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0 or type(max_output_tokens) is not int or max_output_tokens <= 0:
            raise ValueError("Invalid council request budget")
        payload = {"model": self._model, "messages": messages, "temperature": .2, "stream": False, "max_tokens": min(600, max_output_tokens)}
        if len(json.dumps(payload).encode()) > 32768:
            raise ValueError("Invalid council request size")
        deadline = time.monotonic() + min(6., timeout_seconds)
        self.http_attempts += 1
        try:
            with httpx.Client(timeout=min(6., timeout_seconds), follow_redirects=False, transport=self._transport) as client:
                with client.stream("POST", "https://integrate.api.nvidia.com/v1/chat/completions", headers={"Authorization": "Bearer " + self._key}, json=payload) as response:
                    if response.status_code != 200:
                        raise ValueError()
                    body = bytearray()
                    for chunk in response.iter_bytes():
                        if time.monotonic() > deadline or len(body) + len(chunk) > 32768:
                            raise ValueError()
                        body.extend(chunk)
            if time.monotonic() > deadline:
                raise ValueError()
            value = json.loads(body)
            content = value["choices"][0]["message"]["content"]
            if not isinstance(content, str) or len(content.encode()) > 8192:
                raise ValueError()
            return content
        except Exception:
            raise ValueError("Council model request unavailable") from None
