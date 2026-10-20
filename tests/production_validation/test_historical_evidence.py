import hashlib
from pathlib import Path

from .historical_evidence import (
    validate_price_evidence,
    validate_universe_membership,
)


def _write_evidence(artifact_root: Path, relative_path: str, content: bytes) -> str:
    artifact = artifact_root / relative_path
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_bytes(content)
    return hashlib.sha256(content).hexdigest()


def price_row(artifact_root: Path, **overrides):
    artifact_path = "artifacts/price-snapshot.json"
    artifact_hash = _write_evidence(
        artifact_root,
        artifact_path,
        b'{"snapshot":"fixture-price-snapshot","source_record":"MSFT:2025-01-02"}',
    )
    row = {
        "symbol": "MSFT",
        "date": "2025-01-02T21:00:00Z",
        "close": 410.0,
        "adjusted_close": 410.0,
        "adjusted": True,
        "available_at": "2025-01-02T21:05:00Z",
        "decision_cutoff": "2025-01-03T14:00:00Z",
        "source": "SHARADAR/SEP",
        "source_url": "https://data.nasdaq.com/api/v3/datatables/SHARADAR/SEP",
        "source_record_id": "SHARADAR/SEP:MSFT:2025-01-02",
        "availability_evidence_id": "fixture-release-2025-01-02",
        "availability_evidence_type": "provider_snapshot",
        "availability_evidence_url": "https://data.nasdaq.com/databases/SEP/documentation?anchor=sample-data",
        "availability_evidence_published_at": "2025-01-02T21:04:00Z",
        "availability_evidence_artifact_path": artifact_path,
        "availability_evidence_sha256": artifact_hash,
    }
    return {**row, **overrides}


def membership_row(artifact_root: Path, **overrides):
    artifact_path = "artifacts/sp500-membership-snapshot.csv"
    artifact_hash = _write_evidence(
        artifact_root,
        artifact_path,
        b"symbol,effective_from,effective_to\nMSFT,2020-01-01,\n",
    )
    row = {
        "symbol": "MSFT",
        "status": "verified",
        "effective_from": "2020-01-01T00:00:00Z",
        "effective_to": None,
        "as_of": "2025-01-02T00:00:00Z",
        "source": "SHARADAR/SP500",
        "source_url": "https://sharadar.com/docs/sp500",
        "membership_record_id": "SHARADAR/SP500:MSFT:2020-01-01",
        "membership_evidence_id": "fixture-sp500-snapshot-2020",
        "membership_evidence_type": "effective_dated_constituent_file",
        "membership_evidence_url": "https://sharadar.com/docs/sp500",
        "membership_evidence_published_at": "2020-01-01T00:00:00Z",
        "membership_evidence_artifact_path": artifact_path,
        "membership_evidence_sha256": artifact_hash,
    }
    return {**row, **overrides}


def test_price_evidence_passes_with_cutoff_and_verified_artifact(tmp_path):
    result = validate_price_evidence([price_row(tmp_path)], artifact_root=tmp_path)
    assert result["status"] == "PASS"
    assert result["checked"] == 1


def test_price_evidence_fails_when_price_was_available_after_cutoff(tmp_path):
    row = price_row(tmp_path, available_at="2025-01-04T00:00:00Z")
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("not available by the decision cutoff" in e for e in result["errors"])


def test_price_evidence_fails_when_availability_artifact_was_published_after_cutoff(tmp_path):
    row = price_row(tmp_path, availability_evidence_published_at="2025-01-04T00:00:00Z")
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("availability evidence was published after the decision cutoff" in e for e in result["errors"])


def test_price_evidence_rejects_publication_after_claimed_availability(tmp_path):
    row = price_row(
        tmp_path,
        availability_evidence_published_at="2025-01-02T21:06:00Z",
        available_at="2025-01-02T21:05:00Z",
    )
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("published after the claimed available_at time" in e for e in result["errors"])


def test_price_evidence_rejects_missing_evidence_record_id_and_hash(tmp_path):
    row = price_row(tmp_path, availability_evidence_id="", availability_evidence_sha256="")
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("missing availability_evidence_id" in e for e in result["errors"])
    assert any("availability_evidence_sha256 must be a 64-character SHA-256 digest" in e for e in result["errors"])


