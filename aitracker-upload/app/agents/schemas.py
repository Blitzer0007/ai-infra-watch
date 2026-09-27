"""Agent result schemas — typed outputs wrapping the existing domain models.

These embed (not replace) `MarketSynthesis` and `AnswerResult` and add the
run trajectory, so a result is a complete, self-describing record: the answer
plus the path taken to reach it. Pure pydantic — `model_dump_json()` is ready
for MCP exposure and a Phase-5 supervisor.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.agents.trajectory import AgentTrajectory
from app.rag.schemas import GroundednessReport
from app.synthesis.pipeline import MarketSynthesis
from mcp_servers.filings.schemas import AnswerResult, FilingRef

# One canonical marker for a run-ending (as opposed to per-item, degrade-and-
# continue) failure. Producers stamp an error string with this prefix; the
# `ok()` predicates below treat only prefixed errors as fatal. Kept in ONE
# place so the produce side (agents) and the judge side (these schemas) can't
# drift on the literal.
FATAL_PREFIX = "fatal:"


class MarketAgentResult(BaseModel):
    """Output of MarketAgent.run()."""

    synthesis: MarketSynthesis | None = None
    symbols: list[str] = Field(default_factory=list)
    error: str = ""
    # Post-generation grounding of `synthesis.summary` against the data facts
    # it was built from. None when synthesis didn't run (degraded / no data).
    groundedness: GroundednessReport | None = None
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def ok(self) -> bool:
        return self.synthesis is not None and not self.error


class FilingsAgentResult(BaseModel):
    """Output of FilingsAgent.run()."""

    question: str
    answer: AnswerResult | None = None
    routed: str = ""  # "generate" | "no_answer"
    error: str = ""
    # Post-generation grounding of `answer.answer` against its citations. None
    # on the refusal path (no answer was generated -> nothing to check).
    groundedness: GroundednessReport | None = None
    # True when Corrective RAG fell back to an honest "insufficient evidence"
    # answer rather than generating over weak/ungrounded context (Phase 6 #2).
    corrective_fallback: bool = False
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def ok(self) -> bool:
        # A refusal (routed to no_answer) still carries answer text, but it
        # is NOT a successful answer — success means the generate path ran
        # over relevant chunks with no error.
        return self.routed == "generate" and self.answer is not None and not self.error


class SupervisorResult(BaseModel):
    """Output of SupervisorAgent.run() — the multi-agent orchestration record.

    Embeds (not replaces) the specialist result models, so the nested
    `.market` / `.filings` keep their own inspectable trajectories while
    `.trajectory` records the top-level orchestration path (classify -> route
    -> {market|filings} -> merge). Pure pydantic -> `model_dump_json()` ready
    for MCP exposure.
    """

    question: str
    route: str = ""  # "market" | "filings" | "both"
    market: MarketAgentResult | None = None
    filings: FilingsAgentResult | None = None
    summary: str = ""
    error: str = ""
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def ok(self) -> bool:
        # A usable orchestration delivered a merged summary from at least one
        # specialist that succeeded. A partial failure (one branch down) is
        # still ok — the surviving specialist's answer is real; branch errors
        # are recorded in `.error` for observability, not treated as a total
        # failure. Only when NO specialist succeeds (or nothing merged) is the
        # run not ok.
        succeeded = (self.market is not None and self.market.ok()) or (
            self.filings is not None and self.filings.ok()
        )
        return bool(self.summary) and succeeded

    def degraded(self) -> bool:
        # True when the run is ok() overall but did NOT go entirely cleanly:
        # either a delegation crashed (recorded in `.error`) or an engaged
        # specialist returned an unsuccessful result of its own (present but
        # `.ok()` is False — e.g. a filings answer that couldn't be generated).
        # This lets a caller tell a fully-clean answer from a usable-but-partial
        # one WITHOUT overloading `ok()`, which stays a partial-success signal
        # by contract (a survivor's answer is still real). Not ok() -> not
        # meaningfully "degraded", it's a total failure, so return False.
        if not self.ok():
            return False
        branch_failed = any(
            r is not None and not r.ok() for r in (self.market, self.filings)
        )
        return bool(self.error) or branch_failed

    def hallucination_flagged(self) -> bool:
        # True when an engaged specialist RAN and produced text that its own
        # groundedness check flagged as ungrounded. Orthogonal to degraded():
        # degraded = a branch failed to run; hallucination_flagged = a branch
        # ran but its answer strayed from its sources. A caller can surface the
        # two independently (an answer can be complete-but-ungrounded, or
        # partial-but-grounded). Absent reports (branch not engaged, or refusal)
        # never flag.
        for r in (self.market, self.filings):
            if r is not None and r.groundedness is not None and r.groundedness.flagged():
                return True
        return False


class IngestAgentResult(BaseModel):
    """Output of IngestAgent.run() — the data-acquisition record.

    `fetched` are the FilingRefs downloaded + ingested this run; `skipped`
    are accessions already in the corpus manifest (dedupe hits); `errors`
    are per-symbol degradations (no CIK, EDGAR error, empty doc) — recorded
    for observability, NOT treated as fatal. Pure pydantic -> serializes for
    MCP exposure and a dashboard ingest report.
    """

    targets: list[str] = Field(default_factory=list)
    fetched: list[FilingRef] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)  # accession numbers
    ingested_docs: list[str] = Field(default_factory=list)  # doc_ids
    chunks: int = 0
    errors: list[str] = Field(default_factory=list)
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def ok(self) -> bool:
        # A run is ok if it reached verify without a fatal (graph-level)
        # error. Per-symbol failures are expected and non-fatal: a run that
        # fetched nothing new but ran cleanly (everything deduped, or an
        # empty target set) is still ok. Fatal errors are prefixed FATAL_PREFIX.
        return not any(e.startswith(FATAL_PREFIX) for e in self.errors)


class RotationSignal(BaseModel):
    """One detected rotation between two AI buckets over one time window.

    Rotation = the two legs DIVERGING: the `to_bucket` (inflow) is up while
    the `from_bucket` (outflow) is flat-or-down, with a widening spread. All
    figures are cap-/equal-weighted aggregate percent returns over `window`,
    so a narrator can cite them without inventing causes.
    """

    from_bucket: str  # the leg capital is rotating OUT of (flat/down)
    to_bucket: str    # the leg capital is rotating INTO (up)
    window: str       # "1d" | "5d" | "20d"
    from_return: float  # aggregate % return of the outflow bucket over `window`
    to_return: float    # aggregate % return of the inflow bucket over `window`
    spread: float       # to_return - from_return (>= 0 for a fired signal)
    strength: float = Field(ge=0.0, le=1.0)  # normalized divergence score
    contributors: list[str] = Field(default_factory=list)  # symbols driving it

    def one_line(self) -> str:
        return (
            f"{self.window}: {self.from_bucket} ({self.from_return:+.1f}%) -> "
            f"{self.to_bucket} ({self.to_return:+.1f}%), spread {self.spread:.1f}pp "
            f"(strength {self.strength:.2f})"
        )


class ToolPlan(BaseModel):
    """One routing decision — a tool the router chose to call, with the args it
    built and why. Serialized into `RouterAgentResult.plan` so the routing
    decision is inspectable, not just the outputs.
    """

    tool: str  # qualified name '<server>.<tool>' the router resolved
    arguments: dict[str, Any] = Field(default_factory=dict)
    score: float = 0.0  # strategy relevance score (higher = better match)
    reason: str = ""  # human-readable why-this-tool


class ToolCallRecord(BaseModel):
    """The outcome of executing one ToolPlan against the toolbox."""

    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    ok: bool = True
    output: Any = None  # the unwrapped tool return (JSON-native)
    error: str = ""


class RouterAgentResult(BaseModel):
    """Output of ToolRouterAgent.run() — the dynamic-tool-routing record.

    Unlike the other specialists, this agent has NO hardcoded service deps: it
    discovers whatever tools the connected MCP servers advertise at runtime and
    routes the question to the best-matching one(s). `discovered` is the tool
    catalog it saw; `plan` is what the routing strategy chose; `calls` are the
    executed results. A question that matches no tool yields an empty plan and
    routes straight to finalize (a valid outcome, not a crash). Pure pydantic
    -> `model_dump_json()` ready for MCP exposure / a supervisor.
    """

    question: str
    discovered: list[str] = Field(default_factory=list)  # qualified tool names seen
    plan: list[ToolPlan] = Field(default_factory=list)
    calls: list[ToolCallRecord] = Field(default_factory=list)
    routed: str = ""  # "execute" | "no_route"
    error: str = ""
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def outputs(self) -> dict[str, Any]:
        """Successful tool outputs keyed by qualified tool name."""
        return {c.tool: c.output for c in self.calls if c.ok}

    def ok(self) -> bool:
        # A run is ok if it routed to at least one tool and every executed call
        # succeeded. Matching no tool (empty plan) is NOT ok — the question went
        # unanswered — but it is a clean, recorded outcome, not a failure to run.
        return (
            self.routed == "execute"
            and bool(self.calls)
            and all(c.ok for c in self.calls)
            and not self.error
        )


class HandoffHop(BaseModel):
    """One step in a swarm chain — a single agent's turn with the coordinator.

    `agent` ran, produced a result (`ok` = it settled with a usable answer OR
    handed off cleanly, `False` = it raised), and either transferred control to
    `handoff_to` (with `reason`) or settled (`handoff_to` empty). Pattern-matches
    `ToolPlan`/`Step` style so the hop chain is inspectable and serializable.
    """

    agent: str
    ok: bool = True
    handoff_to: str = ""  # target node it transferred to ("" = it settled here)
    reason: str = ""      # why it handed off (its exit criterion)
    note: str = ""


class HandoffResult(BaseModel):
    """Output of SwarmCoordinator.run() — the peer-to-peer handoff record.

    Distinct from `SupervisorResult` (hub-and-spoke, one classify + fan-out):
    this is a SEQUENTIAL chain where each agent may transfer context AND control
    to the next, and control can return. `path` is the ordered node names
    visited; `hops` is the per-turn record; `answer` is the settling agent's
    rendered answer text. `resolution` names WHY the chain ended:

      * "settled"        — an agent finished with a usable answer (the good end)
      * "max_hops"       — hard hop bound tripped (runaway delegation guard)
      * "cycle"          — a repeated edge / re-visit tripped the cycle guard
      * "unknown_target" — an agent handed off to a node that doesn't exist
      * "error"          — a node raised; recorded, chain aborted

    Pure pydantic -> `model_dump_json()` ready for MCP exposure. `.ok()` = a
    clean "settled" end with a non-empty answer and no error.
    """

    question: str
    path: list[str] = Field(default_factory=list)  # node names, in visit order
    hops: list[HandoffHop] = Field(default_factory=list)
    answer: str = ""
    resolution: str = ""
    error: str = ""
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def ok(self) -> bool:
        return self.resolution == "settled" and bool(self.answer) and not self.error


class RotationAgentResult(BaseModel):
    """Output of RotationAgent.run() — the rotation-detection record.

    `hardware` / `application` are the classified legs (universe tags);
    `signals` are the windows where divergence fired (empty = no rotation,
    a valid result, not a failure); `narrative` is the grounded explanation;
    `errors` are per-symbol/bucket degradations, non-fatal unless "fatal:".
    """

    targets: list[str] = Field(default_factory=list)
    hardware: list[str] = Field(default_factory=list)
    application: list[str] = Field(default_factory=list)
    signals: list[RotationSignal] = Field(default_factory=list)
    narrative: str = ""
    errors: list[str] = Field(default_factory=list)
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def fired(self) -> bool:
        """True if any window detected a rotation."""
        return bool(self.signals)

    def ok(self) -> bool:
        # Reaching `explain` cleanly is success — detecting NO rotation is a
        # legitimate outcome (rally != rotation), not an error. Only a fatal
        # (graph-level) failure makes a run not ok.
        return not any(e.startswith(FATAL_PREFIX) for e in self.errors)


class QAObservation(BaseModel):
    """One snapshot of page state the QA agent reasoned over.

    A serializable record of what the browser reported at a step: the URL, a
    reference to the screenshot artifact (a path/id, not the bytes — hermetic),
    the interactable elements the agent saw, and the out-of-band signals a bug
    oracle checks (console errors, the last navigation's HTTP status).
    """

    step: int = 0
    url: str = ""
    screenshot: str = ""  # artifact ref (path/id), not raw bytes
    elements: list[str] = Field(default_factory=list)  # selectors/labels seen
    console_errors: list[str] = Field(default_factory=list)
    http_status: int = 200


class QAAction(BaseModel):
    """One action the policy chose to drive exploration forward.

    `kind` is "click" | "fill" | "navigate" | "stop"; `target` is the selector
    or URL; `value` is fill text. `stop` is the policy declaring the objective
    covered — the clean, self-directed end of the loop (distinct from hitting
    the step budget).
    """

    kind: str = "stop"  # click | fill | navigate | stop
    target: str = ""
    value: str = ""
    reason: str = ""


class BugReport(BaseModel):
    """A defect the agent found: what, where, and the evidence to reproduce it.

    Mirrors the roadmap's bug-report shape — a screenshot ref, the steps that
    led there, and the agent's reasoning (expected vs actual) — so a human can
    reproduce it without rerunning the agent.
    """

    kind: str  # "console_error" | "http_error" | "dead_action" | ...
    url: str = ""
    detail: str = ""
    screenshot: str = ""
    steps: list[str] = Field(default_factory=list)  # human-readable repro trail
    expected: str = ""
    actual: str = ""


class QAAgentResult(BaseModel):
    """Output of QAAgent.run() — the autonomous-exploration record.

    `observations` is the ordered page-state trail; `actions` are what the
    policy drove; `bugs` are the defects the oracles caught; `resolution` is
    why the loop ended ("objective_covered" = policy stopped cleanly,
    "budget" = hit the step ceiling, "error" = a fatal driver failure). Pure
    pydantic -> `model_dump_json()` ready for a report artifact.
    """

    url: str
    objective: str = ""
    observations: list[QAObservation] = Field(default_factory=list)
    actions: list[QAAction] = Field(default_factory=list)
    bugs: list[BugReport] = Field(default_factory=list)
    resolution: str = ""  # objective_covered | budget | error
    error: str = ""
    trajectory: AgentTrajectory = Field(default_factory=AgentTrajectory)

    def found_bugs(self) -> bool:
        return bool(self.bugs)

    def ok(self) -> bool:
        # A QA run is ok when it explored and terminated cleanly (the policy
        # settled or the budget bounded it) with no FATAL driver error.
        # Finding bugs is a SUCCESSFUL outcome — that is the agent's job — so
        # `bugs` does not make a run not-ok. Only a fatal crash does.
        return self.resolution in {"objective_covered", "budget"} and not self.error
