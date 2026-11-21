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
    header = page.locator(".aiw-mobile-header").bounding_box()
    actions = page.locator(".aiw-top-actions").bounding_box()
    assert actions["y"] >= header["y"] + header["height"], "Header must not cover search or its context"
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


@pytest.mark.parametrize("width", [390, 1440])
def test_light_workspace_remains_readable_on_every_route(width, page):
    """Catch dark legacy styles and narrow-screen regressions across the whole app."""
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 1000})
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("request", lambda request: writes.append(request.url)
            if "/api/" in request.url and request.method not in ("GET", "HEAD", "OPTIONS") else None)
    for route in ROUTES:
        page.goto("/" + route)
        title = page.get_by_test_id("workspace-title")
        expect(title).to_be_visible()
        # Test luminance and contrast, rather than pinning a particular theme hex.
        appearance = title.evaluate("""title => {
            const rgb = color => color.match(/[\\d.]+/g).slice(0, 3).map(Number);
            const luminance = color => rgb(color).map(c => c / 255)
                .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
                .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
            const canvas = luminance(getComputedStyle(title.closest('.aiw-application')).backgroundColor);
            const ink = luminance(getComputedStyle(title).color);
            return {canvas, contrast: (canvas + .05) / (ink + .05)};
        }""")
        assert appearance["canvas"] > .9, route
        assert appearance["contrast"] >= 7, route
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), route
    assert errors == []
    assert writes == [], "Browsing research workspaces must not write API records"


@pytest.mark.parametrize("width", [390, 1440])
def test_progressive_details_keep_warnings_and_keyboard_access(width, page):
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 1000})
    page.goto("/overview")
    feed = page.get_by_test_id("app-feed-status")
    expect(feed.get_by_role("button", name="REFRESH FEED")).to_be_visible()
    source = feed.locator("details")
    expect(source).not_to_have_attribute("open", "")
    source.locator("summary").focus()
    page.keyboard.press("Enter")
    expect(source.get_by_text("Data feeds and quote observations", exact=False)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.keyboard.press("Enter")

    gate = page.get_by_test_id("pre-trade-gate")
    expect(gate.get_by_text("Portfolio review is incomplete", exact=True)).to_be_visible()
    expect(gate.get_by_text("Accounting reconciliation", exact=True)).not_to_be_visible()
    gate.get_by_text("Review data readiness", exact=True).click()
    expect(gate.get_by_text("Accounting reconciliation", exact=True)).to_be_visible()
    # Low-opacity legacy text previously became white on white after the theme switch.
    detail_color = gate.get_by_text("Matched loaded records", exact=False).evaluate(
        "element => getComputedStyle(element).color")
    assert detail_color != "rgb(255, 255, 255)"

    guide = page.locator("details").filter(has=page.get_by_text("Understand the AI infrastructure ecosystem", exact=True))
    expect(guide.get_by_text("How Every Stock Connects (In Plain English)", exact=True)).not_to_be_visible()
    guide.locator("summary").click()
    expect(guide.get_by_text("How Every Stock Connects (In Plain English)", exact=True)).to_be_visible()
