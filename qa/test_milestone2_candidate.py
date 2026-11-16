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
    expect(page.get_by_text("Evidence coverage", exact=True).first).to_be_visible()
    page.wait_for_timeout(1000)
    assert writes == [], "Opening portfolio evidence must not POST signal-scorecard observations"


def test_selected_calendar_record_stays_distinct_from_financial_dossier(page):
    """Only the clicked source row is retained in memory; no new financial reads."""
    from test_catalyst_calendar import prepare, load_snapshot, fixture_event
    page.add_init_script('localStorage.setItem("aiw_config_v1",JSON.stringify({watchlist:["FICT"],alerts:[],finnhubKey:""}))')
    prepare(page, [
        fixture_event(id="first", title="First fictional issuer event"),
        fixture_event(id="second", title="Second fictional issuer revision", sourceUrl="https://example.com/issuer/second")
    ])
    calendar = load_snapshot(page)
    reads, writes = [], []
    page.on("request", lambda req: reads.append(req.url) if "/api/earnings-alerts" in req.url else None)
    page.on("request", lambda req: writes.append((req.method, req.url)) if req.method not in ("GET", "HEAD") else None)
    calendar.get_by_test_id("catalyst-event").filter(has_text="Second fictional issuer revision").get_by_role(
        "link", name="Research FICT", exact=True).click()
    research = page.get_by_test_id("company-research-workspace")
    origin = research.get_by_test_id("research-origin-context")
    expect(origin).to_contain_text("Second fictional issuer revision")
    expect(origin).not_to_contain_text("First fictional issuer event")
    expect(research.get_by_test_id("research-source-boundary")).to_contain_text("independent evidence scopes")
    assert "Second fictional" not in page.url
    assert "sourceUrl" not in page.url
    research.get_by_text("Company dossier", exact=True).click()
    expect(research.get_by_test_id("dossier-source-status")).to_contain_text("Financial source not connected")
    research.get_by_role("link", name="Return to Calendar", exact=True).click()
    expect(page.get_by_test_id("catalyst-calendar")).to_be_visible()
    assert reads == [] and writes == []


def test_inbox_provider_receipt_is_not_corroboration_and_does_not_replay(page):
    """Provider acceptance cannot become a read receipt, issuer fact, or automatic resend."""
    from test_alert_inbox import open_inbox, LOCAL, server_item, payload
    import json
    page.add_init_script('localStorage.setItem("aiw_config_v1",JSON.stringify({watchlist:["FICT"],alerts:[],finnhubKey:""}))')
    inbox = open_inbox(page, [LOCAL])
    calls, writes = [], []
    page.on("request", lambda req: writes.append(req.url) if req.method not in ("GET", "HEAD") else None)
    def respond(route):
        calls.append(route.request.url)
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(payload([server_item()])))
    page.route("**/api/alert-inbox*", respond)
    inbox.get_by_role("button", name="Load server delivery history", exact=True).click()
    record = inbox.get_by_test_id("inbox-record").filter(has_text="Server delivery record")
    expect(record).to_have_count(1)
    record.get_by_role("link", name="Research FICT", exact=True).click()
    research = page.get_by_test_id("company-research-workspace")
    expect(research.get_by_test_id("research-origin-context")).to_contain_text("not a read receipt")
    expect(research.get_by_test_id("research-source-boundary")).to_contain_text("Telegram provider receipt")
    assert "providerMessageId" not in page.url and "episodeId" not in page.url
    research.get_by_role("link", name="Return to Alert inbox", exact=True).click()
    expect(page.get_by_test_id("alert-inbox").get_by_test_id("inbox-record")).to_have_count(2)
    assert len(calls) == 1 and writes == []


