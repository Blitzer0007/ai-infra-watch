from mcp_client.inprocess import InProcessMCPToolbox

def test_inprocess_tool_catalog_has_complementary_servers():
    toolbox = InProcessMCPToolbox(live=False)
    assert toolbox.servers() == ["stocks", "filings", "news", "app"]
    names = set(toolbox.tool_names())
    assert "stocks.get_snapshot" in names
    assert "filings.get_catalysts" in names
    assert "news.search" in names
    assert "app.get_portfolio_context" in names
    assert "app.get_forecast_context" in names
    assert "app.get_quality_runs" in names
    assert "app.search_congress_trades" in names
    assert "app.get_macro_signals" in names
    assert "app.get_political_signals" in names


def test_inprocess_stock_snapshot_is_usable():
    toolbox = InProcessMCPToolbox(live=False)
    result = toolbox.call("stocks.get_snapshot")
    assert isinstance(result, dict)
    assert result.get("quotes") is not None
    assert isinstance(result.get("quotes"), list)


def test_inprocess_application_sources_are_hermetic_in_fixture_mode():
    toolbox = InProcessMCPToolbox(live=False)
    portfolio = toolbox.call("app.get_portfolio_context")
    assert portfolio["mode"] == "fixture"
    assert portfolio["holdings"]
    forecast = toolbox.call("app.get_forecast_context")
    assert forecast["mode"] == "fixture"
    quality = toolbox.call("app.get_quality_runs")
    assert quality["mode"] == "fixture"
    congress = toolbox.call("app.search_congress_trades", {"symbol": "NVDA"})
    assert congress["mode"] == "fixture"
    macro = toolbox.call("app.get_macro_signals")
    assert len(macro["signals"]) >= 3
    political = toolbox.call("app.get_political_signals")
    assert political["mode"] == "fixture"
