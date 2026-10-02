from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "aitracker-upload"))
from app.eval.red_team import DEFAULT_RED_TEAM_CASES, evaluate_suite

FIXTURE = ROOT / "scripts" / "ai_red_team_fixture.json"

def main() -> int:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    result = evaluate_suite(DEFAULT_RED_TEAM_CASES, payload.get("responses", {}))
    for row in result["results"]:
        print(f"{'PASS' if row['passed'] else 'FAIL'} {row['id']} — {row['reason']}")
    print(f"AI red-team harness: {result['passed']}/{result['total']} passed ({result['pass_rate']:.1%}); required {float(payload.get('minimum_pass_rate', 1.0)):.1%}")
    return 0 if result["pass_rate"] >= float(payload.get("minimum_pass_rate", 1.0)) else 1

if __name__ == "__main__":
    raise SystemExit(main())
