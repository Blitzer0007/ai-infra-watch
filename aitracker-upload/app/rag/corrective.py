"""Corrective RAG — retrieve, grade retrieval quality, re-query or fall back.

Roadmap Phase 6 (line 1046): "evaluate retrieval quality, re-query if poor."
This wraps the existing hybrid `Retriever` + `LLMClient` generation in a
corrective loop:

    retrieve -> grade -> {  correct   -> generate -> check groundedness
                            ambiguous -> re-query (widen top_k) -> grade ...
                            incorrect -> honest "insufficient evidence" }

and, if a generated answer's post-hoc groundedness is flagged, re-queries once
more before falling back — so the pipeline degrades to an honest refusal rather
than presenting an answer built on weak or ungrounded context.

Design (why this is a wrapper, not a rewrite)
---------------------------------------------
* The retrieval-quality grade builds on the SAME `RELEVANCE_FLOOR` boundary the
  FilingsAgent router already uses (passed in as `floor`, not redefined) plus
  the Phase-6 groundedness score — reusing both invariants keeps one notion of
  "good enough retrieval" across the app.
* The re-query lever is widening `top_k` (breadth) — one of the roadmap's
  explicit options ("higher top-k / other hybrid arm"). It is deterministic, so
  the loop is hermetically testable with a stub LLM.
* It depends only on a retriever DUCK-TYPE (`.retrieve(query)` + `.top_k`), so
  tests can inject a scripted fake to force each grade without fighting RRF
  score math, and production injects the real `Retriever`.
* HERMETIC-DEMO SAFETY: on a `correct` first grade the loop generates ONCE over
  the base-`top_k` chunks with the exact `build_rag_prompt` the non-corrective
  path uses — same prompt, same fixture hash. Re-query/fallback only fire on
  weak retrieval, which the committed fixture corpus never triggers. Corrective
  mode is opt-in on FilingsAgent, so the default served path is byte-identical.
"""
from __future__ import annotations

from app.llm.client import LLMClient
from app.rag.generator import build_rag_prompt, format_citations
from app.rag.groundedness import DEFAULT_THRESHOLD, check_groundedness
from app.rag.schemas import CorrectiveAttempt, CorrectiveResult, RetrievedChunk

# The honest fallback the loop returns rather than generating over bad context.
INSUFFICIENT = (
    "I don't have sufficient evidence in the retrieved documents to answer "
    "this reliably."
)

# Default relevance floor — mirrors app.agents.filings.RELEVANCE_FLOOR. Passed
# in by FilingsAgent so there is one source of truth at call time; this default
# only applies when CorrectiveRAG is used standalone.
DEFAULT_FLOOR = 0.02

# A retrieval whose top score clears `floor` but not `floor * AMBIGUOUS_FACTOR`
# is "ambiguous" — present but weak — and triggers a re-query before the loop
# commits to generating over it.
AMBIGUOUS_FACTOR = 1.5


def grade_retrieval(
    chunks: list[RetrievedChunk],
    floor: float = DEFAULT_FLOOR,
    ambiguous_factor: float = AMBIGUOUS_FACTOR,
) -> str:
    """Grade a retrieval as 'correct' | 'ambiguous' | 'incorrect'.

    * incorrect — nothing retrieved, or the top chunk fails the relevance
      floor (the same boundary the FilingsAgent router refuses below).
    * ambiguous — top clears the floor but not `floor * ambiguous_factor`:
      relevant-ish but weak, worth a re-query for breadth.
    * correct   — top comfortably clears the floor.
    """
    if not chunks:
        return "incorrect"
    top = chunks[0].score
    if top < floor:
        return "incorrect"
    if top < floor * ambiguous_factor:
        return "ambiguous"
    return "correct"


