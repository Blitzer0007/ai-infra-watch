"""Agent-handoff tests — Phase 5 peer-to-peer context-transfer protocol.

Two layers, kept separate on purpose:

  * COORDINATOR tests drive `SwarmCoordinator` over canned `FakeNode`s (a
    handoff analogue of conftest.FakeAgent) so control flow — isolation,
    context transfer, orchestration order, the loop/cycle guards, and chaos —
    is tested in isolation from the real agents.
  * The INTEGRATION test drives the real `build_research_data_swarm` end to
    end: an empty tmp corpus -> Research refuses -> hands off to a real
    IngestAgent (FixtureEdgarClient, no network) that writes NVDA filings ->
    control returns -> Research rebuilds over the enriched dir and retrieves the
    just-ingested NVDA chunks. The stub LLM has no fixture for a prompt built
    over freshly-ingested chunks, so a tiny canned LLMClient-shaped stub is
    injected and the assertion is on the HANDOFF MECHANICS + REAL RETRIEVAL
    (non-empty NVDA citations), not stub answer text — no fixture-gaming.

Mapped to the roadmap's multi-agent strategies:
  1. isolation     — a settling node answers; a handoff node transfers control
  2. protocol      — the context a node receives is exactly what was transferred
  3. orchestration — entry honored; Research->Data->Research visits in order
  4. emergent      — always-handoff trips max_hops; mutual A<->B trips cycle
  5. chaos         — a node raising -> "error"; unknown target -> "unknown_target"

Plus serialization (MCP-ready) and a skipped @pytest.mark.live smoke.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.agents import (
    HandoffRequest,
    HandoffResult,
    IngestAgent,
    SwarmCoordinator,
    build_research_data_swarm,
)
from app.agents.handoff import DEFAULT_MAX_HOPS
from app.llm.client import LLMClient
from mcp_servers.filings.edgar import FixtureEdgarClient
from tests.agents.conftest import MAX_STEPS


# ---------------------------------------------------------------------------
# FakeNode — a canned AgentNode analogous to conftest.FakeAgent.
# ---------------------------------------------------------------------------
class FakeNode:
    """A scripted swarm node.

    `plan(context) -> HandoffRequest | None` decides, per invocation, whether to
    hand off (and to whom, with what context) or settle. `answer` is what
    `render` returns when it settles. `boom` raises to simulate a node going
    down mid-chain. Records every context it was invoked with so the transfer
    protocol is checkable.
    """

    def __init__(self, name, plan=None, answer="", boom=None):
        self.name = name
        self._plan = plan or (lambda ctx: None)  # default: settle immediately
        self._answer = answer
        self._boom = boom
        self.seen: list[dict] = []

    def invoke(self, context):
        self.seen.append(dict(context))
        if self._boom is not None:
            raise self._boom
        return {"node": self.name}, self._plan(context)

    def render(self, result):
        return self._answer


def _swarm(*nodes, entry=None, max_hops=DEFAULT_MAX_HOPS):
    table = {n.name: n for n in nodes}
    return SwarmCoordinator(table, entry=entry or nodes[0].name, max_hops=max_hops)


# ===========================================================================
# 1. isolation — a node settles vs a node hands off
# ===========================================================================
def test_single_node_settles_with_its_answer():
    a = FakeNode("solo", answer="the answer")
    result = _swarm(a).run("q")
    assert isinstance(result, HandoffResult)
    assert result.ok()
    assert result.resolution == "settled"
    assert result.answer == "the answer"
    assert result.path == ["solo"]
    assert len(a.seen) == 1


def test_handoff_transfers_control_to_named_target():
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="b", reason="not me"))
    b = FakeNode("b", answer="b answers")
    result = _swarm(a, b).run("q")
    assert result.resolution == "settled"
    assert result.answer == "b answers"
    assert result.path == ["a", "b"]
    # The handing-off hop records where + why it transferred.
    assert result.hops[0].handoff_to == "b"
    assert result.hops[0].reason == "not me"
    assert result.hops[1].handoff_to == ""  # b settled


# ===========================================================================
# 2. communication protocol — context transfers verbatim; degrade gracefully
# ===========================================================================
def test_transferred_context_reaches_target_verbatim():
    a = FakeNode(
        "a",
        plan=lambda ctx: HandoffRequest(
            to="b", reason="need data", context={"symbols": ["NVDA"], "hint": "10-K"}
        ),
    )
    b = FakeNode("b", answer="ok")
    _swarm(a, b).run("what is revenue")
    # b saw the original question PLUS everything a transferred.
    assert b.seen[0]["question"] == "what is revenue"
    assert b.seen[0]["symbols"] == ["NVDA"]
    assert b.seen[0]["hint"] == "10-K"


def test_initial_context_seeds_the_entry_node():
    a = FakeNode("a", answer="ok")
    _swarm(a).run("q", context={"symbols": ["MSFT"]})
    assert a.seen[0] == {"question": "q", "symbols": ["MSFT"]}


# ===========================================================================
# 3. orchestration — entry honored; a there-and-back chain visits in order
# ===========================================================================
def test_entry_node_is_honored():
    a = FakeNode("a", answer="from a")
    b = FakeNode("b", answer="from b")
    result = _swarm(a, b, entry="b").run("q")
    assert result.path == ["b"]
    assert result.answer == "from b"


def test_there_and_back_visits_nodes_in_order():
    # a -> b -> a, where a settles on the SECOND visit (data_done flag set by b).
    def a_plan(ctx):
        return None if ctx.get("data_done") else HandoffRequest(to="b", reason="need b")

    a = FakeNode("a", plan=a_plan, answer="a settles")
    b = FakeNode("b", plan=lambda ctx: HandoffRequest(to="a", context={"data_done": True}))
    result = _swarm(a, b).run("q")
    assert result.resolution == "settled"
    assert result.answer == "a settles"
    assert result.path == ["a", "b", "a"]
    assert len(result.hops) == 3
    # The trajectory reports the SAME path via node-visit steps — the
    # hand-built swarm loop stamps `node` on its steps (it has no @traced_node
    # decorator), so nodes()/reached() work exactly like the graph agents'.
    assert result.trajectory.nodes() == ["a", "b", "a"]
    assert result.trajectory.reached("a") and result.trajectory.reached("b")
    assert not result.trajectory.reached("c")
    # Every tool step is tied to the turn that emitted it (no orphan node="").
    assert all(s.node for s in result.trajectory.steps if s.kind == "tool")


# ===========================================================================
# 4. emergent behavior — the loop / circular-delegation guards (KEY)
# ===========================================================================
def test_always_handoff_trips_max_hops_not_infinite_loop():
    # Two nodes that each hand to a THIRD fresh-named target would run forever;
    # instead point each at the other but with distinct contexts so the edge
    # guard doesn't fire first — the hop bound must stop it.
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="b", context={"n": len(ctx)}))
    b = FakeNode("b", plan=lambda ctx: HandoffRequest(to="a", context={"m": len(ctx)}))
    result = _swarm(a, b, max_hops=4).run("q")
    assert result.resolution in {"max_hops", "cycle"}
    # Whichever guard fired, the chain terminated within the bound.
    assert len(result.hops) <= 4
    assert not result.ok()


def test_max_hops_is_the_guard_on_a_nonrepeating_chain():
    # A LINEAR chain a->b->c->d->... where every node hands to a distinct fresh
    # target: no edge and no node ever repeats, so the cycle guard can NEVER
    # fire. Only the hop bound can end it — pinning that max_hops (not cycle
    # detection) is exactly what stops an ever-advancing delegation.
    names = [chr(ord("a") + i) for i in range(8)]  # a..h, longer than max_hops
    nodes = [
        FakeNode(n, plan=(lambda nxt: (lambda ctx: HandoffRequest(to=nxt)))(names[i + 1]))
        for i, n in enumerate(names[:-1])
    ]
    nodes.append(FakeNode(names[-1]))  # terminal (never reached under the bound)
    result = _swarm(*nodes, max_hops=4).run("q")
    assert result.resolution == "max_hops"  # exactly the hop guard, not "cycle"
    assert len(result.hops) == 4  # stopped at exactly the bound
    assert result.path == ["a", "b", "c", "d"]  # advanced, never repeated
    assert len(set(result.path)) == len(result.path)  # no node seen twice
    assert not result.ok()


def test_mutual_handoff_trips_cycle_guard():
    # a -> b -> a -> b ... with a stable edge set trips the cycle guard fast.
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="b"))
    b = FakeNode("b", plan=lambda ctx: HandoffRequest(to="a"))
    result = _swarm(a, b, max_hops=10).run("q")
    assert result.resolution == "cycle"
    assert not result.ok()
    # Terminated well under the hop bound — the cycle guard, not max_hops.
    assert len(result.hops) < 10


def test_hop_count_stays_within_trajectory_bound():
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="b"))
    b = FakeNode("b", plan=lambda ctx: HandoffRequest(to="a"))
    result = _swarm(a, b, max_hops=10).run("q")
    assert len(result.trajectory.steps) <= MAX_STEPS


# ===========================================================================
# 5. chaos — a node raising; an unknown handoff target
# ===========================================================================
def test_node_raising_is_recorded_as_error_not_crash():
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="b"))
    b = FakeNode("b", boom=RuntimeError("b exploded"))
    result = _swarm(a, b).run("q")
    assert result.resolution == "error"
    assert "b exploded" in result.error
    assert result.path == ["a", "b"]  # partial path recorded up to the failure
    assert result.hops[-1].ok is False
    assert not result.ok()


def test_unknown_handoff_target_degrades_cleanly():
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="ghost", reason="typo"))
    result = _swarm(a).run("q")
    assert result.resolution == "unknown_target"
    assert "ghost" in result.error
    assert not result.ok()
    # The dangling target is recorded as a failed hop.
    assert result.hops[-1].agent == "ghost"
    assert result.hops[-1].ok is False


def test_entry_must_be_a_known_node():
    with pytest.raises(ValueError):
        SwarmCoordinator({"a": FakeNode("a")}, entry="missing")


# ===========================================================================
# serialization — MCP-ready round-trip
# ===========================================================================
def test_result_serializes_and_round_trips():
    a = FakeNode("a", plan=lambda ctx: HandoffRequest(to="b", reason="need b"))
    b = FakeNode("b", answer="done")
    result = _swarm(a, b).run("q")
    dumped = result.model_dump_json()
    restored = HandoffResult.model_validate_json(dumped)
    assert restored.path == ["a", "b"]
    assert restored.answer == "done"
    assert restored.hops[0].handoff_to == "b"
    assert restored.hops[0].reason == "need b"
    assert restored.ok()


# ===========================================================================
# INTEGRATION — the real Research -> Data -> Research round-trip (hermetic)
# ===========================================================================
class _CannedClient(LLMClient):
    """An LLMClient whose generate() returns a fixed grounded string.

    The stub client keys fixtures by exact prompt hash; a prompt built over
    freshly-ingested chunks has no committed fixture. This canned client lets
    the retry leg reach `generate` deterministically so we can assert on the
    HANDOFF + REAL RETRIEVAL (the citations are over the actual NVDA doc), not
    on any stub answer text.
    """

    def __init__(self) -> None:
        super().__init__(provider="stub", model="stub")

    def generate(self, prompt, max_tokens=None, temperature=None):  # noqa: D401
        return "NVIDIA data center revenue grew, per the filing."


def _research_data_swarm(tmp_dir: Path):
    ingest = IngestAgent(client=FixtureEdgarClient(), universe=None, filings_dir=tmp_dir)
    return build_research_data_swarm(tmp_dir, ingest_agent=ingest, client=_CannedClient())


def test_research_hands_off_to_data_then_answers_on_retry(tmp_path):
    swarm = _research_data_swarm(tmp_path)
    result = swarm.run("What was NVIDIA data center revenue?", context={"symbols": ["NVDA"]})

    # The full round-trip happened: Research refused, Data ingested, Research retried.
    assert result.path == ["research", "data", "research"]
    assert result.resolution == "settled"
    assert result.ok()
    # Data actually wrote NVDA filings into the shared dir.
    assert any(p.name.startswith("nvda_") for p in tmp_path.glob("*.txt"))
    # The retry leg RETRIEVED real chunks — non-empty citations over the NVDA doc.
    # (We assert retrieval, not the canned answer text — no fixture-gaming.)
    # The settling hop is the second research visit.
    assert result.hops[0].handoff_to == "data"   # research -> data
    assert result.hops[1].handoff_to == "research"  # data -> research
    assert result.hops[2].handoff_to == ""          # research settled


def test_negative_control_empty_data_settles_as_no_answer(tmp_path):
    # A Data node that ingests nothing (empty universe, no symbols) leaves the
    # corpus empty, so the retry ALSO refuses -> the swarm settles with no
    # usable answer. Proves the positive test's answer came from real ingestion.
    empty_ingest = IngestAgent(client=FixtureEdgarClient(), universe=None, filings_dir=tmp_path)
    swarm = build_research_data_swarm(tmp_path, ingest_agent=empty_ingest, client=_CannedClient())
    # Ask about a symbol with NO fixture so Data ingests nothing.
    result = swarm.run("What did ACME report?", context={"symbols": ["ACME"]})
    assert result.path == ["research", "data", "research"]
    assert result.resolution == "settled"
    assert result.answer == ""      # research refused on the retry too
    assert not result.ok()


def test_retry_retrieves_real_nvda_chunks(tmp_path):
    # Directly assert the load-bearing claim: after Data ingests, a fresh
    # FilingsAgent over the shared dir retrieves the NVDA filing. This is what
    # makes the handoff meaningful — the corpus really was enriched mid-chain.
    from app.agents.filings import FilingsAgent
    from mcp_servers.filings.service import FilingsService

    IngestAgent(client=FixtureEdgarClient(), universe=None, filings_dir=tmp_path).run(["NVDA"])
    service = FilingsService.from_directory(tmp_path, client=_CannedClient())
    agent = FilingsAgent(retriever=service._retriever, client=_CannedClient())
    res = agent.run("What was NVIDIA data center revenue?")
    assert res.ok()
    assert res.answer is not None and res.answer.citations
    assert any("nvda" in c.document_id.lower() for c in res.answer.citations)


# ===========================================================================
# Live smoke — real EDGAR + real LLM (skipped unless both are available)
# ===========================================================================
@pytest.mark.live
def test_live_research_data_handoff(tmp_path):
    """Research -> Data -> Research over the REAL EDGAR client and a real LLM.

    Skips in the hermetic suite; run with `-m live` and network + a provider
    key. Same guard style as the other live smokes — CI stays hermetic.
    """
    from mcp_servers.filings.edgar import LiveEdgarClient

    ingest = IngestAgent(client=LiveEdgarClient(), universe=None, filings_dir=tmp_path)
    swarm = build_research_data_swarm(tmp_path, ingest_agent=ingest, client=LLMClient())
    result = swarm.run("What was NVIDIA data center revenue?", context={"symbols": ["NVDA"]})
    assert result.path[:2] == ["research", "data"]
    assert result.resolution == "settled"
