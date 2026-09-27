"""Replay testing — record an agent run, re-run it, diff the trajectory.

Regression detection for agents: capture a known-good run to disk, then later
replay the SAME inputs and diff the node path. If a refactor silently reroutes
the graph (an extra node, a dropped tool call, a reordered path), the diff
surfaces it even when the final answer still looks plausible.

The recording stores the call inputs explicitly (`args`/`kwargs`) rather than
reverse-engineering them from result fields, so one mechanism replays every
agent regardless of its result shape (Market takes `symbols`, Filings takes a
`question`, etc.). Replay is a re-run with identical inputs — not LangGraph
checkpoint restoration; for the hermetic fixture-backed agents the run is
deterministic, so a clean diff is the expected baseline.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.agents.trajectory import AgentTrajectory


def record_run(agent, *args, path: str | Path, **kwargs):
    """Run `agent.run(*args, **kwargs)`, persist inputs + result to `path`.

    Returns the live result object. The on-disk record is
    ``{"args": [...], "kwargs": {...}, "result": <result.model_dump()>}`` so
    `replay_run` can reconstruct the exact call.
    """
    result = agent.run(*args, **kwargs)
    record = {
        "args": list(args),
        "kwargs": dict(kwargs),
        "result": json.loads(result.model_dump_json()),
    }
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def load_recording(path: str | Path) -> dict[str, Any]:
    """Read a recording written by `record_run`."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def recorded_trajectory(path: str | Path) -> AgentTrajectory:
    """The trajectory captured in a recording, as an AgentTrajectory."""
    rec = load_recording(path)
    return AgentTrajectory.model_validate(rec["result"]["trajectory"])


def replay_run(agent, path: str | Path):
    """Re-run `agent` with the recording's inputs and return the fresh result."""
    rec = load_recording(path)
    return agent.run(*rec.get("args", []), **rec.get("kwargs", {}))


def diff_trajectories(a: AgentTrajectory, b: AgentTrajectory) -> dict:
    """Structural diff of two trajectories' node paths.

    Compares the ordered node lists (the state-machine path). Returns
    ``added`` (nodes in `b` not in `a`), ``removed`` (in `a` not in `b`),
    ``reordered`` (same node set, different order), and ``changed`` (any of
    the above true). Step-count deltas are reported too for a quick "did the
    run get busier?" signal.
    """
    a_nodes, b_nodes = a.nodes(), b.nodes()
    a_set, b_set = set(a_nodes), set(b_nodes)
    added = sorted(b_set - a_set)
    removed = sorted(a_set - b_set)
    reordered = a_set == b_set and a_nodes != b_nodes
    return {
        "added": added,
        "removed": removed,
        "reordered": reordered,
        "changed": bool(added or removed or reordered),
        "steps_before": len(a.steps),
        "steps_after": len(b.steps),
    }
