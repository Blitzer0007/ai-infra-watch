"""Built-in MCP server configurations for stocks, filings, notifications.

Every server is launched as a stdio subprocess (the MCP default) with a
mode-selected env var. Each `ServerConfig` carries a `name` used for tool
namespacing ("stocks.get_quote" vs "filings.answer_question") and a `cwd`
pointed at the repo root so `python -m mcp_servers.X.server` resolves.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from app.config import settings
from app.mcp_client.client import ServerConfig

REPO_ROOT: Path = settings.BASE_DIR


def _mode_env(server_name: str, mode_default: str) -> dict[str, str]:
    """Read `{SERVER}_MODE` (e.g. STOCKS_MODE) from env; fall back to default."""
    key = f"{server_name.upper()}_MODE"
    return {key: os.getenv(key, mode_default)}


def stocks_config(command: str | None = None, mode: str | None = None) -> ServerConfig:
    """ServerConfig for mcp-server-stocks (quotes + watchlist)."""
    return ServerConfig(
        name="stocks",
        command=command or sys.executable,
        args=["-m", "mcp_servers.stocks.server"],
        env=_mode_env("stocks", mode or "fixture"),
        cwd=str(REPO_ROOT),
    )


def filings_config(command: str | None = None, mode: str | None = None) -> ServerConfig:
    """ServerConfig for mcp-server-filings (RAG over SEC filings)."""
    return ServerConfig(
        name="filings",
        command=command or sys.executable,
        args=["-m", "mcp_servers.filings.server"],
        env=_mode_env("filings", mode or "fixture"),
        cwd=str(REPO_ROOT),
    )


def notifications_config(command: str | None = None, mode: str | None = None) -> ServerConfig:
    """ServerConfig for mcp-server-notifications (alerts / channels)."""
    return ServerConfig(
        name="notifications",
        command=command or sys.executable,
        args=["-m", "mcp_servers.notifications.server"],
        env=_mode_env("notify", mode or "fixture"),
        cwd=str(REPO_ROOT),
    )


def news_config(command: str | None = None, mode: str | None = None) -> ServerConfig:
    """ServerConfig for mcp-server-news (Finnhub company + market news)."""
    return ServerConfig(
        name="news",
        command=command or sys.executable,
        args=["-m", "mcp_servers.news.server"],
        env=_mode_env("news", mode or "live"),
        cwd=str(REPO_ROOT),
    )


def default_configs(
    stocks_mode: str | None = None,
    filings_mode: str | None = None,
    notify_mode: str | None = None,
    news_mode: str | None = None,
) -> list[ServerConfig]:
    """The standard 3-server pool: stocks + filings + notifications.

    Each mode is independently overridable. When `USE_MCP=1` is set in the
    environment and a per-server *_MODE is not, the default is "fixture"
    so the hermetic path stays the default (zero network, zero keys).
    """
    return [
        stocks_config(mode=stocks_mode),
        filings_config(mode=filings_mode),
        notifications_config(mode=notify_mode),
        news_config(mode=news_mode),
    ]


def research_configs() -> list[ServerConfig]:
    """Lean MCP pool for autonomous research requests.

    On Vercel, research must use live market/SEC providers by default so
    arbitrary ticker questions do not silently fall back to fixtures. Local
    development/tests remain hermetic unless live mode is explicitly enabled.
    Set AI_INFRA_AGENT_LIVE_DATA=0 to force fixtures, or 1 to force live.
    """
    live_default = "1" if os.getenv("VERCEL") else "0"
    live_enabled = os.getenv("AI_INFRA_AGENT_LIVE_DATA", live_default).strip().lower() in {"1", "true", "yes", "on"}
    mode = "live" if live_enabled else "fixture"
    return [
        stocks_config(mode=mode),
        filings_config(mode=mode),
        news_config(mode="live"),
    ]

def live_configs() -> list[ServerConfig]:
    """Convenience: live data everywhere (Finnhub + EDGAR + webhooks + news)."""
    return default_configs(stocks_mode="live", filings_mode="live", notify_mode="live", news_mode="live")


__all__ = [
    "ServerConfig",
    "stocks_config",
    "filings_config",
    "notifications_config",
    "news_config",
    "default_configs",
    "research_configs",
    "live_configs",
]
