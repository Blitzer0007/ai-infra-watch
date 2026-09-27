"""Corrective RAG tests — retrieve -> grade -> re-query / honest fallback.

The roadmap's "and evaluated" bar (Phase 6, line 1046): golden behavioral
cases on deliberately-weak retrieval that assert the loop *re-queries or falls
back* rather than hallucinating. All hermetic (no real LLM, no fixtures):

  * a scripted retriever forces each retrieval grade without fighting RRF
    score math (its chunks carry hand-set scores, and widening top_k can
    "unlock" better chunks, mirroring a real broader pass);
  * a fake client records generation count + returns a grounded or a
    zero-overlap answer on demand, so the groundedness gate can be exercised.

The load-bearing assertions:
  * below-floor retrieval  -> NO generation at all (generations == 0), honest
    INSUFFICIENT fallback (refuse, don't invent on bad context);
  * ungrounded generation  -> after the re-query budget, fall back rather than
    surface the ungrounded text (the groundedness signal gates output);
  * strong retrieval        -> generate exactly once, no re-query, real answer.
"""
from __future__ import annotations

import pytest

from app.rag.corrective import (
    AMBIGUOUS_FACTOR,
    DEFAULT_FLOOR,
    INSUFFICIENT,
    CorrectiveRAG,
    grade_retrieval,
)
from app.rag.schemas import Chunk, RetrievedChunk

FLOOR = DEFAULT_FLOOR  # 0.02
# A grounded answer whose vocabulary is a superset of the source chunk.
SOURCE_TEXT = "NVIDIA data center revenue grew forty percent to a record level."
GROUNDED_ANSWER = "NVIDIA data center revenue grew forty percent to a record level [1]."
# Zero shared vocabulary with any source -> the grounding heuristic flags it.
UNGROUNDED_ANSWER = "The weather in Paris is sunny and croissants taste delicious today."


def _chunk(text: str, score: float, doc: str = "nvda", idx: int = 0) -> RetrievedChunk:
    return RetrievedChunk(
        chunk=Chunk(document_id=doc, chunk_index=idx, text=text),
        score=score,
        rank=idx,
        source="fused",
        document_id=doc,
    )


class ScriptedRetriever:
    """Duck-typed retriever whose result is scripted per current `top_k`.

    `by_k` maps a top_k value to the chunk list retrieve() returns at that k.
    The chunk set for the *largest key <= current top_k* is returned, so
    widening top_k past a threshold "unlocks" a stronger chunk set — the exact
    lever CorrectiveRAG pulls on a re-query, without any real index.
    """

    def __init__(self, by_k: dict[int, list[RetrievedChunk]]) -> None:
        self.by_k = by_k
        self.top_k = min(by_k)
        self.calls: list[tuple[str, int]] = []

    def retrieve(self, query: str) -> list[RetrievedChunk]:
        self.calls.append((query, self.top_k))
        eligible = [k for k in self.by_k if k <= self.top_k]
        key = max(eligible) if eligible else min(self.by_k)
        return list(self.by_k[key])


class FakeClient:
    """Records generation count; returns a fixed answer (grounded by default)."""

    def __init__(self, answer: str = GROUNDED_ANSWER) -> None:
        self.answer = answer
        self.generations = 0

    def generate(self, prompt: str, **kwargs) -> str:
        self.generations += 1
        return self.answer


# --- grade_retrieval unit table -------------------------------------------
def test_grade_retrieval_table():
    # empty -> incorrect (nothing to answer over)
    assert grade_retrieval([]) == "incorrect"
    # top below the floor -> incorrect (out-of-corpus)
    assert grade_retrieval([_chunk("x", FLOOR - 0.01)]) == "incorrect"
    # clears floor but not floor*factor -> ambiguous (present but weak)
    ambiguous_score = FLOOR + (FLOOR * (AMBIGUOUS_FACTOR - 1)) / 2
    assert grade_retrieval([_chunk("x", ambiguous_score)]) == "ambiguous"
    # comfortably above floor*factor -> correct
    assert grade_retrieval([_chunk("x", FLOOR * AMBIGUOUS_FACTOR + 0.05)]) == "correct"


