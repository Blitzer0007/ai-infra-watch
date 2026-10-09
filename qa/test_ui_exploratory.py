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



def test_contracts_page_surfaces_multi_source_discovery_leads(page):
    import json as _json

    mock_local_apis(page)

    payload = {
        "leads": [{
            "id": "qa-contract-lead-dgxx",
            "title": "Digi Power X provides a construction update for Phase 1",
            "summary": "Company and news discovery lead. Review the source to confirm the reported project status.",
            "url": "https://www.digipowerx.com/press-releases",
            "source": "digipowerx.com",
            "sourceType": "official-company",
            "verificationStatus": "Official company update",
            "date": "2026-10-06",
            "publishedAt": "2026-10-06T12:00:00Z",
            "category": "Construction / build-out",
            "ticker": "DGXX",
            "isConfirmedContract": False,
        }],
        "sourceStatus": {
            "status": "available",
            "providers": ["google-news-rss"],
            "queriesRun": 4,
            "failedQueries": 0,
            "errors": [],
            "note": "Discovery leads require source verification.",
        },
        "retrievedAt": "2026-10-09T12:00:00Z",
        "cached": False,
    }

    def route_discovery(route):
        if "action=contract-discovery" in route.request.url:
            route.fulfill(status=200, content_type="application/json", body=_json.dumps(payload))
        else:
            route.fallback()

    page.route("**/api/company-scale*", route_discovery)
    goto_app(page)
    page.get_by_test_id("nav-contracts").click()

    panel = page.get_by_test_id("contract-announcement-discovery")
    panel.wait_for(state="visible", timeout=30000)
    assert "Latest contract and infrastructure announcements" in panel.inner_text()
    assert "Digi Power X provides a construction update for Phase 1" in panel.inner_text()
    assert "Primary source" in panel.inner_text()
    assert "not proof of a signed agreement" in panel.inner_text()
    panel.get_by_role("link", name="Open source").wait_for(state="visible", timeout=30000)


def test_progress_tracker_displays_official_x_project_update(page):
    import json as _json

    mock_local_apis(page)

    payload = {
        "symbol": "DGXX",
        "issuer": "Digi Power X",
        "source": "multi-source-project-updates",
        "events": [
            {
                "id": "sec-milestone-qa",
                "stockSymbol": "DGXX",
                "date": "2026-10-01",
                "publishedAt": "2026-10-01T12:00:00Z",
                "title": "Material definitive agreement",
                "category": "Contract / commercial",
                "description": "SEC 8-K filing",
                "status": "done",
                "url": "https://www.sec.gov/Archives/edgar/data/example",
                "sourceUrl": "https://www.sec.gov/Archives/edgar/data/example",
                "source": "SEC EDGAR",
                "sourceType": "sec-primary",
                "verificationStatus": "SEC filing",
                "evidenceClass": "primary-source",
                "relatedSources": [],
            },
            {
                "id": "x-post-qa-dgxx",
                "stockSymbol": "DGXX",
                "date": "2026-10-06",
                "publishedAt": "2026-10-06T13:30:00Z",
                "title": "Phase 1 construction update at the Columbiana campus",
                "category": "Construction / build-out",
                "description": "Digi Power X reports that the first-phase building shell work is progressing.",
                "status": "active",
                "url": "https://x.com/DigipowerX/status/123456789",
                "sourceUrl": "https://x.com/DigipowerX/status/123456789",
                "source": "X @DigipowerX",
                "sourceType": "official-social",
                "verificationStatus": "Official company social post",
                "evidenceClass": "primary-source",
                "relatedSources": [],
            },
        ],
        "sourceStatus": {
            "sec": {"status": "available", "count": 1, "error": None},
            "web": {"status": "available", "count": 0, "providers": ["google-news-rss"], "errors": []},
            "x": {"status": "available", "count": 1, "configured": True, "error": None},
        },
        "retrievedAt": "2026-10-09T12:00:00Z",
    }

    def route_milestones(route):
        if "action=milestones" in route.request.url:
            route.fulfill(status=200, content_type="application/json", body=_json.dumps(payload))
        else:
            route.fallback()

    page.route("**/api/company-scale*", route_milestones)
    goto_app(page)
    page.get_by_test_id("nav-tracker").click()
    page.get_by_role("button", name="DGXX", exact=True).click()

    panel = page.get_by_test_id("tracker-company-updates")
    panel.wait_for(state="visible", timeout=30000)
    assert "Latest company and X project updates" in panel.inner_text()
    assert "Official company X post" in panel.inner_text()
    assert "Phase 1 construction update at the Columbiana campus" in panel.inner_text()
    assert "X @DigipowerX" in panel.inner_text()
    panel.get_by_role("link", name="Open source").wait_for(state="visible", timeout=30000)

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


