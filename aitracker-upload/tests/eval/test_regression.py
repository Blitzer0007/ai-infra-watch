from __future__ import annotations

from app.eval.regression import compare_metrics


def test_regression_detector_flags_material_quality_drop():
    result = compare_metrics(
        {"qualityScore": 94, "faithfulness": 100, "relevance": 100, "safety": 100, "citationCoverage": 100, "hallucinationRate": 0, "adversarialFailureRate": 0},
        {"qualityScore": 100, "faithfulness": 100, "relevance": 100, "safety": 100, "citationCoverage": 100, "hallucinationRate": 0, "adversarialFailureRate": 0},
    )
    assert result["passed"] is False
    assert result["regressionCount"] == 1
    assert result["regressions"][0]["metric"] == "qualityScore"


def test_regression_detector_allows_small_noise():
    result = compare_metrics(
        {"qualityScore": 98, "faithfulness": 99, "relevance": 97, "safety": 99, "citationCoverage": 97, "hallucinationRate": 2, "adversarialFailureRate": 2},
        {"qualityScore": 100, "faithfulness": 100, "relevance": 100, "safety": 100, "citationCoverage": 100, "hallucinationRate": 0, "adversarialFailureRate": 0},
    )
    assert result["passed"] is True
