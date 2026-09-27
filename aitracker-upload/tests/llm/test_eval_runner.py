"""Tests for the eval runner and its contract with /api/eval."""
from __future__ import annotations

from app.eval.run_eval import load_golden, run_eval, run_single
from app.config import settings


def test_golden_dataset_loads():
    cases = load_golden(settings.GOLDEN_PATH)
    assert len(cases) >= 20, "golden dataset should have ~20 entries"
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), "golden ids must be unique"
    for c in cases:
        assert c["id"].startswith("golden-")
        assert c["question"]


def test_run_eval_shape(llm_client):
    out = run_eval(client=llm_client)
    assert "metrics" in out and "failures" in out
    m = out["metrics"]
    assert set(("pass_rate", "total", "passed", "failed")).issubset(m)
    assert m["total"] >= 20
    assert 0.0 <= m["pass_rate"] <= 1.0
    # Failures carry id + reason + trace, matching the documented contract.
    for f in out["failures"]:
        assert "id" in f and "reason" in f and "trace" in f


def test_run_single_case(llm_client, golden):
    case = golden[0]
    res = run_single(case, client=llm_client)
    assert res["id"] == case["id"]
    assert "checks" in res


def test_stub_mode_is_deterministic(llm_client):
    a = run_eval(client=llm_client)["metrics"]["pass_rate"]
    b = run_eval(client=llm_client)["metrics"]["pass_rate"]
    assert a == b
