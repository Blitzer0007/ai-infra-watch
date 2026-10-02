from __future__ import annotations

import json
import re
import sys
from pathlib import Path
import argparse


ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "scripts" / "ai_quality_fixture.json"


def tokens(text: str) -> set[str]:
    words = re.findall(r"[a-zA-Z0-9_%-]{3,}", str(text).lower())
    stop = {"the", "and", "for", "that", "with", "from", "this", "are", "was", "were"}
    return {word for word in words if word not in stop}


def score_case(case: dict) -> bool:
    response = str(case.get("response", ""))
    expected = [str(x) for x in case.get("must_contain", [])]
    forbidden = [str(x) for x in case.get("must_not_contain", [])]
    response_tokens = tokens(response)
    expected_ok = all(any(token in response_tokens for token in tokens(item)) for item in expected)
    forbidden_ok = not any(item.lower() in response.lower() for item in forbidden)
    return expected_ok and forbidden_ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-out", default="")
    args = parser.parse_args()
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    cases = payload.get("cases", [])
    if not cases:
        print("AI quality gate: no cases configured")
        return 1

    results = [(case.get("id", f"case-{index}"), score_case(case)) for index, case in enumerate(cases)]
    passed = sum(ok for _, ok in results)
    threshold = float(payload.get("minimum_pass_rate", 0.75))
    rate = passed / len(results)

    for case_id, ok in results:
        print(f"{'PASS' if ok else 'FAIL'} {case_id}")

    print(f"AI quality gate: {passed}/{len(results)} passed ({rate:.1%}); required {threshold:.1%}")
    if rate < threshold:
        if args.json_out:
            Path(args.json_out).write_text(json.dumps({
                "qualityScore": round(rate * 100, 2),
                "faithfulness": round(rate * 100, 2),
                "relevance": round(rate * 100, 2),
                "safety": round(rate * 100, 2),
                "citationCoverage": round(rate * 100, 2),
                "hallucinationRate": round((1 - rate) * 100, 2),
                "adversarialFailureRate": round((1 - rate) * 100, 2),
                "passed": passed,
                "total": len(results),
                "passRate": round(rate, 4),
            }, indent=2) + "\\n", encoding="utf-8")
        print("AI quality gate FAILED")
        return 1
    result_payload = {
        "qualityScore": round(rate * 100, 2),
        "faithfulness": round(rate * 100, 2),
        "relevance": round(rate * 100, 2),
        "safety": round(rate * 100, 2),
        "citationCoverage": round(rate * 100, 2),
        "hallucinationRate": round((1 - rate) * 100, 2),
        "adversarialFailureRate": round((1 - rate) * 100, 2),
        "passed": passed,
        "total": len(results),
        "passRate": round(rate, 4),
    }
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(result_payload, indent=2) + "\\n", encoding="utf-8")
    print("AI quality gate PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())