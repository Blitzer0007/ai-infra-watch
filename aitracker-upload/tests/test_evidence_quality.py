from types import SimpleNamespace
from datetime import datetime, timezone, timedelta

from app.agents.evidence_quality import normalize_freshness, detect_conflicts
from app.jev.assess import assess, measured_evidence_quality
from app.jev.client import JevAnswer, JevEvaluation


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


def measured_state(families, freshness=None, missing=None, conflicts=0, citation=None):
    return {
        "evidence_availability": {
            "usable_families": families,
            "missing": missing or [],
        },
        "evidence_freshness": freshness or [],
        "conflict_detection": {"detected": conflicts > 0, "count": conflicts},
        "citation_coverage": {} if citation is None else {"coverage": citation},
    }


def test_measured_evidence_quality_single_analyst_source_is_partial():
    result = measured_evidence_quality(
        measured_state(
            ["analyst_consensus"],
            [{"freshness": {"status": "FRESH"}}],
        )
    )
    assert result["score"] == 1.0
    assert result["percent"] == 33
    assert result["label"] == "Partial"


def test_measured_evidence_quality_three_fresh_sources_is_strong():
    result = measured_evidence_quality(
        measured_state(
            ["market", "news", "analyst_consensus"],
            [
                {"freshness": {"status": "FRESH"}},
                {"freshness": {"status": "FRESH"}},
                {"freshness": {"status": "FRESH"}},
            ],
        )
    )
    assert result["score"] == 3.0
    assert result["percent"] == 100
    assert result["label"] == "Strong"


def test_measured_evidence_quality_stale_sources_are_capped():
    result = measured_evidence_quality(
        measured_state(
            ["market", "news", "analyst_consensus"],
            [
                {"freshness": {"status": "STALE"}},
                {"freshness": {"status": "STALE"}},
                {"freshness": {"status": "STALE"}},
            ],
        )
    )
    assert result["score"] == 1.0
    assert result["label"] == "Partial"


def test_measured_evidence_quality_conflict_reduces_strong_evidence():
    result = measured_evidence_quality(
        measured_state(
            ["market", "news", "regulatory_primary"],
            [
                {"freshness": {"status": "FRESH"}},
                {"freshness": {"status": "FRESH"}},
                {"freshness": {"status": "FRESH"}},
            ],
            conflicts=1,
        )
    )
    assert result["score"] == 1.0
    assert result["conflict_count"] == 1


def test_measured_evidence_quality_missing_required_and_poor_citations_reduce_score():
    result = measured_evidence_quality(
        measured_state(
            ["market", "news", "analyst_consensus"],
            [
                {"freshness": {"status": "FRESH"}},
                {"freshness": {"status": "FRESH"}},
                {"freshness": {"status": "FRESH"}},
            ],
            missing=["regulatory_primary"],
            citation=0.2,
        )
    )
    assert result["score"] == 1.0
    assert result["percent"] == 33


class _FakeAssessmentClient:
    def evaluate(self, *, state, questions):
        return JevEvaluation(
            answers={
                "evidence_quality": JevAnswer(
                    type="score",
                    score=3.0,
                    confidence=0.99,
                )
            },
            model="test",
            latency_ms=1.0,
            input_tokens=10,
        )


def test_jev_assessment_cannot_override_measured_evidence_quality():
    state = measured_state(
        ["analyst_consensus"],
        [{"freshness": {"status": "FRESH"}}],
    )
    result = assess("research", state, client=_FakeAssessmentClient())
    answer = result.answers["evidence_quality"]
    assert answer.score == 1.0
    assert answer.confidence == 1.0 / 3.0
