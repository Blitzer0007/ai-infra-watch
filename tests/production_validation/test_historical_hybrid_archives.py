from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from scripts.historical_evidence import archive_ohlc_asof
from scripts.historical_evidence.archive_ohlc_asof import (
    EARLIEST_SUPPORTED_AS_OF,
    FREE_SYMBOLS,
    validate_payload as validate_ohlc_payload,
    validate_request as validate_ohlc_request,
)
from scripts.historical_evidence.archive_marketparquet import validate_parquet
from scripts.historical_evidence.build_sp500_membership_evidence import (
    _publication_upper_bound,
    _title_overlap,
    build_bundle,
    publication_date_from_page,
)


def ohlc_payload(symbol: str = "XNAS:NVDA", as_of: str = "2026-10-20"):
    return {
        "data": [
            {
                "date": "2025-10-01",
                "symbol": symbol,
                "instrument_id": "security-123",
                "open": "100.0",
                "high": "102.0",
                "low": "99.0",
                "close": "101.5",
                "volume": "1000000",
            },
            {
                "date": "2025-10-02",
                "symbol": symbol,
                "instrument_id": "security-123",
                "open": "101.5",
                "high": "103.0",
                "low": "100.5",
                "close": "102.5",
                "volume": "900000",
            },
        ],
        "meta": {"as_of": f"{as_of}T23:59:59.999999Z", "next_cursor": None},
    }


def test_ohlc_free_allowlist_is_exact_and_cutoff_is_fail_closed():
    assert set(FREE_SYMBOLS) == {"AAPL", "NVDA", "JNJ", "PEP", "MSFT", "SPY", "QQQ"}
    assert EARLIEST_SUPPORTED_AS_OF.isoformat() == "2026-09-22"
    with pytest.raises(ValueError, match="outside"):
        validate_ohlc_request("MU", "2026-10-01", "2026-10-20", "2026-10-20")
    with pytest.raises(ValueError, match="before"):
        validate_ohlc_request("NVDA", "2025-10-01", "2025-10-03", "2025-10-03")


def test_ohlc_asof_response_passes_structure_and_chronology():
    info = validate_ohlc_payload(
        ohlc_payload(),
        "XNAS:NVDA",
        "2025-10-01",
        "2026-10-20",
        "2026-10-20",
    )
    assert info["row_count"] == 2
    assert info["first_date"] == "2025-10-01"
    assert info["last_date"] == "2025-10-02"


def test_ohlc_response_fails_when_provider_returns_different_cutoff():
    with pytest.raises(ValueError, match="as_of"):
        validate_ohlc_payload(
            ohlc_payload(as_of="2026-10-19"),
            "XNAS:NVDA",
            "2025-10-01",
            "2026-10-20",
            "2026-10-20",
        )


def test_ohlc_response_fails_for_duplicate_dates_or_wrong_symbol():
    duplicate = ohlc_payload()
    duplicate["data"][1]["date"] = duplicate["data"][0]["date"]
    with pytest.raises(ValueError, match="duplicate"):
        validate_ohlc_payload(duplicate, "XNAS:NVDA", "2025-10-01", "2026-10-20", "2026-10-20")
    with pytest.raises(ValueError, match="unexpected symbol"):
        validate_ohlc_payload(ohlc_payload("XNAS:MU"), "XNAS:NVDA", "2025-10-01", "2026-10-20", "2026-10-20")


def make_parquet(*, mixed_dates: bool = False) -> bytes:
    pa = pytest.importorskip("pyarrow")
    pq = pytest.importorskip("pyarrow.parquet")
    import io

    dates = [date(2026, 10, 19), date(2026, 10, 20)] if mixed_dates else [date(2026, 10, 19), date(2026, 10, 19)]
    table = pa.table({
        "date": dates,
        "symbol": ["AAPL", "NVDA"],
        "asset_type": ["Stock", "Stock"],
        "open": [100.0, 200.0],
        "high": [101.0, 202.0],
        "low": [99.0, 198.0],
        "close": [100.5, 201.0],
        "volume": [1000.0, 2000.0],
    })
    buffer = io.BytesIO()
    pq.write_table(table, buffer, compression="snappy")
    return buffer.getvalue()