def test_portfolio_editor_draft_survives_section_switch_without_saving(page):
    """Same mounted editor retains typed values; no implicit portfolio API writes."""
    mock_local_apis(page)
    writes = []
    page.on("request", lambda req: writes.append((req.method, req.url))
            if req.method not in ("GET", "HEAD") else None)
    page.goto("/portfolio?portfolio_tab=holdings")
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.get_by_test_id("portfolio-management").locator("summary").click()
    portfolio.get_by_test_id("portfolio-add-holding").click()
    portfolio.get_by_test_id("portfolio-field-ticker").fill("FICT")
    portfolio.get_by_test_id("portfolio-field-notes").fill("Fictional unsubmitted draft")
    expect(portfolio.get_by_test_id("portfolio-unsaved-draft")).to_contain_text("unsaved")
    portfolio.get_by_role("button", name="Evidence", exact=True).click()
    expect(portfolio.get_by_test_id("portfolio-field-ticker")).to_have_value("FICT")
    expect(portfolio.get_by_test_id("portfolio-field-notes")).to_have_value("Fictional unsubmitted draft")
    portfolio.get_by_role("button", name="My Holdings", exact=True).click()
    expect(portfolio.get_by_test_id("portfolio-field-ticker")).to_have_value("FICT")
    assert writes == []
    portfolio.get_by_role("button", name="Cancel", exact=True).last.click()
    assert portfolio.get_by_test_id("portfolio-unsaved-draft").count() == 0


def test_null_journal_weekly_and_unavailable_holdings_preserve_app_shell(page):
    """Incomplete optional backend data must never crash the whole dashboard."""
    from test_release2 import fictional_portfolio
    errors = []
    page.on("pageerror", lambda err: errors.append(str(err)))
    fictional_portfolio(page)
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(
        status=503, content_type="application/json", body="{}"))
    page.route("**/api/decision-journal*", lambda route: route.fulfill(
        status=200, content_type="application/json", body='{"entries":[],"weekly":null}'))
    page.goto("/")
    expect(page.get_by_test_id("decision-journal")).to_be_visible()
    expect(page.get_by_test_id("decision-weekly-review")).to_be_visible()
    expect(page.get_by_test_id("decision-journal")).to_contain_text("UNAVAILABLE")
    page.get_by_test_id("nav-opportunities").click()
    expect(page.get_by_test_id("opportunity-scanner")).to_be_visible()
    assert errors == []


def test_command_center_reviews_loaded_holding_without_upgrading_unknown_data(page):
    """The main-based candidate starts with a review queue, not an inferred trade order."""
    from test_release2 import fictional_portfolio
    fictional_portfolio(page)
    writes = []
    page.on("request", lambda req: writes.append(req.url)
            if req.method not in ("GET", "HEAD") else None)
    page.goto("/portfolio")
    root = page.get_by_test_id("portfolio-intelligence")
    expect(root.get_by_test_id("portfolio-navigation")).to_be_visible()
    center = root.get_by_test_id("portfolio-command-center")
    expect(center).to_be_visible()
    card = center.get_by_test_id("position-decision-card")
    expect(card).to_have_count(1)
    expect(card).to_contain_text("FICT")
    expect(card).to_contain_text("Not enough reliable data")
    assert writes == []
    card.get_by_role("button", name="Evidence and research", exact=True).click()
    expect(root.get_by_test_id("portfolio-navigation").get_by_role(
        "combobox", name="Portfolio section")).to_have_value("evidence")
    assert "portfolio_tab=evidence" in page.url
    assert writes == []


def test_portfolio_back_forward_restores_section_and_retains_unsubmitted_editor(page):
    """URL history is navigation state; the unsaved form is never serialized or submitted."""
    mock_local_apis(page)
    writes = []
    page.on("request", lambda req: writes.append(req.url)
            if req.method not in ("GET", "HEAD") else None)
    page.goto("/portfolio?portfolio_tab=holdings")
    root = page.get_by_test_id("portfolio-intelligence")
    nav = root.get_by_test_id("portfolio-navigation")
    picker = nav.get_by_role("combobox", name="Portfolio section")
    expect(picker).to_have_value("holdings")
    root.get_by_test_id("portfolio-management").locator("summary").click()
    root.get_by_test_id("portfolio-add-holding").click()
    root.get_by_test_id("portfolio-field-ticker").fill("FICT")
    root.get_by_test_id("portfolio-field-notes").fill("Unsubmitted local draft")
    nav.get_by_role("button", name="Evidence", exact=True).click()
    expect(picker).to_have_value("evidence")
    page.go_back()
    expect(picker).to_have_value("holdings")
    expect(root.get_by_test_id("portfolio-field-ticker")).to_have_value("FICT")
    expect(root.get_by_test_id("portfolio-field-notes")).to_have_value("Unsubmitted local draft")
    page.go_forward()
    expect(picker).to_have_value("evidence")
    assert "Unsubmitted local draft" not in page.url
    assert writes == []


