"""Validate a historical evidence bundle and verify evidence artifact hashes.

The tool validates the supplied JSON rows and confirms every referenced evidence
artifact exists under --artifact-root and matches its SHA-256. A PASS is structural
and chronological validation only; it is not independent vendor authentication.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any

from .historical_evidence import validate_price_evidence, validate_universe_membership


def _read_rows(path: Path, preferred_key: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Could not read valid JSON from {path.name}: {type(exc).__name__}") from exc

    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict) and isinstance(data.get(preferred_key), list):
        rows = data[preferred_key]
    else:
        raise ValueError(f"{path.name} must be a JSON array or an object containing '{preferred_key}' array")
    if not all(isinstance(row, dict) for row in rows):
        raise ValueError(f"{path.name} must contain only JSON objects")
    return rows


def validate_bundle(
    price_rows: list[dict[str, Any]],
    membership_rows: list[dict[str, Any]],
    artifact_root: str | Path,
) -> dict[str, Any]:
    root = Path(artifact_root).resolve()
    if not root.is_dir():
        raise ValueError("--artifact-root must point to an existing directory")
    prices = validate_price_evidence(price_rows, artifact_root=root)
    membership = validate_universe_membership(membership_rows, artifact_root=root)
    historical_gate = "PASS" if prices["status"] == "PASS" and membership["status"] == "PASS" else "BLOCKED"
    return {
        "schema_version": 1,
        "validated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "artifact_root_name": root.name,
        "price_evidence": prices,
        "universe_membership": membership,
        "historical_evidence_gate": historical_gate,
        "release_note": (
            "A PASS verifies row schema, chronology, artifact existence, and artifact hashes. "
            "A qualified reviewer must still verify the evidence source, vendor licensing, record identity, "
            "publication-time meaning, adjustment semantics, and universe definition."
        ),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--price-evidence-json", required=True, help="JSON array or report containing price_rows")
    parser.add_argument("--membership-json", required=True, help="JSON array or report containing membership_rows")
    parser.add_argument("--artifact-root", required=True, help="Directory containing the source/evidence artifacts referenced by relative paths")
    parser.add_argument("--output", help="Optional path to write the validation report JSON")
    args = parser.parse_args(argv)

    try:
        price_rows = _read_rows(Path(args.price_evidence_json), "price_rows")
        membership_rows = _read_rows(Path(args.membership_json), "membership_rows")
        report = validate_bundle(price_rows, membership_rows, args.artifact_root)
    except ValueError as exc:
        print(f"Validation input error: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(report, indent=2, sort_keys=True)
    print(rendered)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    return 0 if report["historical_evidence_gate"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
