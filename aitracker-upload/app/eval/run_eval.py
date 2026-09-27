"""Evaluation runner shared by pytest and /api/eval.

Golden dataset: data/eval/golden.jsonl (one JSON object per line).
Each entry:

    {
      "id": "golden-001",
      "category": "synthesis | factual | ticker",
      "question": "What happened with NVDA today?",
      "expected": "<expected answer text>",
      "sources": [{"id": "doc-1", "url": "...", "text": "<source snippet>"}]
    }

The runner grades each case with the same assertion helpers pytest
uses, but returns scored results instead of throwing, so the endpoint
can report pass_rate + failures with trace info.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Callable

from app.assertions.semantic import assert_matches_schema
from app.assertions.semantic import (
    assert_no_hallucination,
    assert_semantically_similar,
    compute_similarity,
    claim_grounding_score,
)
from app.config import settings
from app.llm.client import LLMClient
from app.synthesis.pipeline import MarketSynthesis, synthesize


class GoldenCaseError(ValueError):
    """Raised when a golden.jsonl entry is malformed."""


def load_golden(path: Path | str | None = None) -> list[dict[str, Any]]:
    path = Path(path or settings.GOLDEN_PATH)
    if not path.exists():
        raise FileNotFoundError(f"Golden dataset not found: {path}")
    entries: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise GoldenCaseError(f"{path}:{lineno}: invalid JSON: {exc}") from exc
            if not isinstance(obj, dict) or "id" not in obj or "question" not in obj:
                raise GoldenCaseError(
                    f"{path}:{lineno}: entry must have at least 'id' and 'question'"
                )
            obj.setdefault("expected", "")
            obj.setdefault("sources", [])
            entries.append(obj)
    return entries


def _source_texts(case: dict[str, Any]) -> list[str]:
    """Extract source text snippets for grounding checks.

    Golden entries carry inline text so the hallucination heuristic has
    something to check claims against; future RAG stages will supply
    retrieved chunks here instead.
    """
    texts: list[str] = []
    for src in case.get("sources", []) or []:
        if isinstance(src, dict) and src.get("text"):
            texts.append(src["text"])
    return texts


def _data_facts(case: dict[str, Any]) -> list[str]:
    """Fact sentences derived from the case's data rows.

    The synthesis prompt declares every data field a fact ("all fields are
    facts"), so a summary claim about a move magnitude ("moved more than 3%")
    is grounded by the `change_pct` row, not the news `sources`. Grounding
    against news text alone would spuriously flag those data-derived claims;
    this mirrors the source set `tests/llm/test_synthesis.py` builds.
    """
    facts: list[str] = []
    for row in case.get("data", []) or []:
        if not isinstance(row, dict):
            continue
        name = row.get("name") or row.get("symbol") or ""
        symbol = row.get("symbol") or ""
        change = row.get("change_pct")
        if change is not None:
            facts.append(f"{name} ({symbol}) moved {change}%.")
        for item in row.get("news", []) or []:
            if item:
                facts.append(str(item))
    return facts


# ----------------------------------------------------------------------
# Per-case check functions (schema, semantic, grounding) — each returns
# (ok, reason, detail). The suite that runs them and the /api/eval
# endpoint both consume the same functions.
# ----------------------------------------------------------------------
def check_schema(case: dict[str, Any]) -> tuple[bool, str, dict[str, Any]]:
    if case.get("category") == "ticker":
        return True, "n/a", {}
    stock_data = case.get("data", [])
    try:
        result = synthesize(stock_data, question=case.get("question", ""))
    except Exception as exc:  # noqa: BLE001 - report any failure as a failure
        return False, f"synthesis exception: {exc}", {"exception": str(exc)[:400]}
    try:
        assert_matches_schema(result.model_dump(), MarketSynthesis)
    except AssertionError as exc:
        return False, f"schema mismatch: {exc}", {"detail": str(exc)[:400]}
    return True, "ok", {"insights": len(result.insights)}


def check_semantic(case: dict[str, Any]) -> tuple[bool, str, dict[str, Any]]:
    if not case.get("expected"):
        return True, "no expected answer; skipped", {}
    stock_data = case.get("data", [])
    try:
        raw = synthesize(stock_data, question=case.get("question", "")).summary
    except Exception as exc:  # noqa: BLE001
        return False, f"synthesis exception: {exc}", {"exception": str(exc)[:400]}
    score = compute_similarity(raw, case["expected"])
    ok = score >= settings.SEMANTIC_THRESHOLD
    reason = "ok" if ok else f"similarity {score:.3f} < {settings.SEMANTIC_THRESHOLD:.3f}"
    return ok, reason, {"score": round(score, 4), "output": raw[:300], "expected": case["expected"][:300]}


def check_grounding(case: dict[str, Any]) -> tuple[bool, str, dict[str, Any]]:
    # Doc-grounding (hallucination-vs-sources) is a narrative concern; it
    # does not apply to structured-field lookups (category "factual"),
    # whose answers come from the data rows, not the source docs. Those
    # are covered by the schema + semantic checks instead.
    if case.get("category") != "synthesis":
        return True, "grounding not applicable for this category", {}
    sources = _source_texts(case)
    if not sources:
        return True, "no sources; grounding skipped", {}
    # A synthesis claim can draw on several docs, so also allow grounding
    # against the union of all source snippets. Data-row facts (move
    # magnitudes, per-row news) are legitimate grounding too — the prompt
    # declares every data field a fact — so a claim like "moved more than 3%"
    # grounds against the data, not just the news sources.
    data_facts = _data_facts(case)
    candidates = sources + data_facts + [" ".join(sources)]
    stock_data = case.get("data", [])
    try:
        summary = synthesize(stock_data, question=case.get("question", "")).summary
    except Exception as exc:  # noqa: BLE001
        return False, f"synthesis exception: {exc}", {"exception": str(exc)[:400]}
    unsupported: list[str] = []
    for claim in summary.split(". "):  # simple claim split (same helper as assertions)
        claim = claim.strip()
        if not claim:
            continue
        # Skip clauses that are pure citation markers.
        if "https://" in claim:
            continue
        if claim_grounding_score(claim, candidates) < 0.2:
            unsupported.append(claim)
    ok = not unsupported
    reason = "ok" if ok else "ungrounded claims (heuristic)"
    return ok, reason, {"unsupported_claims": unsupported[:5]}


CHECK_FUNCS: dict[str, Callable[[dict[str, Any]], tuple[bool, str, dict[str, Any]]]] = {
    "schema": check_schema,
    "semantic": check_semantic,
    "grounding": check_grounding,
}


# ----------------------------------------------------------------------
# Runner
# ----------------------------------------------------------------------
def run_single(case: dict[str, Any], client: LLMClient | None = None) -> dict[str, Any]:
    """Run all checks against one golden case; return a result dict."""
    client = client or LLMClient()
    result: dict[str, Any] = {
        "id": case["id"],
        "category": case.get("category", "synthesis"),
        "checks": {},
        "failed": [],
    }
    for check_name, func in CHECK_FUNCS.items():
        ok, reason, detail = func(case)
        result["checks"][check_name] = {
            "passed": ok,
            "reason": reason,
            "detail": detail,
        }
        if not ok:
            result["failed"].append(check_name)
    return result


def run_eval(
    path: Path | str | None = None,
    case_id: str | None = None,
    client: LLMClient | None = None,
) -> dict[str, Any]:
    """Run the eval suite. Returns summary + failures with trace info.

    `case_id` selects a single golden entry (used by the ?case= query
    param on /api/eval).
    """
    cases = load_golden(path)
    if case_id:
        cases = [c for c in cases if c["id"] == case_id]
        if not cases:
            raise KeyError(f"No golden case with id={case_id!r}")

    client = client or LLMClient()
    results = [run_single(c, client=client) for c in cases]

    passed = sum(1 for r in results if not r["failed"])
    total = len(results)
    failures: list[dict[str, Any]] = []
    for r, case in zip(results, cases):
        if r["failed"]:
            failures.append(
                {
                    "id": r["id"],
                    "reason": ", ".join(f"{c}: {r['checks'][c]['reason']}" for c in r["failed"]),
                    "trace": r,
                }
            )
    metrics = {
        "pass_rate": round(passed / total, 4) if total else 0.0,
        "passed": passed,
        "total": total,
        "failed": len(failures),
        "threshold": settings.SEMANTIC_THRESHOLD,
        "model": client.model,
        "provider": client.provider,
        "duration_ms": None,  # filled by the caller / traced run
    }
    return {"metrics": metrics, "failures": failures, "results": results}


def run_eval_traced(
    path: Path | str | None = None,
    case_id: str | None = None,
    client: LLMClient | None = None,
) -> dict[str, Any]:
    """Like run_eval but appends a JSONL trace to data/traces/."""
    start = time.time()
    out = run_eval(path=path, case_id=case_id, client=client)
    out["metrics"]["duration_ms"] = round((time.time() - start) * 1000, 1)
    if settings.TRACE_ENABLED:
        from app.eval.trace import record_eval

        record_eval(out["metrics"], out["failures"])
    return out
