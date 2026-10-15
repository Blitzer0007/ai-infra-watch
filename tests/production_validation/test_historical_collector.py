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
