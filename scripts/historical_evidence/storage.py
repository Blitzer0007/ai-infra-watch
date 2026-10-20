"""Small server-side helpers for the private Supabase evidence archive."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any

BUCKET = "aiw-private-historical-evidence"
MAX_METADATA_BYTES = 64 * 1024


class ArchiveError(RuntimeError):
    """Raised when private evidence cannot be persisted safely."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _config() -> tuple[str, str]:
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not base.startswith("https://") or not service_key:
        raise ArchiveError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    return base, service_key


def _request(url: str, key: str, *, method: str, body: bytes | None,
             content_type: str, extra_headers: dict[str, str] | None = None,
             timeout: int = 60) -> tuple[int, bytes]:
    headers = {
        "apikey": key,
        "Authorization": "Bearer " + key,
        "Content-Type": content_type,
        "User-Agent": "AI-Infra-Watch-private-evidence-archive/1.0",
    }
    headers.update(extra_headers or {})
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(4096)
        # Never include service credentials, signed URLs, or arbitrary response payloads in logs.
        if exc.code == 409:
            return exc.code, body_bytes
        raise ArchiveError(f"Supabase archive request failed with HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ArchiveError(f"Supabase archive request failed ({type(exc).__name__})") from None


def upload_object(object_path: str, content: bytes, content_type: str) -> bool:
    """Upload object under a deterministic content-addressed path; return False if already stored."""
    if not content:
        raise ArchiveError("Refusing to archive an empty artifact")
    if len(content) > 50 * 1024 * 1024:
        raise ArchiveError("Artifact exceeds the private bucket's 50 MiB per-object limit")
    parts = object_path.split("/")
    if object_path.startswith("/") or any(part in {"", ".", ".."} for part in parts):
        raise ArchiveError("Unsafe archive object path")
    base, key = _config()
    quoted_path = urllib.parse.quote(object_path, safe="/")
    url = f"{base}/storage/v1/object/{BUCKET}/{quoted_path}"
    try:
        status, _ = _request(
            url, key, method="POST", body=content, content_type=content_type,
            extra_headers={"x-upsert": "false", "cache-control": "no-store"},
        )
    except ArchiveError:
        raise
    if status == 409:
        # The SHA-256 is part of the object name, so a collision means the exact
        # content-addressed artifact has already been archived.
        return False
    return 200 <= status < 300


def upsert_metadata(metadata: dict[str, Any]) -> None:
    """Upsert a small, non-sensitive index row for a privately archived object."""
    base, key = _config()
    body = json.dumps(metadata, separators=(",", ":"), sort_keys=True).encode("utf-8")
    if len(body) > MAX_METADATA_BYTES:
        raise ArchiveError("Archive metadata exceeds safety limit")
    url = (
        f"{base}/rest/v1/historical_data_artifacts"
        "?on_conflict=provider%2Csha256"
    )
    status, _ = _request(
        url, key, method="POST", body=body, content_type="application/json",
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    if not 200 <= status < 300:
        raise ArchiveError(f"Supabase metadata write failed with HTTP {status}")
