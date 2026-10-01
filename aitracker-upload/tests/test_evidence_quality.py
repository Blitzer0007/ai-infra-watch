from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

from app.agents.evidence_quality import normalize_freshness, detect_conflicts


def call(tool, output):
    return SimpleNamespace(tool=tool, output=output, ok=True)


def test_news_freshness_is_normalized():
    now = datetime.now(timezone.utc)
    output = {"published_at": (now - timedelta(hours=6)).isoformat()}
    result = normalize_freshness("news.search", output, now=now)
    assert result["status"] == "FRESH"
    assert result["age_hours"] >= 5


def test_stale_sec_does_not_trigger_conflict():
    now = datetime.now(timezone.utc)
    old = (now - timedelta(days=120)).isoformat()
    calls = [
        call("filings.get_catalysts", {"status": "announced", "symbol": "NVDA", "filing_date": old}),
        call("news.search", {"status": "cancelled", "symbol": "NVDA", "published_at": (now - timedelta(hours=2)).isoformat()}),
    ]
    report = detect_conflicts(calls)
    assert report["detected"] is False


def test_fresh_incompatible_statuses_trigger_conflict():
    now = datetime.now(timezone.utc)
    calls = [
        call("filings.get_catalysts", {"status": "announced", "symbol": "NVDA", "filing_date": (now - timedelta(days=2)).isoformat()}),
        call("news.search", {"status": "cancelled", "symbol": "NVDA", "published_at": (now - timedelta(hours=3)).isoformat()}),
    ]
    report = detect_conflicts(calls)
    assert report["detected"] is True
    assert report["count"] == 1
    assert report["items"][0]["resolution"] == "investigate"


def test_signed_then_delayed_is_not_automatically_conflict():
    now = datetime.now(timezone.utc)
    calls = [
        call("filings.get_catalysts", {"status": "signed", "symbol": "CRM", "filing_date": (now - timedelta(days=2)).isoformat()}),
        call("news.search", {"status": "delayed", "symbol": "CRM", "published_at": (now - timedelta(hours=3)).isoformat()}),
    ]
    report = detect_conflicts(calls)
    assert report["detected"] is False


def test_conflict_scoping_does_not_cross_contaminate_records():
    now = datetime.now(timezone.utc)
    calls = [
        call(
            "filings.get_catalysts",
            {
                "records": [
                    {"status": "announced", "symbol": "NVDA", "summary": "New partnership"},
                    {"status": "cancelled", "symbol": "AMD", "summary": "Old agreement"},
                ],
                "filing_date": (now - timedelta(days=2)).isoformat(),
            },
        ),
    ]
    report = detect_conflicts(calls)
    assert report["detected"] is False


def test_conflict_scoping_keeps_same_record_contradiction():
    now = datetime.now(timezone.utc)
    calls = [
        call(
            "filings.get_catalysts",
            {
                "records": [
                    {"status": "announced", "symbol": "NVDA", "summary": "New partnership"},
                ],
                "filing_date": (now - timedelta(days=2)).isoformat(),
            },
        ),
        call(
            "news.search",
            {
                "records": [
                    {"status": "cancelled", "symbol": "NVDA", "summary": "New partnership"},
                ],
                "published_at": (now - timedelta(hours=3)).isoformat(),
            },
        ),
    ]
    report = detect_conflicts(calls)
    assert report["detected"] is True
    assert report["items"][0]["entity"] == "NVDA"