# --- strong retrieval: generate once, no re-query --------------------------
def test_strong_retrieval_generates_once():
    retr = ScriptedRetriever({2: [_chunk(SOURCE_TEXT, 0.08)]})
    fake = FakeClient(GROUNDED_ANSWER)
    res = CorrectiveRAG(retr, client=fake, floor=FLOOR).answer("How did NVIDIA revenue do?")

    assert res.grade == "correct"
    assert res.requeries == 0
    assert res.fallback is False
    assert res.answer == GROUNDED_ANSWER
    assert res.citations, "a real answer carries its grounding chunks"
    assert fake.generations == 1
    assert res.groundedness is not None and res.groundedness.grounded is True
    # The decision trail records the single generating attempt.
    assert len(res.attempts) == 1
    assert res.attempts[0].generated is True


# --- below-floor retrieval: honest fallback, NEVER generates ---------------
def test_below_floor_falls_back_without_generating():
    # Every pass (at any widened top_k) stays below the floor.
    retr = ScriptedRetriever({2: [_chunk("unrelated", FLOOR - 0.01)]})
    fake = FakeClient(GROUNDED_ANSWER)
    res = CorrectiveRAG(retr, client=fake, floor=FLOOR, max_requeries=2).answer("q")

    assert res.grade == "incorrect"
    assert res.fallback is True
    assert res.answer == INSUFFICIENT
    assert not res.citations, "an honest fallback cites nothing"
    # The anti-hallucination bar: it refused to generate over bad context.
    assert fake.generations == 0
    # It exhausted its re-query budget before giving up.
    assert res.requeries == 2
    assert len(retr.calls) == 3  # base pass + 2 re-queries


# --- ambiguous retrieval: a wider re-query recovers a real answer ----------
def test_ambiguous_requery_recovers():
    ambiguous = _chunk("partial nvidia mention", FLOOR + 0.005)  # clears floor, < floor*1.5
    strong = _chunk(SOURCE_TEXT, 0.08)
    # base_k=2 -> ambiguous; widening to >=4 unlocks the strong chunk.
    retr = ScriptedRetriever({2: [ambiguous], 4: [strong]})
    fake = FakeClient(GROUNDED_ANSWER)
    res = CorrectiveRAG(retr, client=fake, floor=FLOOR).answer("q")

    assert res.requeries >= 1, "ambiguous first pass must trigger a re-query"
    assert res.fallback is False
    assert res.grade == "correct"
    assert res.answer == GROUNDED_ANSWER
    assert fake.generations == 1, "generates only after retrieval recovered"
    assert res.groundedness is not None and res.groundedness.grounded is True


# --- ungrounded generation: the groundedness gate forces a fallback --------
def test_ungrounded_generation_falls_back():
    # Retrieval is always 'correct', but the model strays off-source every time.
    retr = ScriptedRetriever({2: [_chunk(SOURCE_TEXT, 0.08)]})
    fake = FakeClient(UNGROUNDED_ANSWER)
    res = CorrectiveRAG(retr, client=fake, floor=FLOOR, max_requeries=2).answer("q")

    assert res.fallback is True
    assert res.answer == INSUFFICIENT
    # It tried the full budget (base + 2 re-queries) before falling back.
    assert fake.generations == 3
    assert res.requeries == 2
    # The offending groundedness report is preserved for inspection.
    assert res.groundedness is not None and res.groundedness.flagged() is True


# --- FilingsAgent parity (opt-in corrective mode) --------------------------
ANSWERABLE = "How much did NVIDIA data center revenue grow?"
NO_ANSWER = "Who won the 2010 FIFA World Cup?"


def _corrective_filings_agent():
    from app.agents import FilingsAgent
    from app.llm.client import LLMClient
    from mcp_servers.filings.service import from_env

    svc = from_env("fixture")
    return FilingsAgent(
        retriever=svc._retriever,
        client=LLMClient(provider="stub", model="stub"),
        corrective=True,
    )


def test_filings_corrective_answerable_stays_grounded():
    # An in-corpus question grades 'correct' at base top_k, so corrective mode
    # generates exactly once over the SAME chunks as the default path (same
    # prompt hash -> committed fixture still matches) and grounds cleanly.
    result = _corrective_filings_agent().run(ANSWERABLE)
    assert result.ok()
    assert result.routed == "generate"
    assert result.corrective_fallback is False
    assert result.groundedness is not None and result.groundedness.grounded is True


def test_filings_corrective_out_of_corpus_refuses():
    # Below the relevance floor the router refuses BEFORE generate (no LLM
    # call), same as the default path — corrective mode never engages.
    result = _corrective_filings_agent().run(NO_ANSWER)
    assert not result.ok()
    assert result.routed == "no_answer"
    assert not any(s.kind == "llm" for s in result.trajectory.steps)
    assert result.corrective_fallback is False
