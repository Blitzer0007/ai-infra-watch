from __future__ import annotations

from types import SimpleNamespace

from app.agents.evidence_quality import citation_coverage, deduplicate_evidence


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
