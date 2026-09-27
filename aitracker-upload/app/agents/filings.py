"""FilingsAgent — a LangGraph agent that answers a question over the corpus.

Graph shape (hand-built StateGraph):

    retrieve -> (any chunks?) -> generate -> finalize
                          \\-> no_answer -> finalize

Design notes
------------
* `retrieve` is a real, observable tool call on the same `Retriever`
  FilingsService builds — splitting it from `generate` is what makes the
  "always search before answering" guarantee checkable in the trajectory.
* `generate` reuses `build_rag_prompt` + the agent's own LLMClient, so the
  prompt hash matches the committed RAG fixtures byte-for-byte.
* `no_answer` performs NO LLM call — routing to it means the agent admits
  it cannot answer, and no fixture is needed for that path. This is the
  anti-hallucination boundary: refuse rather than invent.
"""
from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.schemas import FilingsAgentResult
from app.agents.trajectory import AgentTrajectory, Step, llm_call, tool_call, traced_node
from app.llm.client import LLMClient
from app.rag.generator import build_rag_prompt, format_citations
from app.rag.groundedness import check_answer_result
from app.rag.retriever import Retriever
from app.rag.schemas import RetrievedChunk
from mcp_servers.filings.schemas import AnswerResult, Citation

REFUSAL = "I cannot answer this from the provided documents."

# Router relevance floor. The corpus is small and BM25 returns *something*
# for almost any query, so `len(chunks)==0` can never fire — a score-blind
# router would "answer" out-of-corpus questions from irrelevant chunks. A
# query is answerable only if its top fused score clears this floor; below
# it the agent routes to `no_answer` and refuses (no LLM call). Measured
# against the committed corpus: in-corpus tops are ~0.0325-0.0328,
# out-of-corpus ~0.0164, so 0.02 separates them cleanly.
RELEVANCE_FLOOR = 0.02


class FilingsState(TypedDict, total=False):
    question: str
    chunks: list[RetrievedChunk]
    prompt: str
    raw_answer: str
    routed: str
    error: str
    # Corrective RAG (opt-in): the loop can override the cited chunks (it may
    # widen top_k), fall back honestly, and carry its own groundedness report.
    crag_citations: list[RetrievedChunk]
    corrective_fallback: bool
    crag_groundedness: Any
    # Trajectory accumulates across nodes via the list-add reducer.
    steps: Annotated[list[Step], operator.add]


