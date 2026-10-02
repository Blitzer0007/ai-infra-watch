"""Meta-evaluation for the evaluation framework itself.

Human labels are the reference for whether an evaluator verdict is correct.
This measures evaluator agreement and surfaces false positives / negatives.
"""
from __future__ import annotations
from typing import Any, Iterable

def evaluate_meta(labels: Iterable[dict[str, Any]], predicted: dict[str, bool]) -> dict[str, Any]:
    rows = []
    for item in labels:
        case_id = str(item.get("id") or "")
        if case_id not in predicted:
            continue
        human_pass = bool(item.get("human_pass"))
        evaluator_pass = bool(predicted[case_id])
        rows.append({
            "id": case_id,
            "humanPass": human_pass,
            "evaluatorPass": evaluator_pass,
            "agreement": human_pass == evaluator_pass,
        })

    total = len(rows)
    agreement_count = sum(row["agreement"] for row in rows)
    tp = sum(row["humanPass"] and row["evaluatorPass"] for row in rows)
    tn = sum((not row["humanPass"]) and (not row["evaluatorPass"]) for row in rows)
    fp = sum((not row["humanPass"]) and row["evaluatorPass"] for row in rows)
    fn = sum(row["humanPass"] and (not row["evaluatorPass"]) for row in rows)

    if not total:
        kappa = None
    else:
        observed = agreement_count / total
        human_rate = sum(row["humanPass"] for row in rows) / total
        evaluator_rate = sum(row["evaluatorPass"] for row in rows) / total
        expected = human_rate * evaluator_rate + (1 - human_rate) * (1 - evaluator_rate)
        kappa = (observed - expected) / (1 - expected) if expected != 1 else 1.0

    return {
        "sampleSize": total,
        "agreementRate": round(agreement_count / total, 4) if total else 0.0,
        "cohensKappa": round(kappa, 4) if kappa is not None else None,
        "truePositive": tp,
        "trueNegative": tn,
        "falsePositive": fp,
        "falseNegative": fn,
        "mismatches": [row for row in rows if not row["agreement"]],
        "rows": rows,
    }
