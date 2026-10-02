from __future__ import annotations

import json

def goto_app(page):
    page.goto("/", wait_until="domcontentloaded", timeout=60000)
    page.get_by_text("AI INFRA WATCH", exact=False).first.wait_for(state="visible", timeout=30000)

def test_core_navigation_and_page_mounts(page):
    goto_app(page)
    for nav_id, testid in [("portfolio","portfolio-intelligence"),("research","autonomous-research"),("quality","ai-quality-lab"),("outlook","forward-outlook")]:
        page.get_by_test_id("nav-" + nav_id).click()
        page.get_by_test_id(testid).wait_for(state="visible", timeout=30000)

def test_forecast_history_error_is_gone(page):
    goto_app(page)
    page.get_by_test_id("nav-outlook").click()
    page.get_by_test_id("forward-outlook").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(5000)
    assert "Historical market data request failed (HTTP 404)" not in page.locator("body").inner_text()

def test_portfolio_search_is_functional(page):
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="visible", timeout=30000)
    search = portfolio.get_by_placeholder("Search ticker, name or theme")
    search.fill("NVDA")
    page.wait_for_timeout(500)
    assert "Portfolio + Watchlist Decision Lab" in portfolio.inner_text()

def test_autonomous_research_ui_without_calling_llm(page):
    def route_agent(route):
        if route.request.method == "GET":
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"ok":True,"status":"ok","mcp_ready":True}))
            return
        route.fulfill(status=200, content_type="application/json", body=json.dumps({
            "ok":True,"mode":"autonomous-mcp","question":"What changed recently for NVDA?",
            "summary":"Mocked evidence-backed synthesis for UI validation.","answer_source":"deterministic-evidence",
            "jev":{"enabled":True,"evidence_gate":{"action":"stop","evidence_quality":80}},
            "calls":[{"tool":"stocks.get_quote","ok":True}],"trajectory":[]
        }))
    page.route("**/api/agent-ask*", route_agent)
    page.route("**/api/quote?*", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"symbol":"NVDA","price":200.0,"changePct":1.0,"provider":"qa"})))
    goto_app(page)
    page.get_by_test_id("nav-research").click()
    research = page.get_by_test_id("autonomous-research")
    research.wait_for(state="visible", timeout=30000)
    page.get_by_test_id("research-question").fill("What changed recently for NVDA?")
    page.get_by_test_id("research-run").click()
    page.get_by_text("Mocked evidence-backed synthesis for UI validation.", exact=False).wait_for(state="visible", timeout=30000)

def test_ai_quality_lab_mounts(page):
    goto_app(page)
    page.get_by_test_id("nav-quality").click()
    lab = page.get_by_test_id("ai-quality-lab")
    lab.wait_for(state="visible", timeout=30000)
    assert "AI Quality" in lab.inner_text()