class CorrectiveRAG:
    """Corrective wrapper around a retriever + LLM client.

    Injected with any object exposing `.retrieve(query) -> list[RetrievedChunk]`
    and a mutable `.top_k` (the real `Retriever`, or a test fake). `base_k`
    defaults to the retriever's own `top_k`, so the FIRST pass is identical to
    a non-corrective retrieval.
    """

    def __init__(
        self,
        retriever,
        client: LLMClient | None = None,
        floor: float = DEFAULT_FLOOR,
        ambiguous_factor: float = AMBIGUOUS_FACTOR,
        max_requeries: int = 2,
        base_k: int | None = None,
    ) -> None:
        self.retriever = retriever
        self.client = client or LLMClient()
        self.floor = floor
        self.ambiguous_factor = ambiguous_factor
        self.max_requeries = max_requeries
        self.base_k = base_k if base_k is not None else getattr(retriever, "top_k", 5)

    def _retrieve(self, query: str, k: int) -> list[RetrievedChunk]:
        """Retrieve at a specific top_k, restoring the retriever's own after.

        Widening `top_k` is the re-query lever: the hybrid arms fetch a larger
        candidate pool and fusion returns more chunks, giving generation more
        context on the retry without touching the query text.
        """
        orig = getattr(self.retriever, "top_k", k)
        try:
            self.retriever.top_k = k
            return self.retriever.retrieve(query)
        finally:
            self.retriever.top_k = orig

    def _widen(self, k: int) -> int:
        return max(k + 1, k * 2)

    def _fallback(
        self,
        grade: str,
        requeries: int,
        attempts: list[CorrectiveAttempt],
        groundedness=None,
    ) -> CorrectiveResult:
        return CorrectiveResult(
            answer=INSUFFICIENT,
            citations=[],
            grade=grade,
            requeries=requeries,
            fallback=True,
            groundedness=groundedness,
            attempts=attempts,
        )

    def answer(self, question: str, threshold: float = DEFAULT_THRESHOLD) -> CorrectiveResult:
        """Run the corrective loop and return the final answer or an honest
        fallback, with the full per-round decision trail."""
        attempts: list[CorrectiveAttempt] = []
        k = self.base_k
        requeries = 0

        while True:
            chunks = self._retrieve(question, k)
            grade = grade_retrieval(chunks, self.floor, self.ambiguous_factor)

            # Weak retrieval: re-query for breadth if we have budget, else
            # refuse rather than generate over irrelevant context.
            if grade == "incorrect":
                attempts.append(
                    CorrectiveAttempt(query=question, top_k=k, grade=grade, n_chunks=len(chunks))
                )
                if requeries < self.max_requeries:
                    requeries += 1
                    k = self._widen(k)
                    continue
                return self._fallback(grade, requeries, attempts)

            # Present-but-weak: try to strengthen retrieval before committing.
            if grade == "ambiguous" and requeries < self.max_requeries:
                attempts.append(
                    CorrectiveAttempt(query=question, top_k=k, grade=grade, n_chunks=len(chunks))
                )
                requeries += 1
                k = self._widen(k)
                continue

            # Good enough (or ambiguous with no budget left) -> generate, then
            # check the produced answer against the very chunks it used.
            prompt = build_rag_prompt(question, chunks)
            raw = self.client.generate(prompt)
            report = check_groundedness(raw, [c.chunk.text for c in chunks], threshold=threshold)
            attempts.append(
                CorrectiveAttempt(
                    query=question,
                    top_k=k,
                    grade=grade,
                    n_chunks=len(chunks),
                    generated=True,
                    groundedness=report,
                )
            )

            if report.flagged():
                # The answer strayed from its sources. Re-query for better
                # context if we can; otherwise fall back honestly rather than
                # surfacing an ungrounded answer.
                if requeries < self.max_requeries:
                    requeries += 1
                    k = self._widen(k)
                    continue
                return self._fallback(grade, requeries, attempts, groundedness=report)

            return CorrectiveResult(
                answer=raw,
                citations=chunks,
                grade=grade,
                requeries=requeries,
                fallback=False,
                groundedness=report,
                attempts=attempts,
            )
