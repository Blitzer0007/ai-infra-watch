"""Trajectory + state assertions for LangGraph agents — Portfolio Project #4.

The trajectory/state sibling to ``app.assertions`` (semantic/schema/grounding):
those grade an agent's *answer*; these grade the *path it took to get there*.
Agents are non-deterministic and multi-step, so asserting only the final output
misses whole classes of regression — a right answer reached by the wrong route
(skipped the retrieval, called a tool twice, took the degrade path when it
should have generated). Every helper reads the `AgentTrajectory` the graphs
already record via `@traced_node`, so no agent code changes to be testable.

The vocabulary here is lifted from the patterns the agent tests already repeat
inline (``nodes() == [...]``, ``tool in tools()``, tool-before-node ordering,
``len(steps) <= MAX``); collecting them in one place makes the intent explicit
and the failure messages uniform.

All helpers raise ``AssertionError`` with a diagnostic message on failure and
return ``None`` on success, so they read naturally inside pytest.
"""
from __future__ import annotations

from typing import Any

from app.agents.trajectory import AgentTrajectory


# ----------------------------------------------------------------------
# Trajectory assertions — the path the agent took
# ----------------------------------------------------------------------
def assert_well_formed(trajectory: AgentTrajectory) -> None:
    """Every tool/llm step is attributed to a node already visited.

    A trajectory is well-formed when each non-node step (a tool or llm call)
    is preceded by its owning node's visit step — `traced_node` guarantees
    this by prepending the node step and stamping the node name onto the
    tool/llm steps. A violation means a step leaked in out of order.
    """
    seen: set[str] = set()
    for i, s in enumerate(trajectory.steps):
        if s.kind == "node":
            seen.add(s.node)
        else:
            assert s.node in seen, (
                f"step[{i}] {s.kind}={s.tool!r} attributed to node {s.node!r} "
                f"which has not been visited yet (visited: {sorted(seen)})"
            )


def assert_visited_nodes(trajectory: AgentTrajectory, expected: list[str]) -> None:
    """The exact ordered list of node visits equals `expected`."""
    actual = trajectory.nodes()
    assert actual == expected, f"node path {actual} != expected {expected}"


def assert_visited(trajectory: AgentTrajectory, node: str) -> None:
    """`node` appears somewhere in the trajectory."""
    nodes = trajectory.nodes()
    assert node in nodes, f"node {node!r} never visited (path: {nodes})"


def assert_not_visited(trajectory: AgentTrajectory, node: str) -> None:
    """`node` was never visited (e.g. the LLM node on a degrade path)."""
    nodes = trajectory.nodes()
    assert node not in nodes, f"node {node!r} was visited but should not be (path: {nodes})"


def assert_node_order(trajectory: AgentTrajectory, before: str, after: str) -> None:
    """`before` is visited strictly earlier than `after` (both must appear)."""
    nodes = trajectory.nodes()
    assert before in nodes, f"node {before!r} never visited (path: {nodes})"
    assert after in nodes, f"node {after!r} never visited (path: {nodes})"
    assert nodes.index(before) < nodes.index(after), (
        f"expected {before!r} before {after!r}, got path {nodes}"
    )


def assert_tool_called(
    trajectory: AgentTrajectory,
    tool: str,
    *,
    before: str | None = None,
    after: str | None = None,
) -> None:
    """`tool` was invoked; optionally before/after a given node's first visit.

    `before`/`after` name a NODE: `before="answer"` asserts the tool ran
    before the answer node was first visited (the roadmap's
    "did it search before answering?" invariant). A tool has no node-visit
    index of its own, so it is located by its position in the flat step list
    relative to the node step.
    """
    tools = trajectory.tools()
    assert tool in tools, f"tool {tool!r} never called (called: {tools})"
    if before is None and after is None:
        return
    steps = trajectory.steps
    tool_idx = next(i for i, s in enumerate(steps) if s.kind == "tool" and s.tool == tool)
    if before is not None:
        node_idx = _first_node_index(steps, before)
        assert tool_idx < node_idx, (
            f"expected tool {tool!r} before node {before!r}, "
            f"but tool is at step {tool_idx} and node at step {node_idx}"
        )
    if after is not None:
        node_idx = _first_node_index(steps, after)
        assert tool_idx > node_idx, (
            f"expected tool {tool!r} after node {after!r}, "
            f"but tool is at step {tool_idx} and node at step {node_idx}"
        )


def assert_steps_bounded(trajectory: AgentTrajectory, max_steps: int) -> None:
    """Total step count is within `max_steps` — the anti-infinite-loop bound."""
    n = len(trajectory.steps)
    assert n <= max_steps, f"trajectory has {n} steps, exceeds bound {max_steps}"


def assert_no_failed_steps(trajectory: AgentTrajectory) -> None:
    """No step is marked `ok=False` (no tool/node reported a failure)."""
    failed = [f"{s.node}:{s.tool or s.kind}" for s in trajectory.steps if not s.ok]
    assert not failed, f"trajectory has failed steps: {failed}"


def _first_node_index(steps: list, node: str) -> int:
    for i, s in enumerate(steps):
        if s.kind == "node" and s.node == node:
            return i
    raise AssertionError(f"node {node!r} never visited")


# ----------------------------------------------------------------------
# State assertion — intermediate state at a specific node
# ----------------------------------------------------------------------
def assert_state_at_node(
    graph,
    node_name: str,
    input_state: dict,
    *,
    contains: dict[str, Any],
    config: dict | None = None,
) -> dict:
    """Assert the state delta emitted when `node_name` fires ⊇ `contains`.

    Streams the graph with ``stream_mode="updates"`` (each chunk is
    ``{node: partial_state_delta}``) and collects the delta for `node_name`.
    Because a super-step can update several nodes at once (the supervisor's
    market+filings fan-out), every key of every chunk is inspected — not just
    the first. Raises AssertionError if the node never fired or a required key
    is missing / unequal. Returns the captured delta so callers can inspect
    further. `config` defaults to a generous recursion limit.
    """
    cfg = config or {"recursion_limit": 25}
    captured: dict | None = None
    for chunk in graph.stream(input_state, cfg, stream_mode="updates"):
        # updates mode: {node_name: delta}; parallel super-steps carry >1 key.
        for name, delta in chunk.items():
            if name == node_name:
                captured = delta if isinstance(delta, dict) else {}
    assert captured is not None, f"node {node_name!r} never emitted a state update"
    for key, want in contains.items():
        assert key in captured, (
            f"node {node_name!r} state missing key {key!r} (has: {sorted(captured)})"
        )
        assert captured[key] == want, (
            f"node {node_name!r} state[{key!r}] = {captured[key]!r} != expected {want!r}"
        )
    return captured
