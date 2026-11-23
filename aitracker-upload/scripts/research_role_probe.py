"""Explicit one-case development probe; offline fixture by default."""
import argparse
import json
from app.eval.research_role_probe import run_probe, render_probe


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", dest="case_id", help="Bundled fictional case; required for --live")
    parser.add_argument("--live", action="store_true", help="Use the dedicated development role models, at most six calls")
    parser.add_argument("--format", choices=("json", "markdown"), default="json")
    args = parser.parse_args()
    try:
        report = run_probe(case_id=args.case_id, live=args.live)
        output = render_probe(report) if args.format == "markdown" else json.dumps(report, sort_keys=True, allow_nan=False)
    except Exception:
        print(json.dumps({"status": "research-role-probe-unavailable", "fictional_only": True}))
        return 2
    print(output)
    return 0 if report["status"] in ("offline-fixture", "live-trial-complete") and report["agent"]["status"] == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(main())