def test_forward_outlook_plain_language_summary(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/outlook", wait_until="domcontentloaded")
    summary = page.get_by_test_id("forecast-summary")
    summary.wait_for(state="visible", timeout=30000)

    text = summary.inner_text()
    assert "What past market periods suggest" in text
    assert "Past periods with gains" in text
    assert "not a calibrated probability" in text
    assert "Weekdays only; exchange holidays not included" in text
    assert "24 of 50 verified forecasts" in text
    assert "Still building" in text

    range_chart = summary.locator('[role="img"]')
    assert range_chart.is_visible()
    assert "10th" in (range_chart.get_attribute("aria-label") or "")
    assert "90th" in (range_chart.get_attribute("aria-label") or "")


def test_forward_outlook_verified_forecast_results_match_telegram(page):
    import json as _json

    mock_local_apis(page)

    verified_forecast = {
        "id": "qa-rklb-verified-forecast",
        "ticker": "RKLB",
        "createdAt": "2026-10-03T09:00:00Z",
        "targetDate": "2026-10-08",
        "actualDate": "2026-10-08",
        "verifiedAt": "2026-10-08T22:18:00Z",
        "horizon": 5,
        "scenarioId": "base",
        "entryPrice": 50.0,
        "median": 1.13,
        "p25": -2.0,
        "p75": 3.0,
        "p10": -5.0,
        "p90": 6.0,
        "status": "verified",
        "actualReturn": -1.84,
        "medianError": -2.97,
        "modelVersion": "analogue-v1",
    }

    def forecast_verification_route(route):
        if "/api/forecast-verification" not in route.request.url:
            return route.continue_()
        route.fulfill(
            status=200,
            content_type="application/json",
            body=_json.dumps({
                "model": "analogue-v1",
                "config": {"horizon": 20},
                "forecasts": [verified_forecast],
                "analytics": {
                    "sampleSize": 1,
                    "sampleStatus": "insufficient",
                    "directionalAccuracyPct": 0,
                    "medianAbsoluteError": 2.97,
                    "meanSignedErrorPct": -2.97,
                    "p25p75CoveragePct": 0,
                    "p10p90CoveragePct": 0,
                    "byTickerHorizon": [],
                    "byScenario": [],
                    "byModel": [],
                    "byDirection": [],
                    "validationGate": {
                        "minimumRequired": 50,
                        "verifiedCount": 1,
                        "ready": False,
                        "status": "building validation sample",
                    },
                    "longTerm": {
                        "verifiedCount": 1,
                        "oldestVerifiedAt": "2026-10-08T22:18:00Z",
                        "newestVerifiedAt": "2026-10-08T22:18:00Z",
                    },
                },
            }),
        )

    page.route("**/api/forecast-verification*", forecast_verification_route)
    goto_app(page)
    page.goto("/outlook", wait_until="domcontentloaded")

    results = page.get_by_test_id("verified-forecast-results")
    results.wait_for(state="visible", timeout=30000)
    card = results.get_by_test_id("verified-forecast-result").first
    card.wait_for(state="visible", timeout=30000)

    row_text = card.inner_text()
    assert "RKLB" in row_text and "5 trading days" in row_text
    assert "Direction incorrect" in row_text
    assert "Forecast median" in row_text and "1.13%" in row_text
    assert "Verified market return" in row_text and "-1.84%" in row_text
    assert "0.0%" in row_text
    assert "Typical miss: -2.97 pp" in row_text
    assert "Target 2026-10-08" in row_text
    assert "Verified 2026-10-08" in row_text


def test_exploratory_sorting_portfolio_scenarios(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/portfolio", wait_until="domcontentloaded")
    page.get_by_test_id("portfolio-intelligence").wait_for(state="visible", timeout=30000)
    page.get_by_text("My Holdings", exact=True).click()
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
        if nav_id == "portfolio":
            page.get_by_test_id("portfolio-intelligence").wait_for(state="visible", timeout=30000)
            page.get_by_text("My Holdings", exact=True).click()
        table = _table_with_header(page, label)
        assert table.locator("thead").count() == 1
        assert table.locator("tbody").count() == 1


def test_exploratory_data_health_summary_and_refresh(page):
    mock_local_apis(page)
    goto_app(page)
    page.goto("/health", wait_until="domcontentloaded")
    page.get_by_text("Evidence Availability", exact=True).first.wait_for(state="visible", timeout=30000)
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
    page.locator('span', has_text='3 matching disclosures').wait_for(state='visible', timeout=30000)

    page.get_by_label('Filter Congress trades by chamber').select_option('House')
    page.get_by_text('House Member', exact=True).wait_for(state='visible', timeout=30000)
    page.get_by_text('House Seller', exact=True).wait_for(state='visible', timeout=30000)
    page.get_by_text('Senate Member', exact=True).wait_for(state='detached', timeout=30000)

    page.get_by_label('Filter Congress trades by transaction type').select_option('buy')
    page.get_by_text('House Member', exact=True).wait_for(state='visible', timeout=30000)
    page.get_by_text('House Seller', exact=True).wait_for(state='detached', timeout=30000)

    page.get_by_role('button', name='Reset filters', exact=True).click()
    page.locator('span', has_text='3 matching disclosures').wait_for(state='visible', timeout=30000)
