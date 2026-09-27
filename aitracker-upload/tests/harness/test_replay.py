"""Tests for replay — record a run, replay it, diff trajectories.

The fixture-backed agents are deterministic, so a record + replay of the same
inputs must produce an identical node path (empty diff). A hand-mutated
trajectory exercises the diff's added/removed/reordered branches.
"""
from __future__ import annotations

import json

from app.agents.trajectory import AgentTrajectory, Step
from app.harness import (
    diff_trajectories,
    load_recording,
    record_run,
    recorded_trajectory,
    replay_run,
)
from tests.harness.conftest import ANSWERABLE


# --- record ----------------------------------------------------------------
def test_record_run_writes_inputs_and_result(tmp_path, filings_agent):
    path = tmp_path / "rec.json"
    result = record_run(filings_agent, ANSWERABLE, path=path)
    rec = load_recording(path)
    assert rec["args"] == [ANSWERABLE]
    assert rec["kwargs"] == {}
    assert rec["result"]["trajectory"]["steps"]
    # the returned live result matches what was serialized
    assert json.loads(result.model_dump_json())["trajectory"]["steps"]


# --- replay is faithful -----------------------------------------------------
def test_replay_reproduces_node_path(tmp_path, filings_agent):
    path = tmp_path / "rec.json"
    original = record_run(filings_agent, ANSWERABLE, path=path)
    replayed = replay_run(filings_agent, path)
    assert replayed.trajectory.nodes() == original.trajectory.nodes()


def test_diff_of_identical_run_is_clean(tmp_path, filings_agent):
    path = tmp_path / "rec.json"
    record_run(filings_agent, ANSWERABLE, path=path)
    replayed = replay_run(filings_agent, path)
    diff = diff_trajectories(recorded_trajectory(path), replayed.trajectory)
    assert diff["changed"] is False
    assert diff["added"] == [] and diff["removed"] == []
    assert diff["reordered"] is False


# --- diff detects drift -----------------------------------------------------
def _traj(*nodes: str) -> AgentTrajectory:
    return AgentTrajectory(steps=[Step(node=n, kind="node") for n in nodes])


def test_diff_detects_added_node():
    diff = diff_trajectories(_traj("a", "b"), _traj("a", "b", "c"))
    assert diff["added"] == ["c"]
    assert diff["removed"] == []
    assert diff["changed"] is True


def test_diff_detects_removed_node():
    diff = diff_trajectories(_traj("a", "b", "c"), _traj("a", "b"))
    assert diff["removed"] == ["c"]
    assert diff["changed"] is True


def test_diff_detects_reorder():
    diff = diff_trajectories(_traj("a", "b"), _traj("b", "a"))
    assert diff["reordered"] is True
    assert diff["added"] == [] and diff["removed"] == []
    assert diff["changed"] is True
