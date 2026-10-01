from mcp_client.inprocess import InProcessMCPToolbox

def test_inprocess_tool_catalog_has_complementary_servers():
    toolbox = InProcessMCPToolbox(live=False)
    assert toolbox.servers() == ["stocks", "filings", "news"]
    names = set(toolbox.tool_names())
    assert "stocks.get_snapshot" in names
    assert "filings.get_catalysts" in names
    assert "news.search" in names


def test_inprocess_stock_snapshot_is_usable():
    toolbox = InProcessMCPToolbox(live=False)
    result = toolbox.call("stocks.get_snapshot")
    assert isinstance(result, dict)
    assert result.get("quotes") is not None
    assert isinstance(result.get("quotes"), list)
