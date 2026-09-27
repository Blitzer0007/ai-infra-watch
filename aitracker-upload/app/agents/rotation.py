"""RotationAgent — Phase 3.6: detect capital rotating hardware <-> application.

Detects the two AI legs trading in opposition: AI hardware (NVDA, AVGO, semis)
vs AI application/software (MSFT, META, app-layer). Rotation = the legs
DIVERGING — one up while the other is flat/down — over rolling windows, NOT a
broad rally (both up together is a rally, not a rotation).

Graph shape (hand-built StateGraph, linear — the roadmap's node order):

    classify -> aggregate_returns -> detect_divergence -> explain
        (empty/failed aggregates) -------------------------> explain

Design notes
------------
* `classify` pulls bucket membership from the 3.5 tagged universe
  (data/universe/ai_stocks.json) — DEPENDENCY 1. Only the two rotation legs
  (ai_hardware / ai_application) are tracked; ai_infra is the universe's third
  bucket and deliberately excluded (the roadmap defines rotation between the
  hardware and application legs).
* `aggregate_returns` fetches each leg member's price history through the
  injected `CandleService` (DEPENDENCY 2 — the price-history store) and
  computes an aggregate % return per bucket per window (1d/5d/20d). Weighting
  is injectable (`weight` callable, default equal-weight) so a cap-weight
  upgrade later needs no graph change. A symbol that errors is recorded and
  dropped; a bucket left with no data records an error and no-ops — the graph
  degrades, it never crashes or divides by zero.
* `detect_divergence` fires a RotationSignal for a window when the two legs
  diverge (one up, other flat/down) with a widening spread. `strength` is
  normalized to [0, 1] by the spread (SPREAD_SCALE) so the synthetic test's
  hardware -3% / application +2% (5pp spread) fires at a strong 0.50.
* `explain` uses an injectable `narrator` (default: deterministic text grounded
  ONLY in the computed returns + contributors — it cites facts, invents no
  causes). The roadmap says "reuses the synthesis LLM"; swap via
  `RotationAgent(narrator=...)` to upgrade to an LLM synthesizer later without
  changing the graph shape (same pattern as SupervisorAgent's combiner).

EVAL INTEGRITY: tested on SYNTHETIC labeled price series with known ground
truth — the detector is never fit to historical NVDA-vs-MSFT to manufacture a
signal. Same discipline as the golden set.
"""
from __future__ import annotations

import operator
from typing import Annotated, Callable, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.schemas import RotationAgentResult, RotationSignal
from app.agents.trajectory import AgentTrajectory, Step, tool_call, traced_node
from app.universe import Universe, get_universe
from mcp_servers.stocks.candles import CandleService, from_env as candles_from_env

# The two rotation legs (universe tags). ai_infra is the universe's third
# bucket and deliberately excluded — the roadmap defines rotation between the
# hardware and application legs only.
HARDWARE_BUCKET = "ai_hardware"
APPLICATION_BUCKET = "ai_application"

# Windows over which divergence is measured, in sessions.
WINDOWS = (1, 5, 20)

# Spread (in percentage points) that maps to a strength of 1.0. A 5pp
# divergence — the synthetic test's hardware -3% vs application +2% — scores
# 0.50, well above MIN_FIRE_STRENGTH.
SPREAD_SCALE = 10.0
# Minimum strength for a rotation to fire; a tiny divergence stays below it.
MIN_FIRE_STRENGTH = 0.30
# The outflow (losing) leg must be flat-or-down (<= this, in percent) for the
# divergence to count as a ROTATION rather than a broad rally. This is what
# makes both-legs-up NOT fire, however wide the spread: if the weaker leg is
# still clearly rising, capital is not rotating out of it.
FLAT_CEILING = 0.5

# Narrator signature: (result-so-far, per-window aggregate returns) -> narrative.
Narrator = Callable[[RotationAgentResult, dict], str]


def _window_key(n: int) -> str:
    return f"{n}d"


def default_narrator(result: RotationAgentResult, window_returns: dict) -> str:
    """Deterministic, grounded narrative — NO LLM call, invents no causes.

    Cites only the computed numbers and the contributor symbols. When nothing
    fired, it says the legs moved together (rally != rotation). Swappable via
    `RotationAgent(narrator=...)` for a future LLM synthesizer without changing
    the graph.
    """
    if not result.signals:
        legs = " and ".join(
            p for p in (", ".join(result.hardware), ", ".join(result.application)) if p
        )
        tail = f" ({legs})" if legs else ""
        return (
            "No rotation detected. Across the 1d/5d/20d windows the AI hardware "
            "and application legs did not diverge enough to signal capital "
            f"rotation{tail} — a broad move is a rally, not a rotation."
        )
    parts: list[str] = []
    for sig in result.signals:
        prefix = "Rotation detected"
        parts.append(
            f"{prefix}: {sig.one_line()}. Contributors: "
            f"{', '.join(sig.contributors) or 'n/a'}."
        )
    return " ".join(parts)


