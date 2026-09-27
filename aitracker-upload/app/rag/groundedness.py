"""Hallucination detection — the post-generation groundedness checker.

Roadmap Phase 6 (lines 1064-1068): break an answer into atomic claims,
ground each against the retrieved sources / citations, and flag any claim
that appears in no source (fabrication). Emits a groundedness score plus
the offending claims.

Design (load-bearing for the hermetic demo)
--------------------------------------------
* This runs AFTER generation, over already-produced text. It makes NO LLM
  call and mutates NO prompt, so attaching it to the filings / market path
  cannot change a single committed fixture hash.
* It does NOT reimplement grounding. Claim extraction reuses `_split_claims`
  and source grounding reuses `claim_grounding_score` from
  `app.assertions.semantic` — the same heuristics `assert_no_hallucination`
  and `/api/eval` already grade with. This module only wraps them into a
  structured `GroundednessReport` (returns a report instead of raising).
* Limitation, stated honestly: lexical overlap detects fabrication (zero
  shared vocabulary) but not semantic contradiction/negation. The report
  leans toward false positives — the safe direction for a hallucination gate.
"""
from __future__ import annotations

import re
from typing import Iterable

from app.assertions.semantic import _split_claims, claim_grounding_score
from app.rag.schemas import ClaimCheck, GroundednessReport
from mcp_servers.filings.schemas import AnswerResult

# Default grounding floor: a claim scoring below this against every source is
# unsupported. Matches `assert_no_hallucination`'s default so the checker and
# the test assertion agree on the boundary.
DEFAULT_THRESHOLD = 0.25


def check_groundedness(
    answer: str,
    sources: Iterable[str],
    threshold: float = DEFAULT_THRESHOLD,
) -> GroundednessReport:
    """Grade every atomic claim in `answer` against `sources`.

    Steps mirror the roadmap: (a) claim extraction via `_split_claims`;
    (b) source grounding via `claim_grounding_score` (best score across
    sources); (c) score & flag — a claim below `threshold` is unsupported.

    A claim containing a URL is treated as self-evident citation and skipped
    (same carve-out as `assert_no_hallucination`), so a "Sources: https://..."
    footer never counts against groundedness.

    An empty answer is vacuously grounded (groundedness 1.0): there is nothing
    to fabricate. An answer over an empty source set flags every non-URL claim
    (nothing supports it) — the honest verdict, not a crash.
    """
    src = [s for s in sources if s and s.strip()]
    checks: list[ClaimCheck] = []
    unsupported: list[str] = []
    for claim in _split_claims(answer or ""):
        if re.search(r"https?://", claim):
            # URL == its own evidence; do not grade a citation footer.
            continue
        score = claim_grounding_score(claim, src)
        supported = score >= threshold
        checks.append(ClaimCheck(claim=claim, score=round(score, 4), supported=supported))
        if not supported:
            unsupported.append(claim)

    graded = len(checks)
    supported_n = graded - len(unsupported)
    # No gradeable claims (empty/URL-only answer) -> vacuously grounded.
    groundedness = 1.0 if graded == 0 else supported_n / graded
    return GroundednessReport(
        groundedness=round(groundedness, 4),
        grounded=not unsupported,
        claims=checks,
        unsupported=unsupported,
        threshold=threshold,
    )


def check_answer_result(
    answer: AnswerResult,
    threshold: float = DEFAULT_THRESHOLD,
) -> GroundednessReport:
    """Ground a filings `AnswerResult` against its own citations.

    The citation texts ARE the retrieved evidence the answer was generated
    over, so grounding `answer.answer` against `[c.text for c in citations]`
    is exactly "does the answer stay within what was retrieved". An answer
    with no citations (e.g. a refusal) grounds against an empty source set.
    """
    sources = [c.text for c in answer.citations]
    return check_groundedness(answer.answer, sources, threshold=threshold)
