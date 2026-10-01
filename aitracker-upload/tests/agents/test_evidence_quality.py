from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.agents.evidence_quality import detect_conflicts, enrich_calls, normalize_freshness


def test_market_freshness_is_classified_from_retrieved_dates() -> None:
    now = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    result = normalize_freshness(
        "stocks.get_quotes",
        {"quotes": [{"symbol": "NVDA", "retrievedAt": "2026-10-01T11:00:00Z"}]},
        now=now,
    )
    assert result["family"] == "market"
    assert result["status"] == "FRESH"
    assert result["age_hours"] == 1.0


def test_sec_stale_evidence_is_not_treated_as_current() -> None:
    now = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
    result = normalize_freshness(
        "filings.get_catalysts",
        {"filings": [{"ticker": "NVDA", "filing_date": "2026-01-01"}]},
        now=now,
    )
    assert result["family"] == "sec"
    assert result["status"] == "STALE"


def test_conflict_detection_keeps_incompatible_claims_for_investigation() -> None:
    calls = [
        SimpleNamespace(
            ok=True,
            tool="filings.get_catalysts",
            output={"contracts": [{
                "company": "Example Compute",
                "status": "signed",
                "date": "2026-09-30",
                "summary": "Agreement signed",
            }]},
            error=None,
        ),
        SimpleNamespace(
            ok=True,
            tool="news.search",
            output={"articles": [{
                "company": "Example Compute",
                "status": "cancelled",
                "date": "2026-09-30",
                "summary": "Agreement cancelled",
            }]},
            error=None,
        ),
    ]
    report = detect_conflicts(calls)
    assert report["detected"] is True
    assert report["count"] == 1
    assert report["items"][0]["resolution"] == "investigate"


def test_enrich_calls_emits_freshness_metadata_for_successful_calls() -> None:
    calls = [
        SimpleNamespace(
            ok=True,
            tool="news.search",
            output={"articles": [{"published_at": "2026-10-01"}]},
            error=None,
        ),
        SimpleNamespace(
            ok=False,
            tool="filings.get_catalysts",
            output=None,
            error="provider unavailable",
        ),
    ]
    enriched = enrich_calls(calls)
    assert len(enriched) == 1
    assert enriched[0]["tool"] == "news.search"
    assert enriched[0]["freshness"]["status"] == "FRESH"
