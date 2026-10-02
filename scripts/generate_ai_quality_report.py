from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "aitracker-upload"))

from app.eval.meta_eval import evaluate_meta
from app.eval.red_team import DEFAULT_RED_TEAM_CASES, evaluate_suite
from app.eval.regression import compare_metrics

parser = argparse.ArgumentParser()
parser.add_argument("--current", required=True)
parser.add_argument("--baseline", required=True)
parser.add_argument("--meta-labels", default="scripts/ai_quality_human_labels.json")
parser.add_argument("--meta-predictions", default="scripts/ai_quality_meta_predictions.json")
parser.add_argument("--output", default="AI_Quality_Report.md")
args = parser.parse_args()

current = json.loads(Path(args.current).read_text(encoding="utf-8"))
baseline = json.loads(Path(args.baseline).read_text(encoding="utf-8"))
labels = json.loads(Path(args.meta_labels).read_text(encoding="utf-8"))
predictions = json.loads(Path(args.meta_predictions).read_text(encoding="utf-8")).get("predicted", {})

red_fixture = json.loads((ROOT / "scripts" / "ai_red_team_fixture.json").read_text(encoding="utf-8"))
red_team = evaluate_suite(DEFAULT_RED_TEAM_CASES, red_fixture.get("responses", {}))
regression = compare_metrics(current, baseline)
meta = evaluate_meta(labels, {str(k): bool(v) for k, v in predictions.items()})

def pct(value):
    return "—" if value is None else f"{float(value):.1f}%"

lines = [
    "# AI Infra Watch — AI Quality Report",
    "",
    f"Generated from deterministic CI evaluation for {current.get('total', 0)} core quality cases.",
    "",
    "## Core quality gate",
    f"- Quality score: **{pct(current.get('qualityScore'))}**",
    f"- Pass rate: **{pct(float(current.get('passRate', 0)) * 100)}**",
    f"- Cases passed: **{current.get('passed', 0)}/{current.get('total', 0)}**",
    "",
    "## Red-team harness",
    f"- Cases passed: **{red_team['passed']}/{red_team['total']}**",
    f"- Pass rate: **{red_team['pass_rate'] * 100:.1f}%**",
    "",
    "## Regression comparison",
    f"- Status: **{'PASS' if regression['passed'] else 'REGRESSION'}**",
    f"- Material regressions: **{regression['regressionCount']}**",
]
for row in regression["regressions"]:
    lines.append(f"- {row['metric']}: {row['baseline']} -> {row['current']} (delta {row['delta']})")

lines += [
    "",
    "## Evaluator meta-evaluation",
    f"- Human-labeled sample: **{meta['sampleSize']}**",
    f"- Evaluator agreement: **{meta['agreementRate'] * 100:.1f}%**",
    f"- Cohen's kappa: **{meta['cohensKappa']}**",
    f"- False positives: **{meta['falsePositive']}**",
    f"- False negatives: **{meta['falseNegative']}**",
    "",
    "## Interpretation",
    "- These are diagnostic evaluation signals, not proof of factual correctness.",
    "- Regression thresholds should be reviewed when the evaluator or dataset changes.",
]

Path(args.output).write_text("\\n".join(lines) + "\\n", encoding="utf-8")
print(f"Wrote {args.output}")
