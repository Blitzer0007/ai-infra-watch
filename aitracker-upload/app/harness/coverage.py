"""Node coverage — which graph nodes were exercised across a set of runs.

The counterpart to line coverage, but for an agent's state machine: feed it
the trajectories from a test run (or many), then ask which of the graph's
nodes were never visited. An uncovered node means a path the suite never
took — the state-machine equivalent of an untested branch.

Deliberately node-level (not edge-level): the trajectory records node visits,
not the edge taken between them, so honest coverage stops at nodes. Edge
coverage would need the graph's edge list plus consecutive-visit pairs; that
is a documented later upgrade, not a silent half-measure here.
"""
from __future__ import annotations

from app.agents.trajectory import AgentTrajectory


def graph_node_names(graph) -> set[str]:
    """Real node names of a compiled LangGraph, excluding START/END sentinels.

    Works off `graph.nodes` (the Pregel node mapping) first and falls back to
    the drawable `graph.get_graph().nodes`; both include the `__start__` /
    `__end__` sentinels in some versions, so those are filtered out.
    """
    names: set[str] = set()
    raw = getattr(graph, "nodes", None)
    if raw:
        names = set(raw.keys()) if hasattr(raw, "keys") else set(raw)
    else:  # pragma: no cover - fallback for older/newer langgraph shapes
        names = {n for n in graph.get_graph().nodes}
    return {n for n in names if not (n.startswith("__") and n.endswith("__"))}


class NodeCoverage:
    """Accumulates the set of nodes visited across one or more trajectories."""

    def __init__(self) -> None:
        self._covered: set[str] = set()
        self._runs: int = 0

    def record(self, trajectory: AgentTrajectory) -> None:
        """Fold one run's node visits into the covered set."""
        self._covered.update(trajectory.nodes())
        self._runs += 1

    @property
    def runs(self) -> int:
        return self._runs

    def covered(self) -> set[str]:
        return set(self._covered)

    def uncovered(self, graph) -> set[str]:
        """Graph nodes never visited across the recorded runs."""
        return graph_node_names(graph) - self._covered

    def report(self, graph) -> dict:
        """Coverage summary for a graph: covered/uncovered lists + percent.

        `pct` is 100.0 for a graph with no nodes (vacuously fully covered) so
        the metric never divides by zero on an empty graph.
        """
        total = graph_node_names(graph)
        covered = total & self._covered
        uncovered = total - self._covered
        pct = 100.0 if not total else round(len(covered) / len(total) * 100.0, 2)
        return {
            "runs": self._runs,
            "covered": sorted(covered),
            "uncovered": sorted(uncovered),
            "pct": pct,
        }
