"""Agent Testing Harness — Portfolio Project #4 (Phase 4).

A reusable library for testing LangGraph agents by their TRAJECTORY and
intermediate STATE, not just their final answer. The trajectory/state sibling
to ``app.assertions`` (which grades answers) — together they cover both halves
of "was this agent run correct?": the right answer AND the right path to it.

Four capabilities:

* **assertions** — `assert_visited_nodes`, `assert_node_order`,
  `assert_tool_called(before=/after=)`, `assert_steps_bounded`,
  `assert_no_failed_steps`, `assert_well_formed`, and `assert_state_at_node`
  (intermediate state via `graph.stream`).
* **coverage** — `NodeCoverage`: which of a graph's nodes the suite exercised.
* **replay** — `record_run` / `replay_run` / `diff_trajectories`: capture a
  known-good run and detect path regressions.
* **adversarial** — `generate_adversarial_inputs`: auto-generate edge-case
  queries (ambiguous / injection / empty / boundary), deterministic offline.

All of it reads the `AgentTrajectory` the graphs already emit via
`@traced_node`, so agents are testable with zero changes to agent code.
"""
from __future__ import annotations

from app.harness.adversarial import DEFAULT_CATEGORIES, generate_adversarial_inputs
from app.harness.assertions import (
    assert_no_failed_steps,
    assert_node_order,
    assert_not_visited,
    assert_state_at_node,
    assert_steps_bounded,
    assert_tool_called,
    assert_visited,
    assert_visited_nodes,
    assert_well_formed,
)
from app.harness.coverage import NodeCoverage, graph_node_names
from app.harness.replay import (
    diff_trajectories,
    load_recording,
    record_run,
    recorded_trajectory,
    replay_run,
)

__all__ = [
    # assertions
    "assert_well_formed",
    "assert_visited",
    "assert_visited_nodes",
    "assert_not_visited",
    "assert_node_order",
    "assert_tool_called",
    "assert_steps_bounded",
    "assert_no_failed_steps",
    "assert_state_at_node",
    # coverage
    "NodeCoverage",
    "graph_node_names",
    # replay
    "record_run",
    "replay_run",
    "load_recording",
    "recorded_trajectory",
    "diff_trajectories",
    # adversarial
    "generate_adversarial_inputs",
    "DEFAULT_CATEGORIES",
]
