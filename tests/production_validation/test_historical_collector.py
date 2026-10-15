from .collect_historical_evidence import extract_price_rows


def test_collector_preserves_adjusted_close_and_does_not_invent_availability():
    payload = {
        "raw": {
            "chart": {
                "result": [{
                    "timestamp": [1735848000],
                    "indicators": {
                        "quote": [{"close": [100.0]}],
                        "adjclose": [{"adjclose": [98.5]}],
                    },
                }]
            }
        }
    }
    rows = extract_price_rows(
        "XYZ",
        payload,
        "https://query1.finance.yahoo.com/v8/finance/chart/XYZ",
        "2026-10-15T05:00:00Z",
    )
    assert len(rows) == 1
    assert rows[0]["adjusted_close"] == 98.5
    assert rows[0]["adjusted"] is True
    assert rows[0]["available_at"] is None
    assert rows[0]["availability_status"] == "unknown_vendor_publication_time"
    assert rows[0]["decision_cutoff"] is None
    assert rows[0]["retrieved_at"] == "2026-10-15T05:00:00Z"


def test_collector_skips_rows_without_adjusted_close():
    payload = {
        "raw": {
            "chart": {
                "result": [{
                    "timestamp": [1735848000, 1735934400],
                    "indicators": {
                        "quote": [{"close": [100.0, 101.0]}],
                        "adjclose": [{"adjclose": [None, 99.5]}],
                    },
                }]
            }
        }
    }
    rows = extract_price_rows("XYZ", payload, "https://example.invalid", "2026-10-15T05:00:00Z")
    assert len(rows) == 1
    assert rows[0]["adjusted_close"] == 99.5


from .collect_historical_evidence import build_integrity_summary


def test_integrity_summary_passes_clean_structural_fixture():
    rows = [
        {"symbol": "XYZ", "date": "2025-01-02T14:30:00Z", "close": 100.0, "adjusted_close": 98.5},
        {"symbol": "XYZ", "date": "2025-01-03T14:30:00Z", "close": 101.0, "adjusted_close": 99.5},
    ]
    result = build_integrity_summary(rows, ["XYZ"], "2025-01-01", "2025-02-01", [])
    assert result["status"] == "PASS"
    assert result["total_rows"] == 2
    assert result["duplicate_symbol_date_rows"] == 0
    assert result["invalid_price_rows"] == 0
    assert result["out_of_range_rows"] == 0
    assert result["weekend_rows"] == 0


def test_integrity_summary_flags_duplicates_bad_values_and_out_of_range():
    rows = [
        {"symbol": "XYZ", "date": "2024-12-31T14:30:00Z", "close": -1.0, "adjusted_close": None},
        {"symbol": "XYZ", "date": "2024-12-31T14:30:00Z", "close": 100.0, "adjusted_close": 99.0},
    ]
    result = build_integrity_summary(rows, ["XYZ"], "2025-01-01", "2025-02-01", [])
    assert result["status"] == "FAIL"
    assert result["duplicate_symbol_date_rows"] == 1
    assert result["invalid_price_rows"] == 1
    assert result["out_of_range_rows"] == 2


def test_integrity_summary_keeps_collection_failure_visible():
    result = build_integrity_summary([], ["XYZ"], "2025-01-01", "2025-02-01", [{"symbol": "XYZ", "error": "timeout"}])
    assert result["status"] == "FAIL"
    assert result["symbols_with_rows"]["XYZ"] == 0
    assert result["errors"]


from .collect_historical_evidence import build_session_coverage, load_exchange_sessions


def test_session_coverage_passes_when_every_expected_session_is_present():
    sessions = ["2025-01-02", "2025-01-03"]
    rows = [
        {"symbol": "NVDA", "date": "2025-01-02T14:30:00Z"},
        {"symbol": "NVDA", "date": "2025-01-03T14:30:00Z"},
    ]
    result = build_session_coverage(rows, ["NVDA"], "2025-01-01", "2025-01-06", sessions, {"calendar_id": "TEST"}, [])
    assert result["status"] == "PASS"
    assert result["symbols"]["NVDA"]["missing_sessions"] == []
    assert result["symbols"]["NVDA"]["unexpected_sessions"] == []
    assert result["symbols"]["NVDA"]["coverage_pct"] == 100.0


def test_session_coverage_flags_missing_exchange_session():
    rows = [{"symbol": "NVDA", "date": "2025-01-02T14:30:00Z"}]
    result = build_session_coverage(
        rows, ["NVDA"], "2025-01-01", "2025-01-06",
        ["2025-01-02", "2025-01-03"], {"calendar_id": "TEST"}, []
    )
    assert result["status"] == "FAIL"
    assert result["symbols"]["NVDA"]["missing_sessions"] == ["2025-01-03"]
    assert result["symbols"]["NVDA"]["coverage_pct"] == 50.0


def test_session_coverage_flags_unexpected_provider_date():
    rows = [{"symbol": "NVDA", "date": "2025-01-04T14:30:00Z"}]
    result = build_session_coverage(
        rows, ["NVDA"], "2025-01-01", "2025-01-06",
        ["2025-01-02", "2025-01-03"], {"calendar_id": "TEST"}, []
    )
    assert result["status"] == "FAIL"
    assert result["symbols"]["NVDA"]["unexpected_sessions"] == ["2025-01-04"]
    assert result["symbols"]["NVDA"]["missing_sessions"] == ["2025-01-02", "2025-01-03"]


def test_calendar_model_excludes_new_years_day_and_includes_january_second():
    sessions, metadata = load_exchange_sessions("2025-01-01", "2025-01-04")
    assert sessions == ["2025-01-02", "2025-01-03"]
    assert metadata["calendar_id"] == "XNYS"
    assert metadata["provider"] == "exchange_calendars"
    assert metadata["session_count"] == 2
