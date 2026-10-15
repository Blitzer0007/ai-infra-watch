from tests.production_validation.historical_evidence import (
    validate_price_evidence,
    validate_universe_membership,
)


def price_row(**overrides):
    row = {
        "symbol": "MSFT",
        "date": "2025-01-02T21:00:00Z",
        "close": 410.0,
        "adjusted": True,
        "available_at": "2025-01-02T21:05:00Z",
        "decision_cutoff": "2025-01-03T14:00:00Z",
        "source": "fixture-only",
        "source_url": "https://example.invalid/fixture",
    }
    return {**row, **overrides}


def membership_row(**overrides):
    row = {
        "symbol": "MSFT",
        "status": "verified",
        "effective_from": "2020-01-01T00:00:00Z",
        "effective_to": None,
        "as_of": "2025-01-02T00:00:00Z",
        "source": "fixture-only",
        "source_url": "https://example.invalid/fixture",
    }
    return {**row, **overrides}


def test_price_evidence_passes_when_provenance_and_cutoff_are_present():
    result = validate_price_evidence([price_row()])
    assert result["status"] == "PASS"


def test_price_evidence_fails_when_price_was_available_after_cutoff():
    result = validate_price_evidence([
        price_row(available_at="2025-01-04T00:00:00Z")
    ])
    assert result["status"] == "FAIL"
    assert any("not available by the decision cutoff" in e for e in result["errors"])


def test_price_evidence_fails_for_unadjusted_prices():
    assert validate_price_evidence([price_row(adjusted=False)])["status"] == "FAIL"


def test_price_evidence_blocks_empty_input():
    assert validate_price_evidence([])["status"] == "BLOCKED"


def test_universe_membership_requires_verified_effective_dated_source():
    assert validate_universe_membership([membership_row()])["status"] == "PASS"


def test_universe_membership_rejects_unknown_membership():
    result = validate_universe_membership([membership_row(status="unknown")])
    assert result["status"] == "FAIL"
    assert any("not verified" in e for e in result["errors"])


def test_universe_membership_rejects_symbol_not_yet_in_universe():
    result = validate_universe_membership([
        membership_row(effective_from="2026-01-01T00:00:00Z")
    ])
    assert result["status"] == "FAIL"