def test_price_evidence_rejects_missing_artifact(tmp_path):
    row = price_row(tmp_path, availability_evidence_artifact_path="artifacts/missing.json")
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("evidence artifact file not found" in e for e in result["errors"])


def test_price_evidence_rejects_hash_mismatch(tmp_path):
    row = price_row(tmp_path, availability_evidence_sha256="f" * 64)
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("does not match the referenced evidence artifact" in e for e in result["errors"])


def test_price_evidence_requires_artifact_root(tmp_path):
    row = price_row(tmp_path)
    result = validate_price_evidence([row])
    assert result["status"] == "FAIL"
    assert any("artifact_root is required to verify" in e for e in result["errors"])


def test_price_evidence_rejects_artifact_path_traversal(tmp_path):
    row = price_row(tmp_path, availability_evidence_artifact_path="../outside.json")
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("safe relative path" in e for e in result["errors"])


def test_price_evidence_rejects_placeholder_and_insecure_urls(tmp_path):
    row = price_row(tmp_path, source_url="http://example.invalid/data")
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("absolute HTTPS URL" in e or "reserved placeholder host" in e for e in result["errors"])


def test_price_evidence_rejects_embedded_api_credentials(tmp_path):
    row = price_row(
        tmp_path,
        availability_evidence_url="https://data.nasdaq.com/record?id=123&api_key=do-not-store",
    )
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("must not embed credentials in query parameters" in e for e in result["errors"])


def test_price_evidence_rejects_non_positive_or_missing_prices(tmp_path):
    row = price_row(tmp_path, close=-1, adjusted_close=None)
    result = validate_price_evidence([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("missing positive finite price value" in e for e in result["errors"])


def test_price_evidence_fails_for_unadjusted_prices(tmp_path):
    assert validate_price_evidence([price_row(tmp_path, adjusted=False)], artifact_root=tmp_path)["status"] == "FAIL"


def test_price_evidence_blocks_empty_input():
    assert validate_price_evidence([])["status"] == "BLOCKED"


def test_universe_membership_passes_with_effective_dates_and_verified_artifact(tmp_path):
    result = validate_universe_membership([membership_row(tmp_path)], artifact_root=tmp_path)
    assert result["status"] == "PASS"
    assert result["checked"] == 1


def test_universe_membership_rejects_unknown_membership(tmp_path):
    row = membership_row(tmp_path, status="unknown")
    result = validate_universe_membership([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("membership status is not verified" in e for e in result["errors"])


def test_universe_membership_rejects_symbol_not_yet_in_universe(tmp_path):
    row = membership_row(tmp_path, effective_from="2026-01-01T00:00:00Z")
    result = validate_universe_membership([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("membership begins after the requested as-of date" in e for e in result["errors"])


def test_universe_membership_rejects_missing_record_identifier_or_hash(tmp_path):
    row = membership_row(tmp_path, membership_record_id="", membership_evidence_sha256="no-hash")
    result = validate_universe_membership([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("missing membership_record_id" in e for e in result["errors"])
    assert any("membership_evidence_sha256 must be a 64-character SHA-256 digest" in e for e in result["errors"])


def test_universe_membership_rejects_evidence_published_after_as_of_date(tmp_path):
    row = membership_row(tmp_path, membership_evidence_published_at="2025-01-03T00:00:00Z")
    result = validate_universe_membership([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("membership evidence was published after the requested as-of date" in e for e in result["errors"])


def test_universe_membership_rejects_reversed_effective_interval(tmp_path):
    row = membership_row(
        tmp_path,
        effective_from="2021-01-01T00:00:00Z",
        effective_to="2020-01-01T00:00:00Z",
    )
    result = validate_universe_membership([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("effective_to precedes effective_from" in e for e in result["errors"])


def test_universe_membership_rejects_missing_artifact_or_bad_hash(tmp_path):
    row = membership_row(tmp_path, membership_evidence_sha256="0" * 64)
    result = validate_universe_membership([row], artifact_root=tmp_path)
    assert result["status"] == "FAIL"
    assert any("does not match the referenced evidence artifact" in e for e in result["errors"])


def test_universe_membership_blocks_empty_input():
    assert validate_universe_membership([])["status"] == "BLOCKED"
