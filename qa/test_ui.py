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
            if 'action=analyst' in url:
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'symbol':'NVDA','source':'Finnhub analyst','retrievedAt':'2026-10-02T07:00:00Z','recommendation':{'period':'2026-09-30','strongBuy':5,'buy':20,'hold':8,'sell':2,'strongSell':1},'priceTarget':{'median':250,'mean':245,'low':180,'high':300},'epsEstimates':[{'period':'2026','average':2.5,'analysts':20}], 'revenueEstimates':[{'period':'2026','average':200000000000,'analysts':18}], 'available':['recommendation','priceTarget','epsEstimates','revenueEstimates'],'errors':[]})); return
            if 'action=history' in url:
                points=[{'date':'2025-01-01','price':100.0},{'date':'2025-01-02','price':101.0}]*180
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'symbol':'NVDA','points':points})); return
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'symbol':'NVDA','events':[]})); return
        if '/api/live-data' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'stockPrices':{'NVDA':{'price':200,'changePct':1}},'contracts':[],'congressTrades':[],'macroRisks':[],'marketSentiment':'QA mocked'})); return
        if '/api/portfolio' in url:
            if route.request.method == 'POST':
                route.fulfill(status=201, content_type='application/json', body=_json.dumps({'holding':{'id':'qa-new','symbol':'AMD','quantity':2,'averageCost':100,'purchaseDate':'2026-01-02','notes':'QA holding'}}))
            elif route.request.method == 'PUT':
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'holding':{'id':'qa-nvda','symbol':'NVDA','quantity':1,'averageCost':150,'purchaseDate':'2026-01-01','notes':'updated'}}))
            elif route.request.method == 'DELETE':
                route.fulfill(status=204, body='')
            else:
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'holdings':[{'id':'qa-nvda','symbol':'NVDA','quantity':1,'averageCost':150,'purchaseDate':'2026-01-01','notes':''}]}))
            return
        if '/api/forecast-verification' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({
                'model':'analogue-v1',
                'config':{'horizon':20},
                'forecasts':[],
                'analytics':{
                    'sampleSize':24,
                    'sampleStatus':'descriptive',
                    'directionalAccuracyPct':62.5,
                    'medianAbsoluteError':4.2,
                    'meanSignedErrorPct':0.8,
                    'p25p75CoveragePct':68.0,
                    'p10p90CoveragePct':91.0,
                    'byTickerHorizon':[{'ticker':'NVDA','horizon':20,'count':24,'directionalAccuracyPct':62.5,'medianAbsoluteError':4.2,'p25p75CoveragePct':68.0}],
                    'byScenario':[],
                    'byModel':[],
                    'byDirection':[],
                    'validationGate':{'minimumRequired':50,'verifiedCount':24,'ready':False,'status':'limited'},
                    'evidenceCoverage':{'forecastsWithSnapshot':24,'analystAvailable':20,'analystMissingOrFailed':4,'withNews':20,'withContracts':18,'withPolitical':12,'withMacro':16,'multiChannel':18},
                    'longTerm':{'verifiedCount':24,'oldestVerifiedAt':'2026-01-01T00:00:00Z','newestVerifiedAt':'2026-10-01T00:00:00Z'}
                }
            })); return
        if '/api/ai-quality' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'runs':[],'analytics':{'aggregates':{},'latest':None,'previous':None,'regression':{'passed':True,'regressionCount':0,'regressions':[],'observed':[]}}})); return
        route.fulfill(status=200, content_type='application/json', body='{}')
    page.route('**/api/**', api_route)
def goto_app(page):
    page.on("pageerror", lambda error: print("PAGEERROR:", error, getattr(error, "stack", "")))
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
    page.get_by_test_id("forward-outlook").wait_for(state="attached", timeout=30000)
    page.wait_for_timeout(5000)
    assert "Historical market data request failed (HTTP 404)" not in page.locator("body").inner_text()