class RotationState(TypedDict, total=False):
    symbols: list[str]
    targets: list[str]
    hardware: list[str]
    application: list[str]
    # Per-window aggregate returns: {"1d": {"ai_hardware": 1.2, "ai_application": -0.4}, ...}
    window_returns: dict
    signals: list[RotationSignal]
    narrative: str
    errors: Annotated[list[str], operator.add]
    fatal: str
    # Trajectory accumulates across nodes via the list-add reducer.
    steps: Annotated[list[Step], operator.add]


def _pick(n: int, window_returns: dict) -> dict | None:
    """Per-bucket returns for one window, or None if either leg is missing.

    `window_returns` is keyed bucket -> window -> aggregate return (the shape
    aggregate_returns builds), so a window fires only when BOTH legs have an
    aggregate for it — a missing leg degrades that window, not the run.
    """
    key = _window_key(n)
    hw = (window_returns.get(HARDWARE_BUCKET) or {}).get(key)
    ap = (window_returns.get(APPLICATION_BUCKET) or {}).get(key)
    if hw is None or ap is None:
        return None
    return {"hardware": hw, "application": ap}


def build_rotation_graph(
    service: CandleService,
    universe: Universe,
    narrator: Narrator,
    weight: Callable[[str], float] | None = None,
):
    """Compile the rotation detector's graph over injected deps.

    `universe`, `service`, `narrator`, and `weight` are injected so tests run
    hermetic: a synthetic universe + in-memory candle series + deterministic
    narrator, with zero network and zero LLM.
    """

    def _targets(symbols: list[str] | None) -> list[str]:
        if symbols:
            return [s.strip().upper() for s in symbols]
        return [s.symbol for s in universe]

    @traced_node("classify")
    def classify(state: RotationState) -> dict:
        targets = _targets(state.get("symbols"))
        hw = sorted(
            u.symbol for u in universe if u.bucket == HARDWARE_BUCKET and u.symbol in targets
        )
        ap = sorted(
            u.symbol for u in universe if u.bucket == APPLICATION_BUCKET and u.symbol in targets
        )
        step = tool_call(
            "universe.tags",
            {"hardware": hw, "application": ap},
            note=f"{len(hw)}+{len(ap)} names",
        )
        return {
            "targets": targets,
            "hardware": hw,
            "application": ap,
            "steps": [step],
        }

    @traced_node("aggregate_returns")
    def aggregate_returns(state: RotationState) -> dict:
        hw = state.get("hardware") or []
        ap = state.get("application") or []
        errors: list[str] = []
        steps: list[Step] = []
        window_returns: dict = {}

        def _per_bucket(symbols: list[str], bucket: str) -> dict:
            per_window: dict = {}
            for symbol in symbols:
                try:
                    series = service.get_series(symbol)
                except Exception as exc:  # QuoteError / malformed -> degrade
                    code = getattr(exc, "code", type(exc).__name__)
                    errors.append(f"{symbol}: {code}")
                    steps.append(
                        tool_call("candles.history", {"symbol": symbol}, note=code, ok=False)
                    )
                    continue
                steps.append(
                    tool_call("candles.history", {"symbol": symbol}, note=f"{len(series.candles)} bars")
                )
                w = (weight(symbol) if weight is not None else 1.0) or 0.0
                for n in WINDOWS:
                    ret = series.window_return(n)
                    if ret is not None:
                        per_window.setdefault(_window_key(n), []).append((ret, w))
            out: dict = {}
            for key, pairs in per_window.items():
                # Weighted mean of the per-symbol returns in this bucket.
                num = sum(r * wgt for r, wgt in pairs)
                den = sum(wgt for _, wgt in pairs)
                if den > 0:
                    out[key] = num / den
            return out

        # Both legs are computed independently; one failing never blocks the other.
        window_returns[HARDWARE_BUCKET] = _per_bucket(hw, HARDWARE_BUCKET)
        window_returns[APPLICATION_BUCKET] = _per_bucket(ap, APPLICATION_BUCKET)

        for key in (f"{n}d" for n in WINDOWS):
            if window_returns[HARDWARE_BUCKET].get(key) is None:
                errors.append(f"{HARDWARE_BUCKET}: no data for {key}")
            if window_returns[APPLICATION_BUCKET].get(key) is None:
                errors.append(f"{APPLICATION_BUCKET}: no data for {key}")
        return {"window_returns": window_returns, "errors": errors, "steps": steps}

    @traced_node("detect_divergence")
    def detect_divergence(state: RotationState) -> dict:
        signals: list[RotationSignal] = []
        steps: list[Step] = []
        wr = state.get("window_returns") or {}

        # State stores the leg symbol-lists under "hardware"/"application";
        # map a bucket tag to its state key so contributors resolve correctly.
        _leg_key = {HARDWARE_BUCKET: "hardware", APPLICATION_BUCKET: "application"}

        def _contributors(bucket: str, window: int) -> list[str]:
            """Symbols whose |return| contributes most to the bucket's move."""
            rets: list[tuple[float, str]] = []
            for symbol in state.get(_leg_key.get(bucket, bucket)) or []:
                try:
                    r = service.get_series(symbol).window_return(window)
                except Exception:
                    continue
                if r is not None:
                    rets.append((abs(r), symbol))
            return [s for _, s in sorted(rets, reverse=True)][:3]

        for n in WINDOWS:
            picks = _pick(n, wr)
            if picks is None:
                steps.append(
                    tool_call("rotation.score", {"window": n}, note="no data", ok=False)
                )
                continue
            hw_r, ap_r = picks["hardware"], picks["application"]
            key = _window_key(n)
            # Order the legs: hi = outperformer (inflow), lo = laggard (outflow).
            if ap_r >= hw_r:
                hi_r, hi_b, lo_r, lo_b = ap_r, APPLICATION_BUCKET, hw_r, HARDWARE_BUCKET
            else:
                hi_r, hi_b, lo_r, lo_b = hw_r, HARDWARE_BUCKET, ap_r, APPLICATION_BUCKET
            spread = hi_r - lo_r  # >= 0 by construction
            strength = min(1.0, max(0.0, spread / SPREAD_SCALE))
            # Rotation (not a rally) requires: the inflow leg up, the outflow
            # leg flat-or-down, and a wide-enough spread. Both-legs-up fails
            # the flat gate no matter how wide the spread — that's a rally,
            # not a rotation. A missing per-bucket return degrades the window
            # only (handled above), never the whole run.
            fires = hi_r > 0 and lo_r <= FLAT_CEILING and strength >= MIN_FIRE_STRENGTH
            if fires:
                signals.append(
                    RotationSignal(
                        from_bucket=lo_b,
                        to_bucket=hi_b,
                        window=key,
                        from_return=round(lo_r, 4),
                        to_return=round(hi_r, 4),
                        spread=round(spread, 4),
                        strength=round(strength, 4),
                        contributors=_contributors(lo_b, n) + _contributors(hi_b, n),
                    )
                )
                steps.append(
                    tool_call(
                        "rotation.score",
                        {"window": n},
                        note=f"{lo_b}->{hi_b} strength {strength:.2f}",
                    )
                )
            else:
                steps.append(
                    tool_call(
                        "rotation.score",
                        {"window": n},
                        note=f"no rotation (strength {strength:.2f})",
                    )
                )
        return {"signals": signals, "steps": steps}

    @traced_node("explain")
    def explain(state: RotationState) -> dict:
        result = RotationAgentResult(
            targets=state.get("targets") or [],
            hardware=state.get("hardware") or [],
            application=state.get("application") or [],
            signals=state.get("signals") or [],
            errors=state.get("errors") or [],
            trajectory=AgentTrajectory(steps=state.get("steps") or []),
        )
        narrative = narrator(result, state.get("window_returns") or {})
        return {"narrative": narrative, "_note": f"{len(narrative)} chars"}

    graph = StateGraph(RotationState)
    graph.add_node("classify", classify)
    graph.add_node("aggregate_returns", aggregate_returns)
    graph.add_node("detect_divergence", detect_divergence)
    graph.add_node("explain", explain)

    graph.add_edge(START, "classify")
    graph.add_edge("classify", "aggregate_returns")
    graph.add_conditional_edges(
        "aggregate_returns",
        lambda s: "detect_divergence" if s.get("window_returns") else "explain",
        {"detect_divergence": "detect_divergence", "explain": "explain"},
    )
    graph.add_edge("detect_divergence", "explain")
    graph.add_edge("explain", END)
    return graph.compile()


