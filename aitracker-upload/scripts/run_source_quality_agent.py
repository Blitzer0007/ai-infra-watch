#!/usr/bin/env python
"""Manually inspect loaded metadata or an explicitly fictional demo. No live adapters."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.agents.source_quality import MAX_INPUT_BYTES, QualityResult, SourceQualityAgent


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    inputs = parser.add_mutually_exclusive_group(required=True)
    inputs.add_argument("--demo", action="store_true", help="Use committed fictional, unsuitable evidence")
    inputs.add_argument("--input", type=Path, help="JSON file containing bounded loaded metadata")
    args = parser.parse_args()
    path = ROOT / "data/research/source-quality-demo.json" if args.demo else args.input
    try:
        with path.open("rb") as handle:
            raw = handle.read(MAX_INPUT_BYTES + 1)
        result = SourceQualityAgent().run_json(raw)
    except OSError:
        # Never echo private paths, payloads or exception bodies.
        result = QualityResult(status="failed", termination_reason="invalid-request")
    print(result.model_dump_json(indent=2))
    return 2 if result.status == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
