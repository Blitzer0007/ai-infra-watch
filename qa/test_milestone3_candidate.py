"""Milestone 3 manual research paths: fictional fixture data, zero passive writes."""
import pytest
from playwright.sync_api import expect
from test_release2 import fictional_portfolio


@pytest.fixture(autouse=True)
def no_page_errors_or_writes(page):
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda req: writes.append((req.method, req.url)) if req.method not in ("GET", "HEAD") else None)
    yield
    assert errors == []
    assert writes == []


@pytest.mark.parametrize("width", [360, 768, 1440])
def test_manual_source_coverage_is_frozen_and_never_calls_a_provider(page, width):
    fictional_portfolio(page)
    page.set_viewport_size({"width": width, "height": 900})
    page.goto("/opportunities")
    scanner = page.get_by_test_id("opportunity-scanner")
    scanner.get_by_role("button", name="Scan loaded snapshot", exact=True).click()
    coverage = scanner.get_by_test_id("source-coverage-summary")
    expect(coverage).to_be_visible()
    coverage.locator("summary").click()
    expect(coverage).to_contain_text("Declared providers and timestamps are metadata")
    expect(coverage).to_contain_text("Re-scan to refresh inputs")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def test_production_safe_council_preflight_is_manual_and_never_calls_an_agent(page):
    fictional_portfolio(page)
    page.goto("/jev-lab")
    preflight = page.get_by_test_id("council-evidence-readiness")
    expect(preflight).to_be_visible()
    preflight.locator("summary").click()
    expect(preflight).to_contain_text("not three live AI predictions")
    page.wait_for_load_state("networkidle")
    attempts = []
    page.on("request", lambda req: attempts.append(req.url) if "/api/agent-ask?task=council" in req.url else None)
    preflight.get_by_role("button", name="Inspect loaded evidence (no network)").click()
    expect(preflight.locator('[data-testid="council-evidence-receipt"],[role="alert"]')).to_have_count(1)
    assert attempts == []


@pytest.mark.parametrize("width", [360, 1440])
def test_company_catalyst_daily_review_retains_exact_source_scope_without_writes(page, width):
    fictional_portfolio(page)
    page.set_viewport_size({"width": width, "height": 900})
    page.goto("/portfolio?portfolio_tab=research&research_symbol=DEMO")
    research = page.get_by_test_id("company-research-workspace")
    expect(research).to_contain_text("Watchlist company · no loaded position")
    review = research.get_by_test_id("controlled-company-research")
    expect(review).to_be_visible()
    review.locator("summary").click()
    review.get_by_role("button", name="Inspect research coverage").click()
    receipt = review.get_by_test_id("controlled-research-receipt")
    expect(receipt).to_contain_text("Company Research")
    expect(receipt).to_contain_text("No original clicked Calendar/Inbox record")
    expect(receipt).to_contain_text("This is not a loaded holding")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