class RotationAgent:
    """Detects hardware <-> application rotation over the tagged universe."""

    def __init__(
        self,
        service: CandleService | None = None,
        universe: Universe | None = None,
        narrator: Narrator = default_narrator,
        weight: Callable[[str], float] | None = None,
        recursion_limit: int = 25,
    ) -> None:
        self.service = service or candles_from_env("fixture")
        # `universe is not None`, not `universe or …`: an empty Universe is
        # falsy (len 0) but a legitimate "no targets" injection for tests.
        self.universe = universe if universe is not None else get_universe()
        self.narrator = narrator
        self.weight = weight
        self.recursion_limit = recursion_limit
        self.graph = build_rotation_graph(self.service, self.universe, self.narrator, self.weight)

    def run(self, symbols: list[str] | None = None) -> RotationAgentResult:
        state: RotationState = {"symbols": symbols or [], "steps": []}
        final = self.graph.invoke(state, {"recursion_limit": self.recursion_limit})
        errors = list(final.get("errors") or [])
        if final.get("fatal"):
            errors.append(final["fatal"])
        return RotationAgentResult(
            targets=final.get("targets") or [],
            hardware=final.get("hardware") or [],
            application=final.get("application") or [],
            signals=final.get("signals") or [],
            narrative=final.get("narrative") or "",
            errors=errors,
            trajectory=AgentTrajectory(steps=final.get("steps") or []),
        )
