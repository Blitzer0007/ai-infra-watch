"""Metric regression detection for AI Quality runs."""
from __future__ import annotations

from typing import Any


DEFAULT_THRESHOLDS = {
    "qualityScore": {"direction": "down", "delta": 3.0},
    "faithfulness": {"direction": "down", "delta": 3.0},
    "relevance": {"direction": "down", "delta": 5.0},
    "safety": {"direction": "down", "delta": 2.0},
    "citationCoverage": {"direction": "down", "delta": 5.0},
    "hallucinationRate": {"direction": "up", "delta": 3.0},
    "adversarialFailureRate": {"direction": "up", "delta": 3.0},
}


def compare_metrics(current: dict[str, Any], baseline: dict[str, Any], thresholds: dict[str, dict[str, float]] | None = None) -> dict[str, Any]:
    thresholds = thresholds or DEFAULT_THRESHOLDS
    regressions = []
    observed = {}

    for metric, rule in thresholds.items():
        cur = current.get(metric)
        base = baseline.get(metric)
        if not isinstance(cur, (int, float)) or not isinstance(base, (int, float)):
            observed[metric] = {"current": cur, "baseline": base, "status": "SKIPPED"}
            continue
        delta = float(cur) - float(base)
        if rule["direction"] == "down":
            regressed = delta < -float(rule["delta"])
        else:
            regressed = delta > float(rule["delta"])
        observed[metric] = {
            "current": cur,
            "baseline": base,
            "delta": round(delta, 4),
            "status": "REGRESSION" if regressed else "OK",
        }
        if regressed:
            regressions.append({
                "metric": metric,
                "current": cur,
                "baseline": base,
                "delta": round(delta, 4),
                "allowedDelta": rule["delta"],
            })

    return {
        "passed": not regressions,
        "regressionCount": len(regressions),
        "regressions": regressions,
        "observed": observed,
    }


__all__ = ["DEFAULT_THRESHOLDS", "compare_metrics"]
