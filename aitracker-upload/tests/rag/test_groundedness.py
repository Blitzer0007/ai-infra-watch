"""Hallucination-detection pipeline tests (Phase 6, roadmap lines 1064-1068).

Hermetic, NO LLM — the checker runs over already-produced text. The roadmap's
explicit bar is asserted directly:
  * a fully-grounded answer MUST pass (grounded, no offenders)
  * a planted fabricated fact MUST be flagged (in `unsupported`, groundedness < 1)

Plus the score math, the empty/URL carve-outs, and `check_answer_result`
grounding a filings AnswerResult against its own citations.
"""
from __future__ import annotations

import pytest

from app.rag.groundedness import check_answer_result, check_groundedness
from app.rag.schemas import GroundednessReport
from mcp_servers.filings.schemas import AnswerResult, Citation

# One source chunk the "answer" is (or isn't) grounded in.
SOURCES = [
    "NVIDIA data center revenue grew forty percent to a record level in the quarter.",
    "Management cited strong demand for AI accelerators as the primary driver.",
]


# ---------------------------------------------------------------------------
# The roadmap bar — grounded passes, fabrication is flagged
# ---------------------------------------------------------------------------
def test_fully_grounded_answer_passes():
    answer = (
        "Data center revenue grew forty percent to a record level. "
        "Management cited strong demand for AI accelerators."
    )
    report = check_groundedness(answer, SOURCES)
    assert isinstance(report, GroundednessReport)
    assert report.grounded is True
    assert report.unsupported == []
    assert not report.flagged()
    assert report.groundedness == pytest.approx(1.0)


def test_planted_fabrication_is_flagged():
    # The middle sentence shares NO vocabulary with either source: a fabrication.
    answer = (
        "Data center revenue grew forty percent to a record level. "
        "The company also opened a theme park on the moon. "
        "Management cited strong demand for AI accelerators."
    )
    report = check_groundedness(answer, SOURCES)
    assert report.flagged() is True
    assert report.grounded is False
    assert any("theme park" in c for c in report.unsupported)
    # Two of three claims survive -> groundedness strictly between 0 and 1.
    assert 0.0 < report.groundedness < 1.0


# ---------------------------------------------------------------------------
# Score math + carve-outs
# ---------------------------------------------------------------------------
def test_all_claims_grounded_scores_one():
    report = check_groundedness("Data center revenue grew forty percent.", SOURCES)
    assert report.groundedness == pytest.approx(1.0)
    assert all(c.supported for c in report.claims)


def test_half_grounded_scores_about_half():
    answer = (
        "Data center revenue grew forty percent to a record level. "
        "Unicorns danced across a distant purple galaxy."
    )
    report = check_groundedness(answer, SOURCES)
    assert report.groundedness == pytest.approx(0.5)
    assert len(report.unsupported) == 1


def test_empty_answer_is_vacuously_grounded():
    report = check_groundedness("", SOURCES)
    assert report.grounded is True
    assert report.groundedness == pytest.approx(1.0)
    assert report.claims == []


def test_whitespace_answer_is_vacuously_grounded():
    report = check_groundedness("   \n  ", SOURCES)
    assert report.grounded is True
    assert report.groundedness == pytest.approx(1.0)


def test_url_only_claim_is_skipped():
    # A pure citation footer is self-evidence, not an ungrounded claim.
    report = check_groundedness("See https://sec.gov/filing for details.", SOURCES)
    assert report.grounded is True
    assert report.claims == []  # the only claim was a URL -> skipped


def test_empty_sources_flags_every_real_claim():
    report = check_groundedness("Revenue grew forty percent.", [])
    assert report.flagged() is True
    assert report.groundedness == pytest.approx(0.0)


def test_threshold_is_honored():
    # A claim with partial overlap sits above a low floor, below a high one.
    answer = "Revenue demand accelerators quarter."
    lo = check_groundedness(answer, SOURCES, threshold=0.05)
    hi = check_groundedness(answer, SOURCES, threshold=0.95)
    assert lo.grounded is True
    assert hi.flagged() is True


# ---------------------------------------------------------------------------
# check_answer_result — ground a filings AnswerResult against its citations
# ---------------------------------------------------------------------------
def _answer_result(answer_text: str) -> AnswerResult:
    return AnswerResult(
        answer=answer_text,
        citations=[
            Citation(document_id="nvda_10k", chunk_index=0, text=SOURCES[0], score=0.9),
            Citation(document_id="nvda_10k", chunk_index=1, text=SOURCES[1], score=0.8),
        ],
        sources_footer="Sources: nvda_10k",
    )


def test_check_answer_result_grounds_against_citations():
    ar = _answer_result("Data center revenue grew forty percent to a record level.")
    report = check_answer_result(ar)
    assert report.grounded is True
    assert not report.flagged()


def test_check_answer_result_flags_fabrication_over_citations():
    ar = _answer_result("The board approved a merger with a pizza chain in Rome.")
    report = check_answer_result(ar)
    assert report.flagged() is True
    assert report.unsupported


def test_check_answer_result_no_citations_flags_content():
    # An answer with no citations to ground against: any real claim is flagged.
    ar = AnswerResult(answer="Revenue grew forty percent.", citations=[])
    report = check_answer_result(ar)
    assert report.flagged() is True
