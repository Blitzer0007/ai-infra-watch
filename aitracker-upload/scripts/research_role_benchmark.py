"""Offline authored priority comparison; live requires one explicit fictional case."""
import argparse
import json
from app.eval.research_role_benchmark import run_priority_benchmark, render_priorities


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", dest="case_id", help="Bundled fictional case; required for --live")
    parser.add_argument("--live", action="store_true", help="One dedicated-development trial, at most six provider attempts")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()
    try:
        report = run_priority_benchmark(case_id=args.case_id, live=args.live)
        output = render_priorities(report) if args.format == "markdown" else json.dumps(report, sort_keys=True, allow_nan=False)
    except Exception:
        print(json.dumps({"status": "research-priority-comparison-unavailable", "fictional_only": True}))
        return 2
    print(output)
    return 0 if report["status"] in ("offline-controls-ready", "live-trial-complete") else 1


if __name__ == "__main__":
    raise SystemExit(main())