@pytest.mark.parametrize("width", [360, 768, 1440])
def test_portfolio_navigation_control_is_responsive_and_restores_overview(page, width):
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 950})
    page.goto("/portfolio")
    nav = page.get_by_test_id("portfolio-navigation")
    picker = nav.get_by_role("combobox", name="Portfolio section")
    expect(picker).to_have_value("overview")
    picker.select_option("research")
    expect(page.get_by_test_id("company-research-workspace")).to_be_visible()
    page.go_back()
    expect(picker).to_have_value("overview")
    expect(page.get_by_test_id("portfolio-command-center")).to_be_visible()
    assert nav.evaluate("(element) => element.scrollWidth <= element.clientWidth")



def test_holding_detail_is_modal_and_back_forward_preserves_identity(page):
    import json
    mock_local_apis(page)
    rows = [{"id": "fictional-nvda", "symbol": "NVDA", "quantity": 2, "averageCost": 100, "purchaseDate": "2026-01-02"},
            {"id": "fictional-amd", "symbol": "AMD", "quantity": 1, "averageCost": 80, "purchaseDate": "2026-01-05"}]
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"holdings": rows})))
    page.goto("/portfolio?portfolio_tab=holdings")
    trigger = page.get_by_role("button", name="Open NVDA holding details from table")
    expect(trigger).to_be_visible()
    trigger.click()
    dialog = page.get_by_role("dialog", name="NVDA holding details")
    expect(dialog).to_be_visible()
    assert dialog.evaluate('(node)=>node.matches(":modal")')
    assert "portfolio_detail=NVDA" in page.url
    page.go_back()
    expect(dialog).to_have_count(0)
    page.go_forward()
    expect(dialog).to_be_visible()
    dialog.get_by_role("button", name="Back to holdings").click()
    expect(dialog).to_have_count(0)
    expect(trigger).to_be_focused()
    assert "portfolio_detail=" not in page.url


@pytest.mark.parametrize("width", [360, 768, 1440])
def test_holding_detail_mobile_keyboard_and_no_passive_writes(page, width):
    import json
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 900})
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"holdings": [{"id": "fictional-nvda", "symbol": "NVDA", "quantity": 2, "averageCost": 100}]})))
    writes = []
    page.on("request", lambda req: writes.append(req.url) if req.method not in ("GET", "HEAD") and ("/api/portfolio" in req.url or "/api/signal-scorecard" in req.url) else None)
    page.goto("/portfolio?portfolio_tab=holdings")
    page.get_by_role("button", name="Open NVDA holding details from table").click()
    dialog = page.get_by_role("dialog", name="NVDA holding details")
    expect(dialog.get_by_role("button", name="Back to holdings")).to_be_focused()
    for _ in range(10):
        page.keyboard.press("Tab")
        assert dialog.evaluate("(node)=>node.contains(document.activeElement)")
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert dialog.evaluate("(node)=>node.scrollWidth <= node.clientWidth")
    page.keyboard.press("Escape")
    expect(dialog).to_have_count(0)
    assert writes == []


def test_missing_direct_holding_never_substitutes_another_position(page):
    import json
    mock_local_apis(page)
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"holdings": [{"id": "fictional-nvda", "symbol": "NVDA", "quantity": 1, "averageCost": 100}]})))
    page.goto("/portfolio?portfolio_tab=holdings&portfolio_detail=ZZZZ")
    dialog = page.get_by_role("dialog", name="ZZZZ holding details")
    expect(dialog.get_by_role("alert")).to_contain_text("No substitute position is shown")
    assert dialog.get_by_role("button", name="Open Evidence workspace").count() == 0
    dialog.press("Escape")
    expect(dialog).to_have_count(0)



