#!/usr/bin/env python3
"""Run the lightweight golden evaluation suite as a CI quality gate.

This deliberately uses the deterministic stub LLM so the check is free,
hermetic, and safe to run continuously. It is a minimum-quality gate, not a
prediction of model performance in production.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from app.eval.run_eval import run_eval
from app.llm.client import LLMClient


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-pass-rate", type=float, default=float(os.getenv("QUALITY_MIN_PASS_RATE", "0.90")))
    parser.add_argument("--output", default="quality-report.json")
    args = parser.parse_args()

    result = run_eval(client=LLMClient(provider="stub", model="stub"))
    metrics = result["metrics"]
    report = {
        "metrics": metrics,
        "threshold": args.min_pass_rate,
        "ok": metrics["pass_rate"] >= args.min_pass_rate and metrics["failed"] == 0,
        "failures": result["failures"],
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "pass_rate": metrics["pass_rate"],
        "passed": metrics["passed"],
        "total": metrics["total"],
        "failed": metrics["failed"],
        "threshold": args.min_pass_rate,
    }))

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())