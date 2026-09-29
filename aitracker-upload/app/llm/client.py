"""LLM client: provider-agnostic generate() with caching + stub mode.

Behavior
--------
* provider  = settings.LLM_PROVIDER ("anthropic" | "openai" | "stub")
* cache     = sha256(provider + model + prompt) -> .cache/<hash>.json,
              unless EVAL_CACHE_ENABLED=false
* retry     = exponential backoff on transient HTTP errors (429/5xx),
              EVAL_MAX_RETRIES attempts
* stub      = no network at all; returns deterministic canned responses
              from tests/fixtures/llm/<provider>__<model>__<sha8>.json

The `.generate()` surface mirrors the LangChain Runnable API shape
(callable with optional stream flag) so this module can later be
replaced by ChatAnthropic/ChatOpenAI chains without touching callers.
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any

import httpx

from app.config import settings


class LLMConfigError(RuntimeError):
    """Raised when the selected provider is missing its API key."""


def _http_retryable(status: int) -> bool:
    return status in (408, 409, 429) or 500 <= status <= 599


class LLMClient:
    def __init__(
        self,
        provider: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        cache_dir: Path | None = None,
    ) -> None:
        self.provider = (provider or settings.LLM_PROVIDER).strip().lower()
        self.model = model or settings.LLM_MODEL or self._default_model(self.provider)
        self.api_key = api_key or self._resolve_key(self.provider)
        self.cache_dir = Path(cache_dir or settings.CACHE_DIR)
        self.stub = self.provider == "stub" or settings.STUB_MODE
        if self.stub:
            self.provider = "stub"
        self.max_retries = settings.MAX_RETRIES
        self.base_delay = settings.RETRY_BASE_DELAY_SEC

    # ---- config ----------------------------------------------------
    @staticmethod
    def _default_model(provider: str) -> str:
        return {
            "anthropic": "claude-sonnet-4-5",
            "openai": "gpt-4o-mini",
            "stub": "stub",
        }.get(provider, "stub")

    @staticmethod
    def _resolve_key(provider: str) -> str:
        key = {
            "anthropic": settings.ANTHROPIC_API_KEY,
            "openai": settings.OPENAI_API_KEY,
        }.get(provider, "")
        if provider in ("anthropic", "openai") and not key:
            raise LLMConfigError(
                f"LLM_PROVIDER={provider} but {provider.upper()}_API_KEY is not set. "
                f"Copy .env.example to .env and add your key, or set "
                f"LLM_PROVIDER=stub to run without a key."
            )
        return key

    def metadata(self) -> dict[str, str]:
        return {"provider": self.provider, "model": self.model}

    # ---- cache -----------------------------------------------------
    def _cache_key(self, prompt: str, max_tokens: int, temperature: float) -> str:
        raw = f"{self.provider}::{self.model}::{max_tokens}::{temperature}::{prompt}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _cache_path(self, cache_key: str) -> Path:
        return self.cache_dir / f"{cache_key}.json"

    def _cache_read(self, cache_key: str) -> str | None:
        if not settings.CACHE_ENABLED:
            return None
        try:
            data = json.loads(self._cache_path(cache_key).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        cached_text = data.get("text") if isinstance(data, dict) else None
        return cached_text if isinstance(cached_text, str) else None

    def _cache_write(self, cache_key: str, text: str, usage: dict[str, int]) -> None:
        if not settings.CACHE_ENABLED:
            return
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self._cache_path(cache_key).write_text(
                json.dumps({"text": text, "usage": usage}, ensure_ascii=False),
                encoding="utf-8",
            )
        except OSError:
            pass  # cache is a nicety; never fail a generation because of it

    # ---- public API -------------------------------------------------
    def generate(
        self,
        prompt: str,
        max_tokens: int | None = None,
        temperature: float | None = None,
        timeout_sec: float | None = None,
        max_retries: int | None = None,
    ) -> str:
        max_tokens = settings.DEFAULT_MAX_TOKENS if max_tokens is None else max_tokens
        temperature = settings.DEFAULT_TEMPERATURE if temperature is None else temperature
        key = self._cache_key(prompt, max_tokens, temperature)
        cached = self._cache_read(key)
        if cached is not None:
            return cached
        if self.stub:
            text, usage = self._generate_stub(prompt, max_tokens, temperature)
        else:
            text, usage = self._generate_remote(
                prompt,
                max_tokens,
                temperature,
                timeout_sec=timeout_sec,
                max_retries=max_retries,
            )
        self._cache_write(key, text, usage)
        return text

    def stream(self, prompt: str, **kwargs: Any):  # pragma: no cover - thin wrapper
        """Optional streaming API. Yields text chunks."""
        # MVP: stream() returns the whole generation in one chunk. A real
        # SSE-aware implementation (and a LangChain runnable port) is a
        # later milestone — see app/llm/README TODO.
        yield self.generate(prompt, **kwargs)

    # ---- stub path ---------------------------------------------------
    def _fixture_dir(self) -> Path:
        return Path(settings.FIXTURES_DIR) / "llm"

    def _generate_stub(self, prompt: str, max_tokens: int, temperature: float) -> tuple[str, dict[str, int]]:
        """Deterministic canned response keyed by prompt hash.

        Fixture files live in tests/fixtures/llm/<provider>__<model>__<sha8>.json
        and are committed so stub runs are fully offline.
        """
        key = self._cache_key(prompt, max_tokens, temperature)[:8]
        pattern = f"{self.provider}__{self.model}__{key}.json"
        try:
            data = json.loads((self._fixture_dir() / pattern).read_text(encoding="utf-8"))
        except OSError:
            raise RuntimeError(
                f"Stub mode: no fixture at tests/fixtures/llm/{pattern}. "
                f"Run once with a real provider to generate, or add the fixture manually."
            ) from None
        return data["text"], data.get("usage", {"prompt_tokens": 0, "completion_tokens": 0})

    # ---- real providers ---------------------------------------------
    def _generate_remote(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        timeout_sec: float | None = None,
        max_retries: int | None = None,
    ) -> tuple[str, dict[str, int]]:
        headers = {"content-type": "application/json"}
        if self.provider == "anthropic":
            url = f"{settings.ANTHROPIC_BASE_URL.rstrip('/')}/v1/messages"
            headers["x-api-key"] = self.api_key
            headers["anthropic-version"] = "2023-06-01"
            body: dict[str, Any] = {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
            text_path = ("content", 0, "text")
            usage_path = ("usage",)
        elif self.provider == "openai":
            url = f"{settings.OPENAI_BASE_URL.rstrip('/')}/chat/completions"
            headers["authorization"] = f"Bearer {self.api_key}"
            body = {
                "model": self.model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "messages": [{"role": "user", "content": prompt}],
            }
            text_path = ("choices", 0, "message", "content")
            usage_path = ("usage",)
        else:
            raise LLMConfigError(f"Unknown LLM_PROVIDER={self.provider!r}")

        request_timeout = timeout_sec if timeout_sec is not None else settings.LLM_REQUEST_TIMEOUT_SEC
        retries = self.max_retries if max_retries is None else max(0, int(max_retries))
        last_exc: Exception | None = None
        for attempt in range(retries + 1):
            try:
                with httpx.Client(timeout=request_timeout) as client:
                    resp = client.post(url, json=body, headers=headers)
                if resp.status_code >= 400:
                    if _http_retryable(resp.status_code) and attempt < retries:
                        delay = self.base_delay * (2 ** attempt)
                        time.sleep(delay)
                        last_exc = RuntimeError(f"HTTP {resp.status_code} (retryable): {resp.text[:200]}")
                        continue
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:300]}")
                data = resp.json()
                text = _dig(data, *text_path)
                if not text:
                    raise RuntimeError(f"Empty completion from {self.provider}: {data}")
                usage = _dig(data, *usage_path) or {}
                return text, dict(usage)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < retries:
                    delay = self.base_delay * (2 ** attempt)
                    time.sleep(delay)
                    continue
        raise RuntimeError(f"LLM request failed after {retries + 1} attempts: {last_exc}")


def _dig(mapping: dict, *path: Any) -> Any:
    cur: Any = mapping
    for part in path:
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        elif isinstance(cur, list) and isinstance(part, int) and part < len(cur):
            cur = cur[part]
        else:
            return None
    return cur


def estimate_tokens(text: str) -> int:
    """Rough token estimate (chars / 4). Good enough for trace cost lines."""
    return max(1, len(text) // 4)


def strip_json_fences(text: str) -> str:
    """Strip ```json ... ``` fences some models add around JSON."""
    text = text.strip()
    m = re.search(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
    return m.group(1).strip() if m else text
