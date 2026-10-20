"""Strict validators for exported historical-data evidence.

These validators check structure and chronology; they do not authenticate a vendor.
A release PASS requires immutable/source-record identifiers and hashes for the evidence
that supports historical availability, not merely a current data endpoint or URL.
"""
from __future__ import annotations

from datetime import datetime
import hashlib
import math
from pathlib import Path, PurePosixPath
import re
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlparse


_PRICE_EVIDENCE_TYPES = {"provider_snapshot", "vendor_audit_record", "archived_vendor_release"}
_MEMBERSHIP_EVIDENCE_TYPES = {
    "effective_dated_constituent_file",
    "vendor_audit_record",
    "archived_constituent_release",
}
_SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")
_RESERVED_HOSTS = {"example.com", "www.example.com", "example.org", "example.net"}


def _timestamp(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"Missing timestamp: {field}")
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"Invalid timestamp: {field}") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError(f"Timestamp must include timezone: {field}")
    return parsed


def _https_url_error(value: Any, field: str) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return f"Missing {field}"
    parsed = urlparse(value.strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme.lower() != "https" or not host:
        return f"{field} must be an absolute HTTPS URL"
    if parsed.username or parsed.password:
        return f"{field} must not embed credentials"
    if host in _RESERVED_HOSTS or host.endswith((".invalid", ".example", ".test")):
        return f"{field} must not point to a reserved placeholder host"
    if any(key.lower() in {"api_key", "apikey", "token", "access_token", "secret", "password"} for key, _ in parse_qsl(parsed.query, keep_blank_values=True)):
        return f"{field} must not embed credentials in query parameters"
    return None


def _required_text(row: dict[str, Any], field: str, prefix: str, errors: list[str]) -> None:
    value = row.get(field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{prefix}: missing {field}")


def _require_sha256(row: dict[str, Any], field: str, prefix: str, errors: list[str]) -> None:
    value = row.get(field)
    if not isinstance(value, str) or not _SHA256_RE.fullmatch(value.strip()):
        errors.append(f"{prefix}: {field} must be a 64-character SHA-256 digest")


def _is_positive_finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
        and float(value) > 0
    )


def _verify_artifact(
    row: dict[str, Any],
    path_field: str,
    hash_field: str,
    prefix: str,
    errors: list[str],
    artifact_root: str | Path | None,
) -> None:
    """Resolve a safe relative artifact path and verify its exact SHA-256."""
    value = row.get(path_field)
    if not isinstance(value, str) or not value.strip():
        errors.append(f"{prefix}: missing {path_field}")
        return
    relative = PurePosixPath(value.strip())
    if relative.is_absolute() or ".." in relative.parts or "\\" in value or ":" in value:
        errors.append(f"{prefix}: {path_field} must be a safe relative path inside the evidence bundle")
        return
    expected = row.get(hash_field)
    if not isinstance(expected, str) or not _SHA256_RE.fullmatch(expected.strip()):
        # The field-format error is reported by _require_sha256 too.
        return
    if artifact_root is None:
        errors.append(f"{prefix}: artifact_root is required to verify {path_field}")
        return

    root = Path(artifact_root).resolve()
    target = (root / Path(*relative.parts)).resolve()
    if not target.is_relative_to(root):
        errors.append(f"{prefix}: {path_field} escapes the evidence bundle")
        return
    if not target.is_file():
        errors.append(f"{prefix}: evidence artifact file not found for {path_field}")
        return

    digest = hashlib.sha256()
    with target.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest().lower() != expected.strip().lower():
        errors.append(f"{prefix}: {hash_field} does not match the referenced evidence artifact")


def validate_price_evidence(rows: Iterable[dict[str, Any]], artifact_root: str | Path | None = None) -> dict[str, Any]:
    """Require price rows plus hashed, timestamped source evidence available by cutoff."""
    materialized = list(rows)
    if not materialized:
        return {"status": "BLOCKED", "checked": 0, "errors": ["No historical price evidence supplied."]}

    errors: list[str] = []
    for index, row in enumerate(materialized):
        prefix = f"row[{index}]"
        for field in ("symbol", "date", "source", "source_url", "source_record_id"):
            _required_text(row, field, prefix, errors)

        for field in ("source_url", "availability_evidence_url"):
            message = _https_url_error(row.get(field), field)
            if message:
                errors.append(f"{prefix}: {message}")

        if row.get("adjusted") is not True:
            errors.append(f"{prefix}: adjusted price semantics are not verified")

        prices = [row.get(field) for field in ("price", "close", "adjusted_close")]
        if not any(_is_positive_finite_number(value) for value in prices):
            errors.append(f"{prefix}: missing positive finite price value (price, close, or adjusted_close)")

        for field in ("availability_evidence_id", "availability_evidence_type"):
            _required_text(row, field, prefix, errors)
        _require_sha256(row, "availability_evidence_sha256", prefix, errors)
        _verify_artifact(row, "availability_evidence_artifact_path", "availability_evidence_sha256", prefix, errors, artifact_root)
        if row.get("availability_evidence_type") not in _PRICE_EVIDENCE_TYPES:
            errors.append(
                f"{prefix}: availability_evidence_type must identify a provider snapshot, "
                "vendor audit record, or archived vendor release"
            )

        try:
            available_at = _timestamp(row.get("available_at"), f"{prefix}.available_at")
            cutoff = _timestamp(row.get("decision_cutoff"), f"{prefix}.decision_cutoff")
            observation_at = _timestamp(row.get("date"), f"{prefix}.date")
            evidence_published_at = _timestamp(
                row.get("availability_evidence_published_at"),
                f"{prefix}.availability_evidence_published_at",
            )
            if available_at > cutoff:
                errors.append(f"{prefix}: observation was not available by the decision cutoff")
            if observation_at > cutoff:
                errors.append(f"{prefix}: observation timestamp is after the decision cutoff")
            if evidence_published_at > cutoff:
                errors.append(f"{prefix}: availability evidence was published after the decision cutoff")
            if evidence_published_at > available_at:
                errors.append(f"{prefix}: availability evidence was published after the claimed available_at time")
        except ValueError as exc:
            errors.append(str(exc))

    return {
        "status": "PASS" if not errors else "FAIL",
        "checked": len(materialized),
        "errors": errors,
    }


def validate_universe_membership(rows: Iterable[dict[str, Any]], artifact_root: str | Path | None = None) -> dict[str, Any]:
    """Require source-record and hashed evidence for effective-dated membership rows."""
    materialized = list(rows)
    if not materialized:
        return {"status": "BLOCKED", "checked": 0, "errors": ["No point-in-time universe membership supplied."]}

    errors: list[str] = []
    for index, row in enumerate(materialized):
        prefix = f"membership[{index}]"
        for field in ("symbol", "source", "source_url", "membership_record_id", "membership_evidence_id", "membership_evidence_type"):
            _required_text(row, field, prefix, errors)

        for field in ("source_url", "membership_evidence_url"):
            message = _https_url_error(row.get(field), field)
            if message:
                errors.append(f"{prefix}: {message}")

        _require_sha256(row, "membership_evidence_sha256", prefix, errors)
        _verify_artifact(row, "membership_evidence_artifact_path", "membership_evidence_sha256", prefix, errors, artifact_root)
        if row.get("membership_evidence_type") not in _MEMBERSHIP_EVIDENCE_TYPES:
            errors.append(
                f"{prefix}: membership_evidence_type must identify an effective-dated "
                "constituent file, vendor audit record, or archived constituent release"
            )
        if row.get("status") != "verified":
            errors.append(f"{prefix}: membership status is not verified")

        try:
            effective_from = _timestamp(row.get("effective_from"), f"{prefix}.effective_from")
            effective_to_raw = row.get("effective_to")
            effective_to = _timestamp(effective_to_raw, f"{prefix}.effective_to") if effective_to_raw else None
            as_of = _timestamp(row.get("as_of"), f"{prefix}.as_of")
            evidence_published_at = _timestamp(
                row.get("membership_evidence_published_at"),
                f"{prefix}.membership_evidence_published_at",
            )
            if effective_to and effective_to < effective_from:
                errors.append(f"{prefix}: effective_to precedes effective_from")
            if effective_from > as_of:
                errors.append(f"{prefix}: membership begins after the requested as-of date")
            if effective_to and as_of > effective_to:
                errors.append(f"{prefix}: membership had ended by the requested as-of date")
            if evidence_published_at > as_of:
                errors.append(f"{prefix}: membership evidence was published after the requested as-of date")
        except ValueError as exc:
            errors.append(str(exc))

    return {
        "status": "PASS" if not errors else "FAIL",
        "checked": len(materialized),
        "errors": errors,
    }
