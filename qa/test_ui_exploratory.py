from __future__ import annotations

from test_ui import goto_app, mock_local_apis


def _table_with_header(page, label: str):
    table = page.locator("table").filter(has=page.locator("th", has_text=label)).first
    table.wait_for(state="visible", timeout=30000)
    return table


def _assert_sort_control(table, label: str):
    header = table.locator("th").filter(has_text=label).first
    assert header.count() == 1, f"Missing table header: {label}"
    has_button = header.locator("button").count() > 0
    role = header.get_attribute("role")
    assert has_button or role == "button", (
        f"Table header '{label}' is not interactive/sortable; "
        "expected a button or role=button."
    )
    if has_button:
        button = header.locator("button").first
        before = button.get_attribute("aria-sort")
        assert before in ("none", "ascending", "descending")
        assert header.get_attribute("aria-sort") == before
        button.click()
        after = button.get_attribute("aria-sort")
        expected = "ascending" if before in ("none", "descending") else "descending"
        assert after == expected
        assert header.get_attribute("aria-sort") == after
        button.click()
        assert button.get_attribute("aria-sort") == before


def test_exploratory_sorting_congress(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-congress").click()
    _assert_sort_control(_table_with_header(page, "Trade Date"), "Trade Date")


def test_exploratory_sorting_quality_lab(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-quality").click()
    _assert_sort_control(_table_with_header(page, "Time"), "Time")


def test_exploratory_sorting_forward_outlook(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/outlook", wait_until="domcontentloaded")
    page.get_by_test_id("forward-outlook").wait_for(state="visible", timeout=30000)
    _assert_sort_control(_table_with_header(page, "Ticker"), "Ticker")


def test_exploratory_sorting_portfolio_scenarios(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/portfolio", wait_until="domcontentloaded")
    page.get_by_test_id("portfolio-intelligence").wait_for(state="visible", timeout=30000)
    _assert_sort_control(_table_with_header(page, "Reference"), "Reference")


def test_exploratory_sorting_macro_politics(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/macro", wait_until="domcontentloaded")
    _assert_sort_control(_table_with_header(page, "Holding"), "Holding")


def test_tracker_customize_remove_persists_without_deleting_support(page):
    mock_local_apis(page)
    page.add_init_script(
        """localStorage.setItem(
            'aiw-progress-tracker-symbols-v1',
            JSON.stringify(['NVDA', 'NBIS'])
        )"""
    )
    goto_app(page)
    page.get_by_test_id("nav-tracker").click()
    page.get_by_role("button", name="Customize").click()

    page.get_by_role(
        "button", name="Remove NVDA from saved tracker tickers"
    ).click()

    assert page.get_by_role("button", name="NVDA", exact=True).count() == 0
    assert page.get_by_role("button", name="NBIS", exact=True).count() == 1

    stored = page.evaluate(
        """() => JSON.parse(localStorage.getItem('aiw-progress-tracker-symbols-v1') || '[]')"""
    )
    assert stored == ["NBIS"]

    # Removed shortcut must not remove ticker support.
    search = page.get_by_placeholder("e.g. AAPL, CRM, Salesforce, ONDAS")
    search.fill("NVDA")
    page.wait_for_timeout(200)
    track_button = page.locator("button").filter(has_text="Track").first
    assert track_button.is_visible()


def test_exploratory_global_table_accessibility(page):
    mock_local_apis(page)
    goto_app(page)
    for nav_id, label in [
        ("congress", "Trade Date"),
        ("quality", "Time"),
        ("outlook", "Ticker"),
        ("portfolio", "Reference"),
        ("macro", "Holding"),
    ]:
        page.goto({
            "congress": "/congress",
            "quality": "/quality",
            "outlook": "/outlook",
            "portfolio": "/portfolio",
            "macro": "/macro",
        }[nav_id], wait_until="domcontentloaded")
        table = _table_with_header(page, label)
        assert table.locator("thead").count() == 1
        assert table.locator("tbody").count() == 1


def test_exploratory_data_health_summary_and_refresh(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/health", wait_until="domcontentloaded")
    page.get_by_text("Evidence Availability").wait_for(state="visible", timeout=30000)
    assert page.get_by_label("Data health summary").is_visible()
    assert page.get_by_label("Evidence channel health").is_visible()
    refresh = page.get_by_role("button", name="Refresh evidence data")
    assert refresh.is_visible()


def test_exploratory_congress_filters(page):
    mock_local_apis(page)
    import json as _json

    def congress_route(route):
        if '/api/congress-trades' not in route.request.url:
            return route.continue_()
        route.fulfill(
            status=200,
            content_type='application/json',
            body=_json.dumps({
                'source': 'qa',
                'sourceLabel': 'QA mocked Congress source',
                'trades': [
                    {'id':'qa-house-buy','politician':'House Member','chamber':'HOUSE','stockSymbol':'NVDA','transactionType':'buy','amountRange':'$1,001 - $15,000','transactionDate':'2026-09-20','filingDate':'2026-09-22','date':'2026-09-20'},
                    {'id':'qa-senate-sell','politician':'Senate Member','chamber':'SENATE','stockSymbol':'NVDA','transactionType':'sell','amountRange':'$15,001 - $50,000','transactionDate':'2026-09-10','filingDate':'2026-09-12','date':'2026-09-10'},
                    {'id':'qa-house-sell','politician':'House Seller','chamber':'HOUSE','stockSymbol':'NVDA','transactionType':'sell','amountRange':'$1,001 - $15,000','transactionDate':'2026-08-20','filingDate':'2026-08-22','date':'2026-08-20'},
                ],
            }),
        )

    page.route('**/api/congress-trades*', congress_route)
    goto_app(page)
    page.get_by_test_id('nav-congress').click()
    page.get_by_text('3 matching disclosures', exact=True).wait_for(state='visible', timeout=30000)

    page.get_by_role('button', name='House', exact=True).click()
    page.get_by_text('2 matching disclosures', exact=True).wait_for(state='visible', timeout=30000)

    page.get_by_label('Filter Congress trades by transaction type').select_option('buy')
    page.get_by_text('1 matching disclosure', exact=True).wait_for(state='visible', timeout=30000)

    page.get_by_role('button', name='Clear table filters', exact=True).click()
    page.get_by_text('3 matching disclosures', exact=True).wait_for(state='visible', timeout=30000)

def test_exploratory_portfolio_scenario_semantics(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/portfolio", wait_until="domcontentloaded")
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="visible", timeout=30000)

    table = _table_with_header(page, "Reference")
    historical = table.locator("tr").filter(has_text="Historical high (available)").first
    assert historical.is_visible()
    assert "$150.00" in historical.inner_text()
    assert "2024-01-02" in historical.inner_text()

    positive = table.locator("tr").filter(has_text="+10% from current").first
    assert positive.locator(".text-emerald-300").count() >= 2

    breakeven = table.locator("tr").filter(has_text="Break-even (average cost)").first
    assert breakeven.locator(".text-rose-300").count() == 0