def test_marketparquet_validates_parquet_schema_date_and_ohlcv():
    info = validate_parquet(make_parquet())
    assert info["market_date"] == "2026-10-19"
    assert info["row_count"] == 2
    assert info["symbol_count"] == 2
    assert info["date_column"] == "date"


def test_marketparquet_rejects_non_parquet_or_multi_date_file():
    with pytest.raises(ValueError, match="Parquet magic"):
        validate_parquet(b"not a parquet file")
    with pytest.raises(ValueError, match="exactly one"):
        validate_parquet(make_parquet(mixed_dates=True))


def test_membership_publication_date_requires_official_date_match():
    page = b'<html><head><meta property="article:published_time" content="2024-05-20T10:00:00Z"></head></html>'
    assert publication_date_from_page(
        "https://press.spglobal.com/2024-05-20-company-to-join-index",
        page,
        "2024-05-20",
    ) == "2024-05-20"
    assert publication_date_from_page(
        "https://press.spglobal.com/2024-05-20-company-to-join-index",
        page,
        "2024-05-21",
    ) is None


def write_membership_fixture(root: Path):
    source = root / "src" / "sp500_ticker_history"
    source.mkdir(parents=True)
    (root / "licenses").mkdir()
    (root / "licenses" / "fja05680_sp500_LICENSE").write_text("MIT license test fixture", encoding="utf-8")
    (root / "source_notes.json").write_text(json.dumps({
        "data_freeze_date": "2025-12-31",
        "yaml_coverage": "2004 through 2025-12-31",
        "caveats": ["fixture source has incomplete event provenance"],
    }), encoding="utf-8")
    (source / "sp500-ticker-changes-2024.yaml").write_text(
        "year: 2024\n"
        "tickers_on_Jan_1: [A, B]\n"
        "changes:\n"
        "  '2024-06-01':\n"
        "    difference: [B]\n"
        "    union: [C]\n"
        "    source_url: https://press.spglobal.com/2024-05-20-c-test\n"
        "    announcement_date: '2024-05-20'\n",
        encoding="utf-8",
    )
    (source / "sp500-ticker-changes-2025.yaml").write_text(
        "year: 2025\n"
        "tickers_on_Jan_1: [A, C]\n"
        "changes:\n"
        "  '2025-02-03':\n"
        "    difference: [C]\n"
        "    union: [D]\n",
        encoding="utf-8",
    )
    (source / "sp500-ticker-changes-2026.yaml").write_text(
        "year: 2026\n"
        "tickers_on_Jan_1: [A, D]\n"
        "changes:\n"
        "  '2026-06-22':\n"
        "    difference: [D]\n"
        "    union: [E]\n"
        "    source_url: https://press.spglobal.com/2026-06-05-e-test\n"
        "    announcement_date: '2026-06-05'\n",
        encoding="utf-8",
    )



def test_membership_builder_preserves_source_artifacts_and_fails_closed(tmp_path):
    upstream = tmp_path / "upstream"
    output = tmp_path / "output"
    write_membership_fixture(upstream)
    report = build_bundle(
        upstream,
        output,
        "a" * 40,
        "2026-10-19T17:45:40Z",
        fetch_sources=False,
    )
    rows = json.loads((output / "membership_rows.json").read_text(encoding="utf-8"))["membership_rows"]
    assert report["total_intervals"] == 4
    assert report["historical_membership_gate"] == "BLOCKED"
    assert report["insufficient_intervals"] > 0
    assert all((output / row["membership_evidence_artifact_path"]).is_file() for row in rows)
    assert all(len(row["membership_evidence_sha256"]) == 64 for row in rows)
    assert report["coverage_through"] == "2025-12-31"
    assert report["events_excluded_after_source_freeze"] == 1
    assert report["latest_excluded_event_date"] == "2026-06-22"
    by_symbol_and_start = {(row["symbol"], row["effective_from"][:10]): row for row in rows}
    # A member removed on June 1 is not represented as a member on that effective date.
    assert by_symbol_and_start[("B", "2024-01-01")]["effective_to"] == "2024-05-31T00:00:00Z"
    assert by_symbol_and_start[("C", "2024-06-01")]["effective_to"] == "2025-02-02T00:00:00Z"
    # No row sourced from this frozen dataset may imply indefinite current membership.
    assert all(row["effective_to"] is not None for row in rows)
    assert all(row["status"] == "insufficient" for row in rows if row["effective_to"] == "2025-12-31T00:00:00Z")



