from __future__ import annotations

from app.eval.synthetic import coverage, generate_synthetic_cases, validate_catalog
from app.mcp_client.client import ToolInfo
from app.mcp_client.inprocess import InProcessMCPToolbox


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


def test_synthetic_cases_cover_full_inprocess_research_catalog():
    toolbox = InProcessMCPToolbox(live=False)
    cases = generate_synthetic_cases(toolbox.tools())
    families = {case.expected_family for case in cases}
    assert {
        "market", "news", "issuer_primary", "regulatory_primary",
        "analyst_consensus", "earnings", "event_study", "congress",
        "macro", "portfolio", "forecast", "quality", "relationship",
    }.issubset(families)


def test_real_catalog_schema_integrity():
    toolbox = InProcessMCPToolbox(live=False)
    report = validate_catalog(toolbox.tools())
    assert report["passed"] is True
    assert report["toolCount"] >= 20