def build_filings_graph(retriever: Retriever, client: LLMClient, corrective: bool = False):
    """Compile the filings agent's state graph over an injected retriever+client.

    When `corrective` is True the `generate` node delegates to `CorrectiveRAG`
    (retrieve -> grade -> re-query/fall back) instead of a single generation.
    The router's below-floor refusal remains the 'incorrect' gate; corrective
    mode adds ambiguous-retrieval re-query + a groundedness-gated honest
    fallback on top. Default False keeps the graph byte-identical to the
    committed path.
    """

    @traced_node("retrieve")
    def retrieve(state: FilingsState) -> dict:
        question = (state.get("question") or "").strip()
        if not question:
            step = tool_call("filings.retriever.retrieve", ok=False, note="empty question")
            return {"chunks": [], "error": "empty question", "steps": [step]}
        chunks = retriever.retrieve(question)
        step = tool_call(
            "filings.retriever.retrieve",
            {"question": question},
            note=f"{len(chunks)} chunks",
        )
        return {"chunks": chunks, "steps": [step]}

    def route_after_retrieve(state: FilingsState) -> str:
        chunks = state.get("chunks") or []
        if not chunks:
            return "no_answer"
        # Score-aware: BM25 returns *something* for almost any query, so the
        # empty check alone can't stop an out-of-corpus question. Refuse when
        # even the top chunk fails to clear the relevance floor.
        if chunks[0].score < RELEVANCE_FLOOR:
            return "no_answer"
        return "generate"

    @traced_node("generate", kind="node")
    def generate(state: FilingsState) -> dict:
        chunks = state.get("chunks") or []
        question = state.get("question") or ""
        if corrective:
            # Delegate to the corrective loop over the SAME retriever+client:
            # it may widen top_k, re-query weak/ungrounded retrieval, and fall
            # back to an honest "insufficient evidence" answer. The router
            # already cleared the below-floor case, so CRAG here handles the
            # ambiguous-retrieval and ungrounded-generation cases.
            from app.rag.corrective import CorrectiveRAG

            crag = CorrectiveRAG(retriever, client=client, floor=RELEVANCE_FLOOR)
            try:
                res = crag.answer(question)
            except Exception as exc:  # LLM/parse failure -> degrade, don't crash
                step = llm_call("llm.generate", note=type(exc).__name__, ok=False)
                return {"routed": "generate", "error": f"generate_failed: {exc}", "steps": [step]}
            note = (
                f"corrective fallback after {res.requeries} re-quer"
                + ("y" if res.requeries == 1 else "ies")
                if res.fallback
                else f"corrective ok ({res.requeries} re-queries, {len(res.citations)} chunks)"
            )
            step = llm_call("llm.generate", note=note)
            return {
                "routed": "generate",
                "raw_answer": res.answer,
                "crag_citations": res.citations,
                "corrective_fallback": res.fallback,
                "crag_groundedness": res.groundedness,
                "steps": [step],
            }
        prompt = build_rag_prompt(question, chunks)
        try:
            raw = client.generate(prompt)
        except Exception as exc:  # LLM/parse failure -> degrade, don't crash
            step = llm_call("llm.generate", note=type(exc).__name__, ok=False)
            return {"routed": "generate", "error": f"generate_failed: {exc}", "steps": [step]}
        step = llm_call("llm.generate", note=f"{len(chunks)} chunks in prompt")
        return {"routed": "generate", "raw_answer": raw, "steps": [step]}

    @traced_node("no_answer")
    def no_answer(state: FilingsState) -> dict:
        # No LLM call: the corpus has nothing for this question.
        return {"routed": "no_answer", "raw_answer": REFUSAL, "_note": "no chunks retrieved"}

    @traced_node("finalize")
    def finalize(state: FilingsState) -> dict:
        return {"_note": "done"}

    graph = StateGraph(FilingsState)
    graph.add_node("retrieve", retrieve)
    graph.add_node("generate", generate)
    graph.add_node("no_answer", no_answer)
    graph.add_node("finalize", finalize)

    graph.add_edge(START, "retrieve")
    graph.add_conditional_edges(
        "retrieve",
        route_after_retrieve,
        {"generate": "generate", "no_answer": "no_answer"},
    )
    graph.add_edge("generate", "finalize")
    graph.add_edge("no_answer", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


class FilingsAgent:
    """Question -> cited answer over the corpus, with a recorded trajectory."""

    def __init__(
        self,
        retriever: Retriever | None = None,
        client: LLMClient | None = None,
        recursion_limit: int = 25,
        corrective: bool = False,
    ) -> None:
        from mcp_servers.filings.service import from_env

        self.corrective = corrective
        self._service = None
        if retriever is None:
            # Reuse the exact retriever FilingsService builds so the RAG
            # prompt hashes (and thus the committed fixtures) line up.
            # from_env() (not "fixture") honours FILINGS_MODE: the default is
            # still "fixture" (hermetic, unchanged), but FILINGS_MODE=live makes
            # a populated data/filings/ corpus reach the served agent (/api/ask).
            self._service = from_env()
            retriever = self._service._retriever
        self.retriever = retriever
        self.client = client or LLMClient()
        self.recursion_limit = recursion_limit
        self.graph = build_filings_graph(self.retriever, self.client, corrective=corrective)

    def run(self, question: str) -> FilingsAgentResult:
        state: FilingsState = {"question": question, "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        routed = final.get("routed", "")
        raw = final.get("raw_answer", "")
        answer = None
        groundedness = None
        corrective_fallback = bool(final.get("corrective_fallback", False))
        if raw:
            # Only the generate path grounds on retrieved chunks; a refusal
            # carries no citations (there was nothing relevant to cite). In
            # corrective mode the loop decides the final citation set (it may
            # widen top_k, or drop all citations on an honest fallback).
            if routed == "generate":
                if self.corrective:
                    crag_chunks = final.get("crag_citations") or []
                else:
                    crag_chunks = final.get("chunks") or []
            else:
                crag_chunks = []
            answer = AnswerResult(
                answer=raw,
                citations=[
                    Citation(
                        document_id=rc.document_id or rc.chunk.document_id,
                        chunk_index=rc.chunk.chunk_index,
                        text=rc.chunk.text,
                        score=rc.score,
                        source=rc.source,
                    )
                    for rc in crag_chunks
                ],
                sources_footer=format_citations(crag_chunks),
            )
            # Hallucination detection (Phase 6): check the GENERATED answer
            # against the very chunks it was produced over. The refusal path
            # is not "an answer that might be ungrounded" — it is an admission
            # of no evidence — so it carries no groundedness report. In
            # corrective mode the loop already computed the report (over the
            # widened chunk set / or None on a pre-generation fallback); reuse
            # it rather than re-grounding against a possibly-empty citation set.
            if routed == "generate":
                if self.corrective:
                    groundedness = final.get("crag_groundedness")
                else:
                    groundedness = check_answer_result(answer)
        return FilingsAgentResult(
            question=question,
            answer=answer,
            routed=routed,
            error=final.get("error", ""),
            groundedness=groundedness,
            corrective_fallback=corrective_fallback,
            trajectory=AgentTrajectory(steps=final.get("steps", [])),
        )
