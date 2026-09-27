"""Agent handoff — peer-to-peer context-transfer protocol (Phase 5).

The roadmap (Phase 5, line 973) calls for an agent HANDOFF / context-transfer
protocol — the OpenAI-Swarm pattern: an agent, mid-task, decides it is the
wrong agent (or lacks inputs) and transfers **context AND control** to the next
agent, which continues the task; control can then return. Each agent has clear
entry/exit criteria, and the emergent-behavior guard (line 912) must stop
infinite loops / circular delegation.

This is deliberately distinct from `SupervisorAgent` (also Phase 5), which is
HUB-AND-SPOKE: it classifies once, fans out to specialists that never talk to
each other, and merges. Handoff is SEQUENTIAL and PEER-TO-PEER: A runs, hands
to B, B can hand back to A — no supervisor sits above them.

Design
------
* `HandoffRequest` is the wire-format transfer artifact: `to` (target node),
  `reason` (why), `context` (the payload carried forward). It is a plain
  pydantic model so a transfer is inspectable and serializable — the "context
  transfer" the roadmap names.
* `AgentNode` wraps ONE agent behind a uniform seam so the coordinator is
  agent-agnostic: `invoke(context) -> (result, HandoffRequest | None)` and
  `render(result) -> str`. Returning `None` = "I'm done, settle here"; a
  `render` returning "" means "my result is not a usable final answer" (so a
  refusal never counts as the answer).
* `SwarmCoordinator` runs the chain with hard loop guards (max_hops + cycle
  detection) so runaway / circular delegation terminates cleanly instead of
  looping forever — the roadmap's Strategy-4 target.
* `build_research_data_swarm` is the ready-made Research<->Data assembly: the
  FilingsAgent (Research) discovers mid-task that its corpus lacks the filing
  and hands off to the IngestAgent (Data) to fetch it, which hands back so
  Research can retry over the enriched corpus.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, Field

from app.agents.schemas import HandoffHop, HandoffResult
from app.agents.trajectory import AgentTrajectory, Step, tool_call
from app.llm.client import LLMClient

# The coordinator's hop bound. A healthy Research->Data->Research round-trip is
# 3 hops; anything materially longer is a delegation loop, not real work.
DEFAULT_MAX_HOPS = 4


def _swarm_tool(
    node: str,
    args: dict[str, Any] | None = None,
    note: str = "",
    ok: bool = True,
) -> Step:
    """A `handoff.<node>` tool Step with `node` stamped.

    The coordinator is a hand-built loop, not a `@traced_node` graph, so
    nothing back-fills the node name onto its tool steps. Stamping it here is
    what makes `trajectory.reached(node)` true and keeps every tool step tied
    to the turn that emitted it.
    """
    step = tool_call(f"handoff.{node}", args, note=note, ok=ok)
    step.node = node
    return step


class HandoffRequest(BaseModel):
    """A request to transfer context AND control to another agent.

    Emitted by an `AgentNode.invoke` when its exit criterion fires. `context`
    is the payload merged into the running context before the target node runs
    — the accumulated question/symbols/prior-findings that travel with control.
    """

    to: str  # target node name
    reason: str = ""  # human-readable exit criterion ("no documents for this")
    context: dict[str, Any] = Field(default_factory=dict)


class AgentNode(Protocol):
    """Uniform seam wrapping one agent so the coordinator is agent-agnostic."""

    name: str

    def invoke(self, context: dict[str, Any]) -> tuple[Any, "HandoffRequest | None"]:
        """Run over the transferred context; optionally request a handoff.

        Returns `(result, request)`. `request is None` => settle here with this
        result. `request` set => transfer control to `request.to`.
        """
        ...

    def render(self, result: Any) -> str:
        """Render this agent's result as final answer text.

        Return "" when the result is NOT a usable answer (e.g. a refusal), so a
        settle on a refusal produces an empty answer, not a fake one.
        """
        ...


class SwarmCoordinator:
    """Runs a peer-to-peer handoff chain with hard loop guards.

    `nodes` maps node name -> AgentNode; `entry` is where the chain starts.
    `run` invokes the current node, records a `HandoffHop`, and — if the node
    returned a `HandoffRequest` — merges its context and moves to the target;
    otherwise it settles. Termination is guaranteed by TWO guards so a runaway
    or circular delegation ends cleanly instead of looping:

      1. `max_hops` — a hard bound on total turns (resolution "max_hops"). This
         is the guard that trips first on a tight 2-node ping-pong (a->b->a...),
         since that reaches the hop bound before any edge/visit repeats.
      2. cycle detection — the same (from -> to) edge requested twice, or a node
         about to be visited a 3rd time, ends with resolution "cycle". This is
         what catches a longer circular delegation (e.g. a 3+ node ring) before
         it burns the whole hop budget.

    Whichever fires first wins; with the default `max_hops=4` the hop bound
    dominates short cycles and the cycle detector dominates longer rings.

    A handoff to an unknown node ends with "unknown_target"; a node raising is
    caught, recorded as a failed hop, and ends with "error". Only a node that
    settles with a non-empty rendered answer yields resolution "settled".
    """

    def __init__(
        self,
        nodes: dict[str, AgentNode],
        entry: str,
        max_hops: int = DEFAULT_MAX_HOPS,
    ) -> None:
        if entry not in nodes:
            raise ValueError(f"entry node {entry!r} not in nodes {sorted(nodes)}")
        self.nodes = nodes
        self.entry = entry
        self.max_hops = max_hops

    def run(self, question: str, context: dict[str, Any] | None = None) -> HandoffResult:
        ctx: dict[str, Any] = {"question": question, **(context or {})}
        path: list[str] = []
        hops: list[HandoffHop] = []
        steps: list[Step] = []
        visits: dict[str, int] = {}
        edges: set[tuple[str, str]] = set()

        current = self.entry
        resolution = ""
        error = ""
        answer = ""

        while True:
            # Guard 1: hop bound. Checked before invoking so the chain can never
            # exceed max_hops turns.
            if len(hops) >= self.max_hops:
                resolution = "max_hops"
                break

            node = self.nodes.get(current)
            if node is None:
                # An earlier hop handed off to a name that isn't a node. Stamp
                # the failed tool step with `current` so `reached()` sees the
                # attempt; no node-visit step (it's not a real node, so it
                # stays out of `path`/`nodes()`).
                resolution = "unknown_target"
                error = f"unknown handoff target: {current!r}"
                hops.append(HandoffHop(agent=current, ok=False, note="unknown target"))
                steps.append(_swarm_tool(current, ok=False, note="unknown target"))
                break

            path.append(current)
            visits[current] = visits.get(current, 0) + 1
            # A node-visit Step (kind="node") per real turn, so the swarm's
            # trajectory reports its path via `nodes()` exactly like the
            # graph agents' `@traced_node` does — the hand-built loop has no
            # decorator, so it stamps the visit itself.
            steps.append(Step(node=current, kind="node"))

            try:
                result, request = node.invoke(ctx)
            except Exception as exc:  # noqa: BLE001 — a node failing must not crash the swarm
                resolution = "error"
                error = f"{current}: {exc}"
                hops.append(HandoffHop(agent=current, ok=False, note=str(exc)))
                steps.append(_swarm_tool(current, ok=False, note=type(exc).__name__))
                break

            if request is None:
                # Settle: this node is done. Its rendered answer is the result
                # (empty string if the node considers its result non-usable).
                answer = node.render(result)
                hops.append(HandoffHop(agent=current, ok=True, note="settled"))
                steps.append(_swarm_tool(current, note="settled"))
                resolution = "settled"
                break

            # A handoff was requested. Record the hop, then apply the guards
            # BEFORE moving, so a circular request terminates rather than looping.
            edge = (current, request.to)
            hops.append(
                HandoffHop(
                    agent=current,
                    ok=True,
                    handoff_to=request.to,
                    reason=request.reason,
                    note="handoff",
                )
            )
            steps.append(
                _swarm_tool(
                    current,
                    {"to": request.to},
                    note=request.reason or "handoff",
                )
            )
            # Merge the transferred context forward (context AND control).
            ctx = {**ctx, **(request.context or {})}

            # Guard 2: cycle detection — a repeated edge or an imminent 3rd
            # visit to the target is circular delegation, not progress.
            if edge in edges or visits.get(request.to, 0) >= 2:
                resolution = "cycle"
                break
            edges.add(edge)
            current = request.to

        return HandoffResult(
            question=question,
            path=path,
            hops=hops,
            answer=answer,
            resolution=resolution,
            error=error,
            trajectory=AgentTrajectory(steps=steps),
        )


# ---------------------------------------------------------------------------
# Ready-made Research <-> Data assembly
# ---------------------------------------------------------------------------
class _ResearchNode:
    """Research agent: answer over the filing corpus, else hand off to Data.

    Rebuilds a FRESH FilingsAgent over `filings_dir` on every invocation, so the
    retry leg (after Data ingests) sees the just-written documents — the corpus
    is immutable per FilingsService instance, a new instance re-scans disk. Its
    exit criterion: the FilingsAgent routed to `no_answer` (its corpus lacks a
    relevant filing) AND Data hasn't already been tried this chain -> hand off to
    Data. Otherwise it settles (answer text on success, "" on a refusal).
    """

    name = "research"

    def __init__(self, filings_dir: Path, client: LLMClient, data_node: str = "data") -> None:
        self.filings_dir = Path(filings_dir)
        self.client = client
        self.data_node = data_node

    def _build_agent(self):
        # Imported lazily so the module has no hard dependency cycle and the
        # (heavier) FilingsService construction only happens when a swarm runs.
        from app.agents.filings import FilingsAgent
        from mcp_servers.filings.service import FilingsService, _load_corpus_dir

        # An empty corpus dir would crash BM25 construction (division by zero);
        # it is not an error but the very condition that should hand off to Data.
        # Return None to signal "nothing to search yet".
        if not _load_corpus_dir(self.filings_dir):
            return None
        service = FilingsService.from_directory(self.filings_dir, client=self.client)
        return FilingsAgent(retriever=service._retriever, client=self.client)

    def invoke(self, context: dict[str, Any]) -> tuple[Any, HandoffRequest | None]:
        question = context.get("question") or ""
        agent = self._build_agent()
        result = agent.run(question) if agent is not None else None
        # Exit criterion: no relevant documents AND Data not yet attempted. An
        # empty corpus (agent is None) OR a FilingsAgent refusal both mean "I
        # have no filing for this" — hand off to Data the first time only.
        refused = result is None or result.routed == "no_answer"
        if refused and not context.get("data_attempted"):
            symbols = context.get("symbols") or []
            return result, HandoffRequest(
                to=self.data_node,
                reason="no relevant filings in corpus",
                context={"question": question, "symbols": symbols},
            )
        # Settle: either we answered, or Data already ran and we still can't.
        return result, None

    def render(self, result: Any) -> str:
        # Only a successful generate carries a real answer; a refusal renders "".
        if result is not None and result.ok() and result.answer is not None:
            return result.answer.answer
        return ""


class _DataNode:
    """Data agent: ingest the requested filings, then hand back to Research.

    Wraps an IngestAgent whose `filings_dir` is the swarm's shared dir, so what
    it writes is exactly what Research rebuilds over. It ALWAYS hands back to
    Research with `data_attempted=True` merged in — a one-shot flag that makes
    Research's exit criterion fire at most once, so the chain uses each edge
    exactly once by construction (the generic cycle guard is the backstop).
    """

    name = "data"

    def __init__(self, ingest_agent: Any, research_node: str = "research") -> None:
        self.ingest_agent = ingest_agent
        self.research_node = research_node

    def invoke(self, context: dict[str, Any]) -> tuple[Any, HandoffRequest | None]:
        symbols = context.get("symbols") or None
        result = self.ingest_agent.run(symbols)
        return result, HandoffRequest(
            to=self.research_node,
            reason="filings ingested, retry retrieval",
            context={"data_attempted": True},
        )

    def render(self, result: Any) -> str:
        # Data is never the settling agent (it always hands back); if the guards
        # ever force a settle here, it has no user-facing answer.
        return ""


def build_research_data_swarm(
    filings_dir: Path | str,
    ingest_agent: Any,
    client: LLMClient | None = None,
    max_hops: int = DEFAULT_MAX_HOPS,
) -> SwarmCoordinator:
    """Wire the Research<->Data handoff swarm over a shared filings dir.

    `ingest_agent` MUST write to `filings_dir` (its `IngestAgent.filings_dir`
    == this dir) so the documents it fetches are the ones Research rebuilds
    over on the retry leg. `client` is the LLM the rebuilt FilingsAgent uses.
    """
    client = client or LLMClient()
    research = _ResearchNode(Path(filings_dir), client)
    data = _DataNode(ingest_agent)
    return SwarmCoordinator(
        {research.name: research, data.name: data},
        entry=research.name,
        max_hops=max_hops,
    )
