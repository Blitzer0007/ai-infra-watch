#!/usr/bin/env python
"""Replay frozen fictional council cases locally. No credentials, network or models."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.eval.council_grounding import DEFAULT_SUITE, run_suite


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, default=DEFAULT_SUITE)
    args = parser.parse_args()
    try:
        report = run_suite(args.cases)
    except (ValueError, OSError, KeyError, IndexError, TypeError):
        print(json.dumps({"version": "council-grounding-eval-v2", "status": "invalid-evaluation-input"}))
        return 2
    print(json.dumps(report, indent=2, allow_nan=False))
    # Expected behavior includes documented semantic counterexamples. This exit
    # status is a regression check, never a semantic-safety or release approval.
    return 0 if report["expected_behavior"]["rate"] == 1 else 1


if __name__ == "__main__":
    raise SystemExit(main())
