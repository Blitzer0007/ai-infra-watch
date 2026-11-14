"""Explicit targets and opt-in for QA network access outside loopback."""
from __future__ import annotations

import ipaddress
import os
from urllib.parse import urlsplit


def is_loopback_url(url: str) -> bool:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https", "ws", "wss"}:
        return False
    host = parsed.hostname or ""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def require_safe_target(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("QA target must be an HTTP(S) URL without embedded credentials")
    if not is_loopback_url(url) and os.getenv("QA_ALLOW_LIVE") != "true":
        raise ValueError("External QA targets require explicit QA_ALLOW_LIVE=true approval")
    return url.rstrip("/")


def qa_base_url() -> str:
    url = os.getenv("QA_BASE_URL", "").strip()
    if not url:
        raise ValueError("QA_BASE_URL is required; there is no production default")
    return require_safe_target(url)


def guard_request(request) -> None:
    # HTTPX invokes this hook for redirects too, before sending the request.
    require_safe_target(str(request.url))