def test_holdings_list_defers_history_analyst_and_currency_reads_until_explicit_detail(page):
    """A default portfolio review or holdings list must not trigger optional detail reads."""
    import json
    mock_local_apis(page)
    rows = [{"id": "fictional-nvda", "symbol": "NVDA", "quantity": 1, "averageCost": 100, "purchaseDate": "2026-01-02"}]
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"holdings": rows})))
    calls = []
    writes = []
    page.on("request", lambda req: calls.append(req.url) if "action=history" in req.url or "action=analyst" in req.url or "symbol=INR" in req.url else None)
    page.on("request", lambda req: writes.append((req.method, req.url)) if req.method not in ("GET", "HEAD") and ("/api/portfolio" in req.url or "/api/signal-scorecard" in req.url) else None)
    page.goto("/portfolio")
    expect(page.get_by_test_id("portfolio-command-center")).to_be_visible()
    page.get_by_role("combobox", name="Portfolio section").select_option("holdings")
    trigger = page.get_by_role("button", name="Open NVDA holding details from table")
    expect(trigger).to_be_visible()
    page.wait_for_load_state("networkidle")
    assert not calls, "The initial list issued advanced history, analyst or currency requests: " + repr(calls)
    trigger.click()
    dialog = page.get_by_role("dialog", name="NVDA holding details")
    expect(dialog).to_be_visible()
    page.wait_for_load_state("networkidle")
    assert any("action=history" in url for url in calls), "Explicit detail must load the selected chart"
    assert any("action=analyst" in url for url in calls), "Explicit detail must load analyst context"
    assert writes == []


def test_unknown_holding_deeplink_never_fetches_another_symbol_history_or_analyst(page):
    import json
    mock_local_apis(page)
    rows = [{"id": "fictional-nvda", "symbol": "NVDA", "quantity": 1, "averageCost": 100}]
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"holdings": rows})))
    calls = []
    page.on("request", lambda req: calls.append(req.url) if "action=history" in req.url or "action=analyst" in req.url else None)
    page.goto("/portfolio?portfolio_tab=holdings&portfolio_detail=ZZZZ")
    dialog = page.get_by_role("dialog", name="ZZZZ holding details")
    expect(dialog.get_by_role("alert")).to_contain_text("No substitute position is shown")
    page.wait_for_load_state("networkidle")
    assert calls == []



@pytest.mark.parametrize("width", [360, 768, 1440])
def test_detail_evidence_back_and_close_restore_holding_focus_and_scroll(page, width):
    """The same selected holding survives a workspace round trip without a background save."""
    import json
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 950})
    rows = [{"id": "fictional-nvda", "symbol": "NVDA", "quantity": 1, "averageCost": 100, "purchaseDate": "2026-01-02"}]
    page.route("**/api/portfolio?includeLots=true", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"holdings": rows})))
    writes = []
    page.on("request", lambda req: writes.append((req.method, req.url)) if req.method not in ("GET", "HEAD") and ("/api/portfolio" in req.url or "/api/signal-scorecard" in req.url) else None)
    page.goto("/portfolio?portfolio_tab=holdings")
    trigger = page.get_by_role("button", name="Open NVDA holding details from table")
    expect(trigger).to_be_visible()
    trigger.scroll_into_view_if_needed()
    trigger.click()
    dialog = page.get_by_role("dialog", name="NVDA holding details")
    expect(dialog).to_be_visible()
    # The browser may move the trigger while dispatching the click. The list
    # restoration contract is the actual event-time view, not an earlier
    # scrollIntoView position before click's own focus/visibility adjustments.
    opening_scroll = page.evaluate("scrollY")
    dialog.get_by_role("button", name="Open Evidence workspace").click()
    expect(dialog).to_have_count(0)
    expect(page.get_by_test_id("portfolio-section-heading")).to_have_text("Evidence")
    page.go_back()
    expect(dialog).to_be_visible()
    assert "portfolio_detail=NVDA" in page.url
    dialog.press("Escape")
    expect(dialog).to_have_count(0)
    expect(trigger).to_be_focused()
    assert abs(page.evaluate("scrollY") - opening_scroll) < 3
    assert writes == []
