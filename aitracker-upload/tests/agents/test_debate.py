from __future__ import annotations

from app.agents.debate import run_debate


class FakeDebateClient:
    stub = False
    provider = "test"

    def __init__(self):
        self.prompts = []

    def generate(self, prompt, **kwargs):
        self.prompts.append(prompt)
        lower = prompt.lower()
        if "you are the bull analyst" in lower:
            return "Bull case: retrieved evidence shows improving demand and supportive momentum."
        if "you are the bear analyst" in lower:
            return "Bear case: retrieved evidence shows material uncertainty and downside risks."
        # Independent judges deliberately disagree 2-1 so majority handling is exercised.
        judge_count = len([p for p in self.prompts if "independent judge" in p.lower()])
        return (
            '{"verdict":"bull","confidence":0.8,"rationale":"More supporting evidence."}'
            if judge_count in {1, 2}
            else '{"verdict":"bear","confidence":0.7,"rationale":"Risk evidence remains material."}'
        )


def test_debate_runs_two_advocates_and_three_independent_judges():
    client = FakeDebateClient()
    result = run_debate(
        "Give me the bull and bear case for NVDA.",
        [{"tool": "stocks.get_quote", "output": {"symbol": "NVDA", "price": 200}}],
        client,
    )

    assert result.enabled is True
    assert "Bull case" in result.bull_case
    assert "Bear case" in result.bear_case
    assert len(result.judges) == 3
    assert result.majority == "bull"
    assert result.agreement == 2 / 3
    assert result.disagreement is False
    assert sum("independent judge" in p.lower() for p in client.prompts) == 3


def test_debate_marks_panel_disagreement_below_two_thirds():
    class SplitClient(FakeDebateClient):
        def generate(self, prompt, **kwargs):
            self.prompts.append(prompt)
            lower = prompt.lower()
            if "you are the bull analyst" in lower:
                return "Bull case."
            if "you are the bear analyst" in lower:
                return "Bear case."
            n = len([p for p in self.prompts if "independent judge" in p.lower()])
            verdict = ["bull", "bear", "mixed"][n - 1]
            return '{"verdict":"' + verdict + '","confidence":0.7,"rationale":"test"}'

    result = run_debate(
        "Bull vs bear for AMD.",
        [{"tool": "stocks.get_quote", "output": {"symbol": "AMD", "price": 180}}],
        SplitClient(),
    )
    assert len(result.judges) == 3
    assert result.disagreement is True
    assert result.agreement == 1 / 3
