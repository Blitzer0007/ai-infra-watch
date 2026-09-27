"""RotationAgent tests — Phase 3.6 (hardware <-> application rotation).

Maps the roadmap's test strategies, all on SYNTHETIC labeled price series with
known ground truth (EVAL INTEGRITY — the detector is never fit to historical
NVDA-vs-MSFT to manufacture a signal):

  1. divergence fires — hardware -3% / application +2% MUST fire a
                        hardware->application signal.
  2. rally does NOT   — both legs up together (even with a wide spread) must
                        NOT fire (a rally is not a rotation).
  3. adversarial      — an empty/absent bucket degrades to errors, no signal,
                        no crash, no divide-by-zero.
  4. trajectory       — classify precedes detect_divergence (linear graph).
  5. @pytest.mark.live — real stooq candle smoke (in test_candles.py).

Plus: injectable narrator, and a model_dump_json() round-trip with nested
RotationSignals.
"""
from __future__ import annotations

import json

import pytest

from app.agents import RotationAgent
from app.agents.schemas import RotationAgentResult
from app.universe import Universe
from tests.agents.conftest import (
    candle_service_from,
    step_series,
    synthetic_universe,
)

HARDWARE = ("NVDA", "AVGO")
APPLICATION = ("MSFT", "META")


def _agent(hw_pct: float, ap_pct: float, **kwargs) -> RotationAgent:
    """A rotation agent over synthetic labeled legs: hardware moves hw_pct,
    application moves ap_pct (same move for every member so equal-weighting is
    exact and the ground truth is unambiguous)."""
    series = {s: step_series(hw_pct) for s in HARDWARE}
    series.update({s: step_series(ap_pct) for s in APPLICATION})
    return RotationAgent(
        service=candle_service_from(series),
        universe=synthetic_universe(),
        **kwargs,
    )


# ----------------------------------------------------------------------
# 1. Divergence fires
# ----------------------------------------------------------------------
def test_hardware_down_application_up_fires():
    r = _agent(hw_pct=-3.0, ap_pct=+2.0).run()
    assert r.ok()
    assert r.fired()
    # every fired window points hardware -> application
    assert r.signals
    for sig in r.signals:
        assert sig.from_bucket == "ai_hardware"
        assert sig.to_bucket == "ai_application"
        assert sig.from_return == pytest.approx(-3.0)
        assert sig.to_return == pytest.approx(2.0)
        assert sig.spread == pytest.approx(5.0)
        assert sig.strength == pytest.approx(0.5)
    # the step-at-last-bar series makes all three windows fire identically
    assert {s.window for s in r.signals} == {"1d", "5d", "20d"}


def test_fired_signal_names_contributors():
    r = _agent(hw_pct=-3.0, ap_pct=+2.0).run()
    sig = r.signals[0]
    assert set(sig.contributors) == set(HARDWARE) | set(APPLICATION)


def test_reverse_direction_fires_application_to_hardware():
    # application down, hardware up -> capital rotates INTO hardware
    r = _agent(hw_pct=+2.0, ap_pct=-3.0).run()
    assert r.fired()
    for sig in r.signals:
        assert sig.from_bucket == "ai_application"
        assert sig.to_bucket == "ai_hardware"


def test_narrative_is_grounded_in_the_numbers():
    r = _agent(hw_pct=-3.0, ap_pct=+2.0).run()
    # deterministic narrator cites the computed figures, invents no cause
    assert "ai_hardware" in r.narrative and "ai_application" in r.narrative
    assert "Rotation detected" in r.narrative


# ----------------------------------------------------------------------
# 2. Rally does NOT fire (rally != rotation)
# ----------------------------------------------------------------------
def test_both_up_together_does_not_fire():
    r = _agent(hw_pct=+2.0, ap_pct=+3.0).run()
    assert r.ok()
    assert not r.fired()
    assert r.signals == []
    assert "No rotation detected" in r.narrative