def test_portfolio_search_is_functional(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="attached", timeout=30000)
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
    lab.wait_for(state="attached", timeout=30000)
    assert "AI QUALITY LAB" in lab.inner_text()

def test_portfolio_manager_create_flow(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="attached", timeout=30000)
    page.get_by_test_id("portfolio-add-holding").click()
    page.get_by_test_id("portfolio-field-ticker").fill("AMD")
    page.get_by_test_id("portfolio-field-quantity").fill("2")
    page.get_by_test_id("portfolio-field-average-cost").fill("100")
    page.get_by_test_id("portfolio-field-purchase-date").fill("2026-01-02")
    page.get_by_test_id("portfolio-field-notes").fill("QA holding")
    with page.expect_request(lambda request: "/api/portfolio" in request.url and request.method == "POST", timeout=30000) as request_info:
        page.get_by_test_id("portfolio-save-holding").click()
    request = request_info.value
    payload = request.post_data_json
    assert payload["symbol"] == "AMD"
    assert float(payload["quantity"]) == 2
    assert float(payload["averageCost"]) == 100
    page.get_by_test_id("portfolio-save-holding").wait_for(state="detached", timeout=30000)


def test_analyst_expectations_panel(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.get_by_test_id("portfolio-intelligence").wait_for(state="attached", timeout=30000)
    page.get_by_test_id("analyst-expectations").wait_for(state="visible", timeout=30000)
    assert "EXTERNAL ANALYST EXPECTATIONS" in page.get_by_test_id("analyst-expectations").inner_text().upper()


def test_event_study_uses_consolidated_api(page):
    requests = []
    mock_local_apis(page)
    page.on("request", lambda request: requests.append(request.url))
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.get_by_text("Event Study", exact=True).click()
    page.wait_for_timeout(1500)
    assert any("/api/company-scale?action=milestones" in url for url in requests)
    assert any("/api/company-scale?action=history" in url for url in requests)
    assert not any("/api/stock-milestones" in url for url in requests)
    assert not any("/api/stock-history" in url for url in requests)


def test_unified_event_timeline_uses_consolidated_api(page):
    requests = []
    mock_local_apis(page)
    page.on("request", lambda request: requests.append(request.url))
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.wait_for_timeout(1500)
    assert not any("/api/stock-milestones" in url for url in requests)
    assert not any("/api/stock-history" in url for url in requests)

def test_event_study_identifies_selected_ticker(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.get_by_text("Event Study", exact=True).click()
    page.get_by_text("SELECTED TICKER", exact=True).wait_for(state="visible", timeout=30000)
    assert page.get_by_text("NVDA", exact=True).count() >= 1
    assert page.get_by_text(
        "Every metric and event below is calculated for this ticker only. SPY is the comparison market."
    ).count() == 1


def test_money_rotation_semantic_colors_mount(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.get_by_text("Money Rotation", exact=True).click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="attached", timeout=30000)
    for label in ("Strengthening", "Weakening", "Mixed", "Insufficient"):
        portfolio.get_by_text(label, exact=True).wait_for(state="visible", timeout=30000)


def test_exit_profit_scenarios_identify_selected_ticker(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="attached", timeout=30000)
    page.get_by_text("Exit / Profit Scenarios", exact=True).wait_for(state="visible", timeout=30000)
    section = page.get_by_text("Exit / Profit Scenarios", exact=True).locator("..")
    assert "NVDA" in section.inner_text()
    portfolio.get_by_text("Stock symbol", exact=True).wait_for(state="visible", timeout=30000)
    assert "NVDA" in portfolio.get_by_text("Stock symbol", exact=True).locator("..").inner_text()


def test_held_portfolio_filters_and_sort_mount(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="attached", timeout=30000)
    portfolio.get_by_label("Filter held portfolio universe by state").wait_for(state="visible", timeout=30000)
    portfolio.get_by_label("Sort held portfolio universe").wait_for(state="visible", timeout=30000)
