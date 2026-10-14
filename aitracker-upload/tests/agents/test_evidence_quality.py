from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.agents.evidence_quality import (
    citation_coverage,
    deduplicate_evidence,
    detect_conflicts,
    normalize_freshness,
)


def test_deduplicate_evidence_counts_cross_source_duplicates() -> None:
    calls = [
        SimpleNamespace(
            ok=True,
            tool="filings.get_catalysts",
            output={"items": [{
                "title": "Example Compute contract",
                "url": "https://example.com/contract",
                "date": "2026-09-30",
            }]},
        ),
        SimpleNamespace(
            ok=True,
            tool="news.search",
            output={"articles": [{
                "title": "Example Compute contract",
                "url": "https://example.com/contract",
                "date": "2026-09-30",
            }]},
        ),
    ]

    report = deduplicate_evidence(calls)

    assert report["observed_records"] == 2
    assert report["unique_records"] == 1
    assert report["duplicates_removed"] == 1
    assert report["cross_source_duplicates"] == 1


def test_citation_coverage_requires_source_bearing_records() -> None:
    calls = [
        SimpleNamespace(
            ok=True,
            tool="news.search",
            output={
                "articles": [
                    {"title": "Linked", "url": "https://example.com/news"},
                    {"title": "Unlinked", "summary": "No URL"},
                ]
            },
        )
    ]

    report = citation_coverage(calls)

    assert report["observed_records"] == 1
    assert report["cited_records"] == 1
    assert report["coverage"] == 1.0


def test_normalize_freshness_marks_unknown_timestamp_explicitly() -> None:
    now = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    result = normalize_freshness("news.search", {"articles": [{"title": "No date"}]}, now)
    assert result["status"] == "UNKNOWN"
    assert result["observed_at"] is None



def test_sec_filing_family_uses_longer_regulatory_freshness_window() -> None:
    now = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    result = normalize_freshness(
        "filings.get_catalysts",
        {"items": [{"title": "SEC filing", "date": "2026-08-30"}]},
        now,
    )
    assert result["family"] == "regulatory_primary"
    assert result["status"] == "AGING"
    assert result["aging_within_hours"] == 24 * 90

def test_detect_conflicts_flags_fresh_contradictory_statuses_for_same_entity() -> None:
    now = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    calls = [
        SimpleNamespace(ok=True, tool="news.search", output={"items": [{
            "company": "DGXX", "status": "active", "title": "Hosting contract", "date": "2026-10-14",
        }]}),
        SimpleNamespace(ok=True, tool="filings.get_catalysts", output={"items": [{
            "company": "DGXX", "status": "cancelled", "title": "Hosting contract update", "date": "2026-10-14",
        }]}),
    ]
    report = detect_conflicts(calls, now=now)
    assert report["detected"] is True
    assert report["count"] == 1
    assert report["items"][0]["entity"] == "DGXX"
    assert report["items"][0]["resolution"] == "investigate"


def test_detect_conflicts_ignores_unknown_and_stale_evidence() -> None:
    now = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    unknown_calls = [
        SimpleNamespace(ok=True, tool="news.search", output={"items": [{
            "company": "DGXX", "status": "active", "title": "Hosting contract",
        }]}),
        SimpleNamespace(ok=True, tool="filings.get_catalysts", output={"items": [{
            "company": "DGXX", "status": "cancelled", "title": "Hosting contract update",
        }]}),
    ]
    stale_calls = [
        SimpleNamespace(ok=True, tool="news.search", output={"items": [{
            "company": "DGXX", "status": "active", "title": "Hosting contract", "date": "2026-08-01",
        }]}),
        SimpleNamespace(ok=True, tool="filings.get_catalysts", output={"items": [{
            "company": "DGXX", "status": "cancelled", "title": "Hosting contract update", "date": "2026-08-01",
        }]}),
    ]
    assert detect_conflicts(unknown_calls, now=now)["detected"] is False
    assert detect_conflicts(stale_calls, now=now)["detected"] is False
