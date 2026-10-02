from __future__ import annotations
from app.eval.meta_eval import evaluate_meta

def test_meta_eval_reports_mismatches():
    result = evaluate_meta(
        [{"id":"a","human_pass":True},{"id":"b","human_pass":False},{"id":"c","human_pass":True}],
        {"a":True,"b":False,"c":False},
    )
    assert result["sampleSize"] == 3
    assert result["agreementRate"] == 2 / 3
    assert result["falseNegative"] == 1
    assert result["mismatches"][0]["id"] == "c"

def test_meta_eval_perfect_agreement():
    result = evaluate_meta(
        [{"id":"a","human_pass":True},{"id":"b","human_pass":False}],
        {"a":True,"b":False},
    )
    assert result["agreementRate"] == 1.0
    assert result["cohensKappa"] == 1.0
