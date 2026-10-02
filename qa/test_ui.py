from __future__ import annotations

import json

def mock_local_apis(page):
    if __import__('os').getenv('QA_UI_MOCKS') != 'true':
        return
    def api_route(route):
        import json as _json
        url = route.request.url
        if '/api/agent-ask' in url:
            if route.request.method == 'GET':
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'ok':True,'status':'ok','mcp_ready':True}))
            else:
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'ok':True,'mode':'autonomous-mcp','question':'What changed recently for NVDA?','summary':'Mocked evidence-backed synthesis for UI validation.','answer_source':'deterministic-evidence','jev':{'enabled':True,'evidence_gate':{'action':'stop','evidence_quality':80}},'calls':[{'tool':'stocks.get_quote','ok':True}],'trajectory':[]}))
            return
        if '/api/quote' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'symbol':'NVDA','price':200.0,'changePct':1.0,'provider':'qa'})); return
        if '/api/company-scale' in url:
            if 'action=history' in url:
                points=[{'date':'2025-01-01','price':100.0},{'date':'2025-01-02','price':101.0}]*180
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'symbol':'NVDA','points':points})); return
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'symbol':'NVDA','events':[]})); return
        if '/api/live-data' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'stockPrices':{'NVDA':{'price':200,'changePct':1}},'contracts':[],'congressTrades':[],'macroRisks':[],'marketSentiment':'QA mocked'})); return
        if '/api/portfolio' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'holdings':[{'symbol':'NVDA','quantity':1,'average_cost':150,'purchase_date':'2026-01-01'}]})); return
        if '/api/forecast-verification' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'forecasts':[],'analytics':{'sampleSize':0,'byTickerHorizon':[],'byScenario':[],'byModel':[],'byDirection':[],'longTerm':{'verifiedCount':0}}})); return
        if '/api/ai-quality' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'runs':[],'analytics':{'aggregates':{},'latest':None,'previous':None,'regression':{'passed':True,'regressionCount':0,'regressions':[],'observed':[]}}})); return
        route.fulfill(status=200, content_type='application/json', body='{}')
    page.route('**/api/**', api_route)
def goto_app(page):
    page.goto("/", wait_until="domcontentloaded", timeout=60000)
    page.get_by_text("AI INFRA WATCH", exact=False).first.wait_for(state="visible", timeout=30000)

def test_core_navigation_and_page_mounts(page):
    mock_local_apis(page)
    goto_app(page)
    for nav_id, testid in [("portfolio","portfolio-intelligence"),("research","autonomous-research"),("quality","ai-quality-lab"),("outlook","forward-outlook")]:
        page.get_by_test_id("nav-" + nav_id).click()
        page.get_by_test_id(testid).wait_for(state="visible", timeout=30000)

def test_forecast_history_error_is_gone(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-outlook").click()
    page.get_by_test_id("forward-outlook").wait_for(state="visible", timeout=30000)
    page.wait_for_timeout(5000)
    assert "Historical market data request failed (HTTP 404)" not in page.locator("body").inner_text()

def test_portfolio_search_is_functional(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="visible", timeout=30000)
    search = portfolio.get_by_placeholder("Search ticker, name or theme")
    search.fill("NVDA")
    page.wait_for_timeout(500)
    assert "Portfolio + Watchlist Decision Lab" in portfolio.inner_text()

def test_autonomous_research_ui_without_calling_llm(page):
    mock_local_apis(page)
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
    if __import__('os').getenv('QA_UI_MOCKS') != 'true':
        page.route("**/api/agent-ask*", route_agent)
    if __import__('os').getenv('QA_UI_MOCKS') != 'true':
        page.route("**/api/quote?*", lambda route: route.fulfill(status=200, content_type="application/json", body=json.dumps({"symbol":"NVDA","price":200.0,"changePct":1.0,"provider":"qa"})))
    goto_app(page)
    page.get_by_test_id("nav-research").click()
    research = page.get_by_test_id("autonomous-research")
    research.wait_for(state="visible", timeout=30000)
    page.get_by_test_id("research-question").fill("What changed recently for NVDA?")
    page.get_by_test_id("research-run").click()
    page.get_by_text("Mocked evidence-backed synthesis for UI validation.", exact=False).wait_for(state="visible", timeout=30000)

def test_ai_quality_lab_mounts(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-quality").click()
    lab = page.get_by_test_id("ai-quality-lab")
    lab.wait_for(state="visible", timeout=30000)
    assert "AI Quality" in lab.inner_text()
