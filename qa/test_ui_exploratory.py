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
    page.get_by_test_id("nav-outlook").click()
    _assert_sort_control(_table_with_header(page, "Ticker"), "Ticker")


def test_exploratory_sorting_portfolio_scenarios(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    _assert_sort_control(_table_with_header(page, "Reference"), "Reference")


def test_exploratory_sorting_macro_politics(page):
    mock_local_apis(page)
    goto_app(page)
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
        page.get_by_test_id("nav-" + nav_id).click()
        table = _table_with_header(page, label)
        assert table.locator("thead").count() == 1
        assert table.locator("tbody").count() == 1
