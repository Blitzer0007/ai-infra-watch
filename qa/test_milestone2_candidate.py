"""Main-based Milestone 2 candidate smoke acceptance. Uses local UI mocks only."""
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis


@pytest.mark.parametrize("width", [360, 768, 1440])
def test_review_routes_and_explicit_source_coverage(page, width):
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 900})
    page.goto("/opportunities")
    expect(page.get_by_test_id("opportunity-scanner")).to_be_visible()
    expect(page.get_by_role("button", name="Scan loaded snapshot")).to_be_visible()
    page.goto("/calendar")
    expect(page.get_by_test_id("catalyst-calendar")).to_be_visible()
    expect(page.get_by_text("Calendar data is unavailable", exact=False)).to_be_visible()
    page.goto("/alerts")
    expect(page.get_by_test_id("alert-inbox")).to_be_visible()
    expect(page.get_by_text("Delivery", exact=False).first).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


@pytest.mark.parametrize("origin", ["calendar", "alerts"])
def test_direct_research_link_does_not_fake_an_original_event(page, origin):
    mock_local_apis(page)
    page.goto("/portfolio?portfolio_tab=research&research_symbol=NVDA&research_from=" + origin)
    workspace = page.get_by_test_id("company-research-workspace")
    expect(workspace).to_be_visible()
    expect(workspace.get_by_test_id("research-origin-context")).to_contain_text("context is unavailable")
    expect(workspace.get_by_test_id("research-source-boundary")).to_contain_text("independent evidence scopes")


def test_portfolio_evidence_navigation_cannot_create_scorecard_rows(page):
    mock_local_apis(page)
    writes = []
    page.on("request", lambda req: writes.append((req.method, req.url))
            if req.method not in ("GET", "HEAD") and "/api/signal-scorecard" in req.url else None)
    page.goto("/portfolio?portfolio_tab=evidence")
    expect(page.get_by_test_id("portfolio-intelligence")).to_be_visible()
    expect(page.get_by_text("Portfolio evidence", exact=False).first).to_be_visible()
    page.wait_for_timeout(1000)
    assert writes == [], "Opening portfolio evidence must not POST signal-scorecard observations"