def test_ohlc_payload_requires_pagination_metadata_and_exposes_cursor():
    payload = ohlc_payload()
    payload["meta"]["next_cursor"] = "next-page-token"
    info = validate_ohlc_payload(
        payload,
        "XNAS:NVDA",
        "2025-10-01",
        "2026-10-20",
        "2026-10-20",
    )
    assert info["next_cursor"] == "next-page-token"

    del payload["meta"]["next_cursor"]
    with pytest.raises(ValueError, match="pagination metadata"):
        validate_ohlc_payload(
            payload,
            "XNAS:NVDA",
            "2025-10-01",
            "2026-10-20",
            "2026-10-20",
        )


def test_ohlc_payload_rejects_malformed_cursor():
    payload = ohlc_payload()
    payload["meta"]["next_cursor"] = 42
    with pytest.raises(ValueError, match="malformed pagination cursor"):
        validate_ohlc_payload(
            payload,
            "XNAS:NVDA",
            "2025-10-01",
            "2026-10-20",
            "2026-10-20",
        )



def test_ohlc_archive_follows_all_cursor_pages_and_archives_manifest(monkeypatch):
    calls = []
    uploaded = []
    metadata = []

    def make_page(trading_date, next_cursor):
        return json.dumps({
            "data": [{
                "date": trading_date,
                "symbol": "XNAS:NVDA",
                "instrument_id": "security-123",
                "open": "100.0",
                "high": "102.0",
                "low": "99.0",
                "close": "101.5",
                "volume": "1000000",
            }],
            "meta": {"as_of": "2026-10-20T23:59:59.999999Z", "next_cursor": next_cursor},
        }).encode("utf-8")

    pages = {
        None: make_page("2025-10-01", "cursor-page-2"),
        "cursor-page-2": make_page("2025-10-02", None),
    }

    def fake_fetch(symbol, date_from, date_to, as_of, cursor=None):
        calls.append(cursor)
        return pages[cursor], {
            "request_id": f"request-{len(calls)}",
            "credits_cost": "5",
            "credits_remaining": "12400",
        }

    monkeypatch.setattr(archive_ohlc_asof, "fetch_response", fake_fetch)
    monkeypatch.setattr(archive_ohlc_asof, "upload_object", lambda path, body, mime: uploaded.append((path, body, mime)) or True)
    monkeypatch.setattr(archive_ohlc_asof, "upsert_metadata", lambda row: metadata.append(row))
    monkeypatch.setattr(archive_ohlc_asof, "utc_now", lambda: "2026-10-20T23:45:00Z")

    result = archive_ohlc_asof.archive_symbol("NVDA", date(2026, 10, 20))

    assert calls == [None, "cursor-page-2"]
    assert result["rows"] == 2
    assert result["pages"] == 2
    assert result["first_date"] == "2025-10-01"
    assert result["last_date"] == "2025-10-02"
    assert result["result"] == "archived_candidate"
    assert len(uploaded) == 3  # two exact response pages plus the page-hash manifest
    assert len(metadata) == 3
    assert all(row["evidence_status"] == "candidate" for row in metadata)


def test_membership_publication_upper_bound_and_source_title_match_are_conservative():
    assert _publication_upper_bound("2024-05-20") == "2024-05-21T23:59:59.999999Z"
    relevant_page = b"<html><title>Acme Quantum Labs Set to Join S&amp;P 500</title></html>"
    unrelated_page = b"<html><title>Quarterly Market Update</title></html>"
    assert _title_overlap("Acme Quantum Labs Set to Join S&P 500", relevant_page) >= 0.60
    assert _title_overlap("Acme Quantum Labs Set to Join S&P 500", unrelated_page) < 0.60
