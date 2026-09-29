from __future__ import annotations

from app.llm.client import LLMClient


def test_openai_model_override_is_sent_to_provider(tmp_path, monkeypatch):
    captured = {}

    class Response:
        status_code = 200
        text = "ok"

        @staticmethod
        def json():
            return {
                "choices": [{"message": {"content": "final answer"}}],
                "usage": {},
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

    monkeypatch.setattr("app.llm.client.httpx.Client", Client)

    client = LLMClient(
        provider="openai",
        model="planner-model",
        api_key="test-key",
        cache_dir=tmp_path,
    )
    result = client.generate(
        "Write one sentence.",
        max_tokens=32,
        timeout_sec=5,
        max_retries=0,
        model="openai/gpt-oss-20b",
        reasoning_effort="low",
    )

    assert result == "final answer"
    assert captured["timeout"] == 5
    assert captured["body"]["model"] == "openai/gpt-oss-20b"
    assert captured["body"]["reasoning_effort"] == "low"
