"""Offline by default; an explicit single-case live trial uses at most six calls."""
import argparse
import json
from app.eval.council_benchmark import render_markdown, run_benchmark


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", dest="case_id", help="One bundled fictional case ID; required with --live")
    parser.add_argument("--live", action="store_true", help="Explicit dedicated-development provider trial")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()
    try:
        report = run_benchmark(case_id=args.case_id, live=args.live)
    except Exception:
        print(json.dumps({"status": "benchmark-unavailable", "fictional_only": True}))
        return 2
    print(render_markdown(report) if args.format == "markdown" else json.dumps(report, sort_keys=True, allow_nan=False))
    return 0 if report["status"] in ("offline-controls-ready", "live-trial-complete") else 1


if __name__ == "__main__":
    raise SystemExit(main())
