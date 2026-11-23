"""Fixed-endpoint development adapters; no retries or production activation."""
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


# Candidate profile from official NVIDIA API documentation on 2026-11-22.
# This establishes configured diversity, not availability, quality or free quota.
NVIDIA_FIRST_MODELS = {"bull": "openai/gpt-oss-20b", "bear": "qwen/qwen3-next-80b-a3b-instruct", "judge": "meta/llama-3.3-70b-instruct"}


class BoundedCouncilModel:
    endpoint = ""
    provider = ""
    mode = "unconfigured"

    def valid_model(self, model):
        return isinstance(model, str) and bool(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", model))

    def __init__(self, api_key, model, *, transport=None):
        if not development_enabled() or os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true":
            raise ValueError("Council live development is disabled")
        if not isinstance(api_key, str) or not api_key or not self.valid_model(model):
            raise ValueError("Council development model configuration is unavailable")
        self._key, self._model, self._transport = api_key, model, transport
        self.http_attempts = 0
        self.receipts = []

    def extra_payload(self):
        return {}

    def complete(self, role, messages, *, timeout_seconds, max_output_tokens):
        if not development_enabled() or os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true" or role not in ("bull", "bear", "judge") or self.http_attempts >= 6:
            raise ValueError("Council live development is disabled")
        if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0 or type(max_output_tokens) is not int or max_output_tokens <= 0:
            raise ValueError("Invalid council request budget")
        payload = {"model": self._model, "messages": messages, "temperature": .2, "stream": False, "max_tokens": min(600, max_output_tokens), **self.extra_payload()}
        if len(json.dumps(payload).encode()) > 32768:
            raise ValueError("Invalid council request size")
        deadline = time.monotonic() + min(6., timeout_seconds)
        self.http_attempts += 1
        started = time.monotonic()
        receipt = {"role": role, "provider": self.provider, "requested_model": self._model, "returned_model": None,
                   "status": "unavailable", "latency_ms": None, "input_tokens": None, "output_tokens": None, "reported_cost_usd": None}
        try:
            with httpx.Client(timeout=min(6., timeout_seconds), follow_redirects=False, transport=self._transport) as client:
                with client.stream("POST", self.endpoint, headers={"Authorization": "Bearer " + self._key}, json=payload) as response:
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
            returned = value.get("model")
            if self.provider == "openrouter-free" and returned not in (self._model, self._model.removesuffix(":free")):
                raise ValueError()
            if self.provider == "nvidia" and returned is not None and returned != self._model:
                raise ValueError()
            receipt["returned_model"] = returned if isinstance(returned, str) and re.fullmatch(r"[A-Za-z0-9_.:/-]{1,160}", returned) else None
            usage = value.get("usage") if isinstance(value.get("usage"), dict) else {}
            for source, target in (("prompt_tokens", "input_tokens"), ("completion_tokens", "output_tokens")):
                if type(usage.get(source)) is int and 0 <= usage[source] <= 1000000:
                    receipt[target] = usage[source]
            cost = usage.get("cost")
            if type(cost) in (int, float) and math.isfinite(cost) and cost >= 0:
                receipt["reported_cost_usd"] = cost
            if self.provider == "openrouter-free" and receipt["reported_cost_usd"] not in (None, 0):
                raise ValueError()
            content = value["choices"][0]["message"]["content"]
            if not isinstance(content, str) or len(content.encode()) > 8192:
                raise ValueError()
            receipt["status"] = "response-received"
            return content
        except Exception:
            raise ValueError("Council model request unavailable") from None
        finally:
            receipt["latency_ms"] = max(0, round((time.monotonic() - started) * 1000))
            self.receipts.append(receipt)


class NvidiaCouncilModel(BoundedCouncilModel):
    mode = provider = "nvidia"
    endpoint = "https://integrate.api.nvidia.com/v1/chat/completions"


class OpenRouterFreeCouncilModel(BoundedCouncilModel):
    mode = provider = "openrouter-free"
    endpoint = "https://openrouter.ai/api/v1/chat/completions"

    def valid_model(self, model):
        return isinstance(model, str) and bool(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+:free", model))

    def extra_payload(self):
        return {"provider": {"allow_fallbacks": False, "data_collection": "deny", "max_price": {"prompt": 0, "completion": 0, "request": 0}}}


class RoleRoutedCouncilModel:
    mode = "multi-model"

    def __init__(self, routes):
        if not development_enabled() or os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true" or set(routes) != {"bull", "bear", "judge"}:
            raise ValueError("Council role configuration unavailable")
        if any(type(model) not in (NvidiaCouncilModel, OpenRouterFreeCouncilModel) for model in routes.values()):
            raise ValueError("Council role configuration unavailable")
        if len({model._model.removesuffix(":free") for model in routes.values()}) != 3:
            raise ValueError("Three distinct explicit council models are required")
        self._routes = dict(routes)
        self._calls = {role: 0 for role in routes}

    @property
    def http_attempts(self):
        return sum(model.http_attempts for model in self._routes.values())

    @property
    def receipts(self):
        return [dict(receipt) for model in self._routes.values() for receipt in model.receipts]

    @property
    def manifest(self):
        return {role: {"provider": model.provider, "model": model._model} for role, model in self._routes.items()}

    def complete(self, role, messages, **budget):
        if not development_enabled() or os.getenv("COUNCIL_LIVE_DEV_ENABLED") != "true" or role not in self._routes or self._calls[role] >= 2 or self.http_attempts >= 6:
            raise ValueError("Council role budget unavailable")
        self._calls[role] += 1
        return self._routes[role].complete(role, messages, **budget)


def configured_role_model(environ=None):
    env = os.environ if environ is None else environ
    if not development_enabled() or env.get("COUNCIL_LIVE_DEV_ENABLED") != "true" or env.get("COUNCIL_MULTI_MODEL_DEV_ENABLED") != "true":
        return None
    routes = {}
    profile = env.get("COUNCIL_MODEL_PROFILE", "")
    if profile not in ("", "nvidia-first-v1"):
        return None
    if profile and any(env.get("COUNCIL_" + role.upper() + suffix) for role in ("bull", "bear", "judge") for suffix in ("_PROVIDER", "_MODEL")):
        return None
    try:
        for role in ("bull", "bear", "judge"):
            provider, model = ("nvidia", NVIDIA_FIRST_MODELS[role]) if profile else (env.get("COUNCIL_" + role.upper() + "_PROVIDER"), env.get("COUNCIL_" + role.upper() + "_MODEL"))
            if provider == "nvidia":
                routes[role] = NvidiaCouncilModel(env.get("COUNCIL_NVIDIA_API_KEY"), model)
            elif provider == "openrouter-free":
                routes[role] = OpenRouterFreeCouncilModel(env.get("COUNCIL_OPENROUTER_API_KEY"), model)
            else:
                return None
        return RoleRoutedCouncilModel(routes)
    except ValueError:
        return None
