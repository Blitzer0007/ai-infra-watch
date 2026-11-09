"""Exercise the non-stub planner branch with fake model/tool objects only."""
import json
from types import SimpleNamespace

import pytest

from app.agents.autonomous import AutonomousMCPAgent
from app.mcp_client.client import ToolInfo


def tool(name, properties):
    return ToolInfo(server="stocks", name=name, description="Fictional read tool", input_schema={"properties": properties})


class FakeModel:
    provider = "openai"
    stub = False

    def __init__(self, answer):
        self.answer, self.prompts = answer, []

    def generate(self, prompt, **kwargs):
        self.prompts.append((prompt, kwargs))
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def agent(monkeypatch, answer):
    monkeypatch.setenv("AUTONOMOUS_MODE", "llm")
    model = FakeModel(answer)
    catalog = [tool("get_quote", {"symbol": {"type": "string"}}), tool("get_rotation", {})]
    toolbox = SimpleNamespace(tools=lambda: catalog, call=lambda *_: pytest.fail("no tool call expected"))
    return AutonomousMCPAgent(toolbox, client=model, jev=SimpleNamespace(enabled=False)), model, catalog


def test_nonstub_planner_calls_injected_model_and_parses_typed_action(monkeypatch):
    plan = {"action": "tool", "tool": "stocks.get_quote", "arguments": {"symbol": "NVDA"}}
    instance, model, catalog = agent(monkeypatch, json.dumps(plan))
    assert instance._plan("Get the NVDA quote", catalog, []) == plan
    assert len(model.prompts) == 1
    prompt, options = model.prompts[0]
    assert "stocks.get_quote" in prompt and "stocks.get_rotation" not in prompt
    assert options == {"max_tokens": 800, "temperature": 0.0}


def test_filing_planner_retains_scoped_milestone_tools(monkeypatch):
    instance, model, catalog = agent(monkeypatch, '{"action":"final"}')
    catalog.append(tool("get_milestones", {"symbols": {"type": "array"}}))
    instance._plan("Review NVDA SEC filings", catalog, [])
    assert "stocks.get_milestones" in model.prompts[0][0]
    assert "stocks.get_rotation" not in model.prompts[0][0]


@pytest.mark.parametrize("answer", ["not JSON", RuntimeError("fictional-private-provider-detail")])
def test_run_with_invalid_or_failed_planner_returns_fixed_error_without_io(monkeypatch, answer):
    instance, model, _ = agent(monkeypatch, answer)
    result = instance.run("Get the NVDA quote")
    assert result.resolution == "error" and result.calls == []
    assert result.error == "planner unavailable or invalid output" and not result.summary
    assert "fictional-private-provider-detail" not in result.error
    assert len(model.prompts) == 1
