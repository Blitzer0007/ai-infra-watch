# ============================================================
# ai-infra-watch backend — settings
# Central config. Every value can be overridden by an env var
# (see README "Configuration"). No secrets live in this file.
# ============================================================
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

# ---- repo layout ----------------------------------------------------
# settings.py lives at app/config/settings.py, so the repo root is three
# parents up. data/, tests/, .cache/ all live at the repo root (NOT under
# app/), so BASE_DIR must resolve there.
BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
DATA_DIR: Path = BASE_DIR / "data"
CACHE_DIR: Path = BASE_DIR / ".cache"
TRACES_DIR: Path = DATA_DIR / "traces"
GOLDEN_PATH: Path = DATA_DIR / "eval" / "golden.jsonl"
TICKERS_PATH: Path = DATA_DIR / "tickers.csv"
UNIVERSE_PATH: Path = DATA_DIR / "universe" / "ai_stocks.json"
FIXTURES_DIR: Path = BASE_DIR / "tests" / "fixtures"


# ---- runtime helpers -------------------------------------------------
def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    try:
        return float(raw) if raw is not None and raw.strip() else default
    except ValueError:
        return default


# ---- LLM provider ----------------------------------------------------
# LLM_PROVIDER=anthropic | openai | stub
#   anthropic -> uses ANTHROPIC_API_KEY (model default: claude-sonnet-4-5)
#   openai    -> uses OPENAI_API_KEY      (model default: gpt-4o-mini)
#   stub      -> no key needed; deterministic canned responses
# Run tests / CI with LLM_PROVIDER=stub (or CI_USE_STUB_LLM=true).
LLM_PROVIDER: str = _env_str("LLM_PROVIDER", "stub")
LLM_MODEL: str = _env_str("LLM_MODEL", "")  # per-provider default if unset

ANTHROPIC_API_KEY: str = _env_str("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY: str = _env_str("OPENAI_API_KEY", "")
ANTHROPIC_BASE_URL: str = _env_str("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
OPENAI_BASE_URL: str = _env_str("OPENAI_BASE_URL", "https://api.openai.com/v1")

DEFAULT_MAX_TOKENS: int = int(_env_str("EVAL_MAX_TOKENS", "1200"))
DEFAULT_TEMPERATURE: float = _env_float("EVAL_TEMPERATURE", 0.0)

# Cache LLM responses under .cache/<sha256>.json to avoid repeated
# LLM cost across test runs / CI. Disable with EVAL_CACHE_ENABLED=false.
CACHE_ENABLED: bool = _env_bool("EVAL_CACHE_ENABLED", True)

# Smallest allowable similarity (0..1) for assert_semantically_similar.
SEMANTIC_THRESHOLD: float = _env_float("EVAL_SEMANTIC_THRESHOLD", 0.7)

# Embedding model; only used when sentence-transformers is installed.
# Leave empty to use the deterministic lexical fallback.
EMBEDDING_MODEL: str = _env_str("EVAL_EMBEDDING_MODEL", "")

# If set to true, the LLM client never calls a real API — it returns
# stored fixture responses. For CI use `CI_USE_STUB_LLM=true` (alias).
STUB_MODE: bool = _env_bool("CI_USE_STUB_LLM", False) or _env_bool("EVAL_STUB", False)

# Backoff / retry for transient HTTP errors from LLM providers.
MAX_RETRIES: int = int(_env_str("EVAL_MAX_RETRIES", "1" if os.getenv("VERCEL") else "4"))
RETRY_BASE_DELAY_SEC: float = _env_float("EVAL_RETRY_BASE_DELAY", 1.0)

LLM_REQUEST_TIMEOUT_SEC: float = _env_float(
    "LLM_REQUEST_TIMEOUT_SEC", 12.0 if os.getenv("VERCEL") else 90.0
)
LLM_FINAL_TIMEOUT_SEC: float = _env_float(
    "LLM_FINAL_TIMEOUT_SEC", 20.0 if os.getenv("VERCEL") else 60.0
)
LLM_FINAL_MAX_TOKENS: int = int(_env_str("LLM_FINAL_MAX_TOKENS", "1000"))

# ---- Jev decision layer ----------------------------------------------
# Optional typed decision model used to route research before prose synthesis.
# Keep the key server-side only; never expose it to the React bundle.
JEV_ENABLED: bool = _env_bool("JEV_ENABLED", True)
JEV_API_KEY: str = _env_str("TYPESAFE_API_KEY", "")
JEV_MODEL: str = _env_str("JEV_MODEL", "jev-latest")
JEV_BASE_URL: str = _env_str("JEV_BASE_URL", "https://api.typesafe.ai")
JEV_TIMEOUT_SEC: float = _env_float(
    "JEV_TIMEOUT_SEC", 3.0 if os.getenv("VERCEL") else 8.0
)
JEV_ROUTE_THRESHOLD: float = _env_float("JEV_ROUTE_THRESHOLD", 0.75)

# ---- production API security / browser access -----------------------
# When set, /api/ask/autonomous requires Authorization: Bearer <token>.
# Leave empty for local development / hermetic CI.
AGENT_API_TOKEN: str = _env_str("AI_INFRA_AGENT_TOKEN", "")
CORS_ORIGINS: tuple[str, ...] = tuple(
    origin.strip()
    for origin in _env_str("CORS_ORIGINS", "*").split(",")
    if origin.strip()
)


# ---- eval / tracing --------------------------------------------------
# Trace every eval run (and every LLM call made by the app) to
# data/traces/<timestamp>.jsonl. Disable with EVAL_TRACE=false.
TRACE_ENABLED: bool = _env_bool("EVAL_TRACE", True)
EVAL_API_TOKEN: str = _env_str("EVAL_API_TOKEN", "")


@lru_cache(maxsize=1)
def get_settings() -> dict[str, object]:
    """Return the current settings snapshot. Cacheable because callers
    are process-level; env vars are read once at import time."""
    return {
        "provider": LLM_PROVIDER,
        "model": LLM_MODEL,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "temperature": DEFAULT_TEMPERATURE,
        "cache_enabled": CACHE_ENABLED,
        "semantic_threshold": SEMANTIC_THRESHOLD,
        "embedding_model": EMBEDDING_MODEL,
        "stub_mode": STUB_MODE,
        "trace_enabled": TRACE_ENABLED,
        "agent_auth_enabled": bool(AGENT_API_TOKEN),
        "cors_origins": list(CORS_ORIGINS),
        "golden_path": str(GOLDEN_PATH),
    }