def test_both_up_wide_spread_still_does_not_fire():
    # A wide spread but BOTH legs clearly up is a rally, not a rotation —
    # the flat-leg gate must reject it regardless of spread size.
    r = _agent(hw_pct=+2.0, ap_pct=+9.0).run()
    assert not r.fired()


def test_both_down_together_does_not_fire():
    # Both legs down together is a broad selloff, not a rotation into either.
    r = _agent(hw_pct=-3.0, ap_pct=-3.0).run()
    assert not r.fired()


def test_tiny_divergence_below_threshold_does_not_fire():
    # hardware flat, application +1% -> 1pp spread, strength 0.10 < 0.30
    r = _agent(hw_pct=0.0, ap_pct=+1.0).run()
    assert not r.fired()


# ----------------------------------------------------------------------
# 3. Adversarial — degrade, no crash, no divide-by-zero
# ----------------------------------------------------------------------
def test_absent_application_bucket_degrades():
    # Only hardware has price history; application symbols error out.
    series = {s: step_series(-3.0) for s in HARDWARE}
    agent = RotationAgent(
        service=candle_service_from(series), universe=synthetic_universe()
    )
    r = agent.run()
    assert r.ok()  # per-bucket degradation is non-fatal
    assert not r.fired()  # can't diverge one leg against a missing leg
    assert any("ai_application" in e or "MSFT" in e or "META" in e for e in r.errors)


def test_empty_universe_is_clean_noop():
    agent = RotationAgent(
        service=candle_service_from({}), universe=Universe([], schema_version=1)
    )
    r = agent.run()
    assert r.ok()
    assert r.targets == []
    assert r.hardware == [] and r.application == []
    assert r.signals == []
    assert "No rotation detected" in r.narrative


def test_short_history_degrades_long_windows_only():
    # 3 bars: only the 1d window is computable; 5d/20d degrade but don't crash.
    series = {s: [100.0, 100.0, 97.0] for s in HARDWARE}
    series.update({s: [100.0, 100.0, 102.0] for s in APPLICATION})
    r = RotationAgent(
        service=candle_service_from(series), universe=synthetic_universe()
    ).run()
    assert r.ok()
    assert r.fired()
    assert {s.window for s in r.signals} == {"1d"}  # only the short window fired


# ----------------------------------------------------------------------
# 4. Trajectory — classify precedes detect_divergence
# ----------------------------------------------------------------------
def test_trajectory_node_order():
    r = _agent(hw_pct=-3.0, ap_pct=+2.0).run()
    nodes = r.trajectory.nodes()
    assert nodes == ["classify", "aggregate_returns", "detect_divergence", "explain"]
    assert nodes.index("classify") < nodes.index("detect_divergence")


def test_trajectory_tool_steps_follow_their_node():
    r = _agent(hw_pct=-3.0, ap_pct=+2.0).run()
    steps = r.trajectory.steps
    for i, s in enumerate(steps):
        if s.kind == "tool":
            assert any(p.kind == "node" and p.node == s.node for p in steps[:i])


# ----------------------------------------------------------------------
# Injectable narrator (the explain seam)
# ----------------------------------------------------------------------
def test_injectable_narrator_is_used():
    calls = {}

    def narrator(result, window_returns):
        calls["n"] = len(result.signals)
        return "CUSTOM NARRATIVE"

    r = _agent(hw_pct=-3.0, ap_pct=+2.0, narrator=narrator).run()
    assert r.narrative == "CUSTOM NARRATIVE"
    assert calls["n"] == len(r.signals)


# ----------------------------------------------------------------------
# Serialization
# ----------------------------------------------------------------------
def test_result_serializes_with_nested_signals():
    r = _agent(hw_pct=-3.0, ap_pct=+2.0).run()
    blob = json.loads(r.model_dump_json())
    assert blob["signals"] and all("from_bucket" in s for s in blob["signals"])
    assert blob["hardware"] == ["AVGO", "NVDA"]  # classify sorts the legs
    assert blob["trajectory"]["steps"]
    # round-trips back into the model
    assert RotationAgentResult.model_validate(blob).fired()
