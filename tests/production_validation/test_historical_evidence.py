from .historical_evidence import (
    validate_price_evidence,
    validate_universe_membership,
)


def price_row(**overrides):
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
        "availability_evidence_sha256": "a" * 64,
    }
    return {**row, **overrides}


def membership_row(**overrides):
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
        "membership_evidence_sha256": "b" * 64,
    }
    return {**row, **overrides}


def test_price_evidence_passes_with_cutoff_and_hashed_source_record():
    result = validate_price_evidence([price_row()])
    assert result["status"] == "PASS"
    assert result["checked"] == 1


def test_price_evidence_fails_when_price_was_available_after_cutoff():
    result = validate_price_evidence([price_row(available_at="2025-01-04T00:00:00Z")])
    assert result["status"] == "FAIL"
    assert any("not available by the decision cutoff" in e for e in result["errors"])


def test_price_evidence_fails_when_availability_artifact_was_published_after_cutoff():
    result = validate_price_evidence([
        price_row(availability_evidence_published_at="2025-01-04T00:00:00Z")
    ])
    assert result["status"] == "FAIL"
    assert any("availability evidence was published after the decision cutoff" in e for e in result["errors"])


def test_price_evidence_rejects_missing_evidence_record_id_and_hash():
    result = validate_price_evidence([
        price_row(availability_evidence_id="", availability_evidence_sha256="")
    ])
    assert result["status"] == "FAIL"
    assert any("missing availability_evidence_id" in e for e in result["errors"])
    assert any("availability_evidence_sha256 must be a 64-character SHA-256 digest" in e for e in result["errors"])


def test_price_evidence_rejects_placeholder_and_insecure_urls():
    result = validate_price_evidence([
        price_row(source_url="http://example.invalid/data")
    ])
    assert result["status"] == "FAIL"
    assert any("source_url must be an absolute HTTPS URL" in e or "reserved placeholder host" in e for e in result["errors"])


def test_price_evidence_rejects_embedded_api_credentials():
    result = validate_price_evidence([
        price_row(availability_evidence_url="https://data.nasdaq.com/record?id=123&api_key=do-not-store")
    ])
    assert result["status"] == "FAIL"
    assert any("must not embed credentials in query parameters" in e for e in result["errors"])


def test_price_evidence_rejects_non_positive_or_missing_prices():
    result = validate_price_evidence([price_row(close=-1, adjusted_close=None)])
    assert result["status"] == "FAIL"
    assert any("missing positive finite price value" in e for e in result["errors"])


def test_price_evidence_fails_for_unadjusted_prices():
    assert validate_price_evidence([price_row(adjusted=False)])["status"] == "FAIL"


def test_price_evidence_blocks_empty_input():
    assert validate_price_evidence([])["status"] == "BLOCKED"


def test_universe_membership_passes_with_effective_dates_and_hashed_evidence():
    result = validate_universe_membership([membership_row()])
    assert result["status"] == "PASS"
    assert result["checked"] == 1


def test_universe_membership_rejects_unknown_membership():
    result = validate_universe_membership([membership_row(status="unknown")])
    assert result["status"] == "FAIL"
    assert any("membership status is not verified" in e for e in result["errors"])


def test_universe_membership_rejects_symbol_not_yet_in_universe():
    result = validate_universe_membership([
        membership_row(effective_from="2026-01-01T00:00:00Z")
    ])
    assert result["status"] == "FAIL"
    assert any("membership begins after the requested as-of date" in e for e in result["errors"])


def test_universe_membership_rejects_missing_record_identifier_or_hash():
    result = validate_universe_membership([
        membership_row(membership_record_id="", membership_evidence_sha256="no-hash")
    ])
    assert result["status"] == "FAIL"
    assert any("missing membership_record_id" in e for e in result["errors"])
    assert any("membership_evidence_sha256 must be a 64-character SHA-256 digest" in e for e in result["errors"])


def test_universe_membership_rejects_evidence_published_after_as_of_date():
    result = validate_universe_membership([
        membership_row(membership_evidence_published_at="2025-01-03T00:00:00Z")
    ])
    assert result["status"] == "FAIL"
    assert any("membership evidence was published after the requested as-of date" in e for e in result["errors"])


def test_universe_membership_rejects_reversed_effective_interval():
    result = validate_universe_membership([
        membership_row(
            effective_from="2021-01-01T00:00:00Z",
            effective_to="2020-01-01T00:00:00Z",
        )
    ])
    assert result["status"] == "FAIL"
    assert any("effective_to precedes effective_from" in e for e in result["errors"])


def test_universe_membership_blocks_empty_input():
    assert validate_universe_membership([])["status"] == "BLOCKED"
