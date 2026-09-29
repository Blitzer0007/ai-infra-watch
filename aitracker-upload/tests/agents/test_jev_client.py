from __future__ import annotations

from app.jev.assess import ASSESSMENTS, assess
from app.jev.client import JevClient


def test_platform_assessment_defines_multiple_typed_questions():
    questions = ASSESSMENTS["platform"]
    assert set(questions) == {"attention", "evidence_quality"}
    assert questions["attention"]["type"] == "choice"
    assert questions["evidence_quality"]["type"] == "score"


def test_jev_client_evaluate_parses_choice_and_score(tmp_path, monkeypatch):
    captured = {}

    class Response:
        status_code = 200
        text = "ok"

        @staticmethod
        def json():
            return {
                "model": "jev-1.13.0",
                "answers": {
                    "attention": {
                        "type": "choice",
                        "choice": "mixed",
                        "confidence": 0.91,
                        "probabilities": {"mixed": 0.91, "monitor": 0.09},
                    },
                    "evidence_quality": {
                        "type": "score",
                        "score": 2.72,
                        "confidence": 0.77,
                        "legend": {
                            "0": "Sparse",
                            "1": "Partial",
                            "2": "Usable",
                            "3": "Strong",
                        },
                        "probabilities": {"2": 0.28, "3": 0.72},
                    },
                },
                "usage": {"input_tokens": 321},
            }

    class Client:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def post(self, url, json, headers):
            captured["url"] = url
            captured["body"] = json
            return Response()

    monkeypatch.setattr("app.jev.client.httpx.Client", Client)

    client = JevClient(api_key="test-key", model="jev-1.13.0", timeout_sec=3)
    evaluation = client.evaluate(
        state='{"symbol":"NVDA","stress":42}',
        questions=ASSESSMENTS["platform"],
    )

    assert evaluation.usable
    assert evaluation.model == "jev-1.13.0"
    assert evaluation.input_tokens == 321
    assert evaluation.answers["attention"].choice == "mixed"
    assert evaluation.answers["attention"].confidence == 0.91
    assert evaluation.answers["evidence_quality"].score == 2.72
    assert captured["body"]["model"] == "jev-1.13.0"
    assert set(captured["body"]["questions"]) == {"attention", "evidence_quality"}


def test_assess_returns_disabled_error_without_key(monkeypatch):
    import app.jev.assess as assess_module
    monkeypatch.setattr(assess_module.settings, "JEV_ENABLED", True)
    evaluation = assess("platform", {"x": 1}, JevClient(api_key=""))
    assert not evaluation.usable
    assert "not configured" in evaluation.error
