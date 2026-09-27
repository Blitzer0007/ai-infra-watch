"""RAG data model — the shared types for the retrieval layer.

Every chunk carries provenance (document_id + chunk_index) so
downstream answers can be cited and grounded. `RetrievedChunk`
adds the runtime retrieval metadata (score, rank, fusion source);
`CitedAnswer` is the final generator output with citations attached.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class Chunk:
    """One atomic unit of retrievable text with provenance."""

    document_id: str
    chunk_index: int
    text: str
    # Embedded vector, used only by the vector index (sparse in memory
    # at ingest time so we don't keep two copies).
    embedding: tuple[float, ...] | None = None
    # Text used for INDEXING (BM25 + embedding) — may carry a document
    # context prefix (e.g. the company name) so entity identity travels
    # with every chunk. Defaults to `text`. `text` alone is what gets
    # shown/cited in answers; index_text is never displayed.
    index_text: str | None = None

    def __len__(self) -> int:
        return len(self.text)

    def indexed(self) -> str:
        """The text retrieval arms should index (context-prefixed)."""
        return self.index_text if self.index_text is not None else self.text


@dataclass
class RetrievedChunk:
    """A chunk that survived retrieval, with ranking metadata.

    Mutable by design: the retriever re-ranks and re-scores these in
    place as they pass through fusion and reranking stages. (`Chunk`
    itself stays frozen — it's the value that gets cited.)
    """

    chunk: Chunk
    score: float
    rank: int
    source: Literal["bm25", "vector", "fused", "rerank"] = "fused"
    # Identifier of the underlying document this chunk belongs to.
    document_id: str = ""

    def __post_init__(self) -> None:
        # clamp score to 0..1; empty docs never reach here so a 0
        # score just means "lowest of the fused set", not "missing".
        self.score = max(0.0, min(1.0, float(self.score)))


@dataclass
class CitedAnswer:
    """Final RAG answer: response text + the chunks it grounded on."""

    answer: str
    citations: list[RetrievedChunk] = field(default_factory=list)
    # A one-line "source" footer for downstream display, e.g.
    # "Sources: 10-K (2024), 10-Q (2024 Q2)".
    sources_footer: str = ""


# ----------------------------------------------------------------------
# Hallucination detection (groundedness) — Phase 6
# ----------------------------------------------------------------------
@dataclass(frozen=True)
class ClaimCheck:
    """One atomic claim from an answer, graded against the source set.

    `score` is the best lexical grounding score across sources (substring
    match -> 1.0, else stemmed content-token Jaccard); `supported` is the
    verdict at the report's threshold.
    """

    claim: str
    score: float
    supported: bool


@dataclass
class GroundednessReport:
    """Structured result of checking an answer's claims against its sources.

    Emitted POST-generation (no LLM call, no prompt mutation) so it can be
    attached to any already-produced answer without disturbing fixture hashes.

    * `groundedness` — supported claims / total, in [0, 1] (1.0 for an empty
      answer: nothing to hallucinate).
    * `grounded` — no unsupported claims survived (the clean-answer verdict).
    * `claims` — per-claim checks (the audit trail).
    * `unsupported` — the offending claim texts (the "flagged" list).
    * `threshold` — the grounding score below which a claim is unsupported.

    Limitation (honest, not faked): the lexical heuristic detects *fabrication*
    (a claim sharing no vocabulary with any source) but NOT semantic
    *contradiction/negation*. The roadmap's "contradiction detection" is beyond
    token overlap; this leans toward false positives (the safe direction for a
    hallucination gate). See app/assertions/semantic.assert_no_hallucination.
    """

    groundedness: float
    grounded: bool
    claims: list[ClaimCheck] = field(default_factory=list)
    unsupported: list[str] = field(default_factory=list)
    threshold: float = 0.25

    def flagged(self) -> bool:
        """True when at least one claim is unsupported (an ungrounded answer)."""
        return not self.grounded


# ----------------------------------------------------------------------
# Corrective RAG — retrieve -> grade -> re-query / fall back (Phase 6)
# ----------------------------------------------------------------------
@dataclass
class CorrectiveAttempt:
    """One pass of the corrective loop — a fully inspectable decision record.

    Mirrors the agent trajectory discipline: every attempt records the query
    used, the top_k it retrieved at, the retrieval grade, whether it generated
    (vs. refused/re-queried), and the post-generation groundedness if it did.
    """

    query: str
    top_k: int
    grade: str  # "correct" | "ambiguous" | "incorrect"
    n_chunks: int
    generated: bool = False
    groundedness: GroundednessReport | None = None


@dataclass
class CorrectiveResult:
    """Output of CorrectiveRAG.answer() — the retrieve/grade/re-query record.

    `answer` + `citations` are the final answer (or the honest fallback text
    with no citations). `grade` is the FINAL retrieval grade; `requeries` is
    how many re-query rounds ran; `fallback` is True when the loop refused to
    generate over weak/ungrounded context and returned INSUFFICIENT instead;
    `groundedness` is the surviving answer's report (None on a pre-generation
    fallback). `attempts` is the full per-round trail so the loop's decisions
    are auditable, not just its output.
    """

    answer: str
    citations: list[RetrievedChunk] = field(default_factory=list)
    grade: str = ""
    requeries: int = 0
    fallback: bool = False
    groundedness: GroundednessReport | None = None
    attempts: list[CorrectiveAttempt] = field(default_factory=list)
