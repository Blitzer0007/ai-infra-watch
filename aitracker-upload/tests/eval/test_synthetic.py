from __future__ import annotations

from app.eval.synthetic import coverage, generate_synthetic_cases
from app.mcp_client.client import ToolInfo


def tool(name, description="test tool", props=None, required=None):
    return ToolInfo(
        server=name.split(".")[0],
        name=name.split(".", 1)[1],
        description=description,
        input_schema={"type": "object", "properties": props or {}, "required": required or []},
    )


def test_synthetic_cases_follow_available_families():
    tools = [
        tool("stocks.get_quote", props={"symbol": {"type": "string"}}, required=["symbol"]),
        tool("news.search", props={"query": {"type": "string"}}, required=["query"]),
        tool("app.get_portfolio_context"),
        tool("app.get_forecast_context"),
        tool("app.get_quality_runs"),
        tool("app.get_macro_signals"),
        tool("app.search_congress_trades"),
    ]
    cases = generate_synthetic_cases(tools)
    report = coverage(cases)
    assert report["case_count"] == 7
    assert "portfolio" in report["families"]
    assert "forecast" in report["families"]
    assert "quality" in report["families"]
    assert "macro" in report["families"]
    assert "congress" in report["families"]
    assert next(c for c in cases if c.expected_family == "market").required_arguments == ("symbol",)
