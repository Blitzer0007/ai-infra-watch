"""App-wide navigation, source status and responsive shell, using mocked local APIs only."""
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis

ROUTES = [
    "overview", "opportunities", "calendar", "alerts",
    "portfolio", "watchlist", "jev-lab", "outlook",
    "contracts", "tracker", "congress", "macro", "research",
    "quality", "health", "guide", "settings",
]


def test_all_workspaces_are_discoverable_without_hidden_sidebar_links(page):
    mock_local_apis(page)
    page.goto("/overview")
    nav = page.get_by_test_id("app-navigation-desktop")
    expect(nav).to_be_visible()
    for group in ["Today", "Portfolio", "Research", "Operations"]:
        expect(nav.get_by_role("region", name=group + " workspaces")).to_be_visible()
    for view in ROUTES:
        button = nav.get_by_test_id("nav-" + view)
        expect(button).to_be_visible()
        assert button.get_attribute("title")
    assert nav.get_by_role("button").count() == 17
    expect(page.get_by_test_id("workspace-title")).to_have_text("Overview")
    page.get_by_test_id("nav-portfolio").click()
    expect(page.get_by_test_id("workspace-title")).to_have_text("Portfolio Intelligence")
    expect(nav.get_by_test_id("nav-portfolio")).to_have_attribute("aria-current", "page")
    page.get_by_role("button", name="Go to JEV Portfolio Lab").click()
    expect(page.get_by_test_id("workspace-title")).to_have_text("JEV Portfolio Lab")
    assert page.url.endswith("/jev-lab")
    page.go_back()
    expect(page.get_by_test_id("workspace-title")).to_have_text("Portfolio Intelligence")


@pytest.mark.parametrize("width", [360, 768])
def test_mobile_workspaces_and_dismissible_navigation_keep_routes(width, page):
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 900})
    page.goto("/alerts")
    expect(page.get_by_test_id("workspace-title")).to_have_text("Alert Inbox")
    menu = page.get_by_role("button", name="Open navigation menu")
    expect(menu).to_be_visible()
    menu.click()
    expanded = page.get_by_role("button", name="Close navigation menu")
    expect(expanded).to_have_attribute("aria-expanded", "true")
    nav = page.get_by_test_id("app-navigation-mobile")
    expect(nav).to_be_visible()
    for group in ["Today", "Portfolio", "Research", "Operations"]:
        expect(nav.get_by_role("region", name=group + " workspaces")).to_be_visible()
    expect(nav.get_by_test_id("mobile-nav-settings")).to_be_visible()
    page.keyboard.press("Escape")
    expect(page.get_by_test_id("app-navigation-mobile")).to_have_count(0)
    page.get_by_role("button", name="Open navigation menu").click()
    page.get_by_test_id("mobile-nav-health").click()
    expect(page.get_by_test_id("workspace-title")).to_have_text("Data Health")
    assert page.url.endswith("/health")
    expect(page.get_by_test_id("app-navigation-mobile")).to_have_count(0)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


@pytest.mark.parametrize("width", [360, 768, 1440])
def test_every_screen_uses_same_context_and_uncertainty_aware_feed(width, page):
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 900})
    page.goto("/contracts")
    expect(page.get_by_test_id("workspace-context")).to_be_visible()
    expect(page.get_by_test_id("workspace-title")).to_have_text("Contracts")
    expect(page.get_by_test_id("app-feed-status")).to_be_visible()
    expect(page.get_by_test_id("app-feed-status")).to_contain_text("Live Market Intelligence")
    expect(page.get_by_test_id("app-feed-status")).to_contain_text("source-level checks")
    expect(page.get_by_role("button", name="REFRESH FEED")).to_be_visible()
    expect(page.get_by_role("region", name="Observed market quotes")).to_be_visible()
    expect(page.get_by_test_id("application-workspace")).to_be_visible()
    expect(page.get_by_role("button", name="Go to Progress Tracker")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
