from __future__ import annotations
import argparse
import json
from pathlib import Path

from app.eval.regression import compare_metrics

parser = argparse.ArgumentParser()
parser.add_argument("--current", required=True)
parser.add_argument("--baseline", required=True)
args = parser.parse_args()

current = json.loads(Path(args.current).read_text(encoding="utf-8"))
baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
result = compare_metrics(current, baseline)
print(json.dumps(result, indent=2, sort_keys=True))
raise SystemExit(0 if result["passed"] else 1)
