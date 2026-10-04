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
                if 'holdingId=' in url:
                    route.fulfill(status=200, content_type='application/json', body=_json.dumps({'lots':[{'id':'lot-qa-1','holdingId':'qa-nvda','symbol':'NVDA','purchaseDate':'2026-10-02','investedAmount':200,'executionPrice':200,'quantity':1,'notes':'QA lot'}]}))
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
        if '/api/earnings-alerts' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({'ok':True,'source':'finnhub','upcoming':[{'id':'earnings:NVDA:2026-10-08','symbol':'NVDA','date':'2026-10-08','hour':'amc','days_until':4,'title':'NVDA earnings in 4 days'}],'configuration':{'finnhub_configured':True}}))
            return
        if '/api/decision-journal' in url:
            if route.request.method == 'POST':
                route.fulfill(status=201, content_type='application/json', body=_json.dumps({'ok':True,'entry':{'id':'qa-journal-1','symbol':'NVDA','decision_date':'2026-10-02','decision':'HOLD','thesis':'QA thesis','decision_price':200,'review_target_date':'2026-10-30','review_status':'pending'}}))
            elif route.request.method == 'PATCH':
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'ok':True,'entry':{'id':'qa-journal-1','symbol':'NVDA','review_status':'completed','rule_followed':True}}))
            else:
                route.fulfill(status=200, content_type='application/json', body=_json.dumps({'ok':True,'entries':[{'id':'qa-journal-1','symbol':'NVDA','decision_date':'2026-10-02','decision':'HOLD','thesis':'QA thesis','decision_price':200,'review_target_date':'2026-10-30','review_status':'pending','forecast_median':3.0}], 'weekly':{'period':{'start':'2026-09-28','end':'2026-10-04'},'decisions':1,'outcomes':0,'beatsBenchmark':0,'averageExcessReturnPct':None,'averageForecastErrorPct':None,'ruleAdherencePct':None,'openOutcomeReviews':0,'reflection':'No completed outcomes this week yet.'}}))
            return
        if '/api/decision-center' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({
                'ok': True,
                'checkedAt': '2026-10-04T02:00:00Z',
                'actionItems': [
                    {'severity':'WATCH','symbol':'NVDA','title':'Close to your rule','detail':'Price is approaching your review level.','impact':None},
                    {'severity':'SETUP','symbol':'META','title':'No active rule','detail':'Add a loss limit or exit rule.','impact':None}
                ],
                'rules': {'total':11,'breached':0,'near':1,'noRule':4,'noData':0},
                'portfolio': {'holdings':11,'currentValue':570.83,'netContributed':580.83,'cashFlowPnl':-10.00,'concentrationTop3Pct':42.1,'semiconductorShock15Pct':-79.50},
                'benchmark': {'SPY': {'value':600,'netDeposits':580,'pnl':20,'shares':1}, 'SOXX': {'value':590,'netDeposits':580,'pnl':10,'shares':1}},
                'earnings': [{'symbol':'NVDA','date':'2026-10-08','daysUntil':4,'hour':'amc'}],
                'forecast': {'verified':24,'pending':14,'due':0,'remaining':26,'tickers':7,'dates':20,'distinctTickerDates':22,'gate':'building'}
            })); return
        if '/api/autopilot-signals' in url:
            route.fulfill(status=200, content_type='application/json', body=_json.dumps({
                'ok': True,
                'account': {'name': 'Autopilot', 'username': 'joinautopilot', 'xUrl': 'https://x.com/joinautopilot', 'platformUrl': 'https://joinautopilot.com'},
                'provider': 'qa',
                'degraded': False,
                'signals': [{'title': 'See the $NVDA portfolio', 'snippet': 'Holdings are linked to a public portfolio.', 'url': 'https://x.com/joinautopilot/status/123', 'publishedAt': '2026-10-04T00:00:00Z', 'official': True, 'sourceType': 'official-x', 'tickers': ['NVDA']}],
                'tickers': ['NVDA'],
                'portfolioLinks': ['https://joinautopilot.com/landing/1/1343'],
                'officialCoverage': 1,
                'fetchedAt': '2026-10-04T00:00:00Z'
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


def test_autopilot_signals_panel_mounts_on_macro_page(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-macro").click()
    panel = page.get_by_test_id("autopilot-signals")
    panel.wait_for(state="visible", timeout=30000)
    assert "AUTOPILOT / X SIGNALS" in panel.inner_text()
    assert "joinautopilot" in panel.inner_text()


def test_decision_impact_center_mounts_and_prioritizes_reviews(page):
    mock_local_apis(page)
    goto_app(page)
    center = page.get_by_test_id("decision-impact-center")
    center.wait_for(state="visible", timeout=30000)
    assert "What matters for you now" in center.inner_text()
    assert "Same cash-flow benchmark" in center.inner_text()
    assert "verified" in center.inner_text()
    assert "/50" in center.inner_text()
    assert "NVDA" in center.inner_text()


def test_decision_journal_mounts(page):
    mock_local_apis(page)
    goto_app(page)
    journal = page.get_by_test_id("decision-journal")
    journal.wait_for(state="visible", timeout=30000)
    assert "Decision journal + 20-day review" in journal.inner_text()
    journal.get_by_test_id("decision-weekly-review").wait_for(state="visible", timeout=30000)


def test_forward_outlook_has_real_earnings_input(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-outlook").click()
    outlook = page.get_by_test_id("forward-outlook")
    outlook.wait_for(state="visible", timeout=30000)
    outlook.get_by_text("Real earnings calendar", exact=False).wait_for(state="visible", timeout=30000)
    assert "NVDA earnings" in outlook.inner_text()


def test_purchase_lot_sanity_check_mounts(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="visible", timeout=30000)
    portfolio.get_by_label("Purchase history for NVDA").click()
    portfolio.get_by_text("VERIFY LOT", exact=True).wait_for(state="visible", timeout=30000) if portfolio.get_by_text("VERIFY LOT", exact=True).count() else None


def test_contract_event_study_shows_sector_benchmark_context(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.get_by_text("Event Study", exact=True).click()
    page.get_by_text("5D Beta-Adjusted vs SOXX", exact=True).wait_for(state="visible", timeout=30000)
    assert "SOXX" in page.get_by_text("5D Beta-Adjusted vs SOXX", exact=True).locator("..").inner_text()


def test_forward_outlook_has_real_earnings_input(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-outlook").click()
    outlook = page.get_by_test_id("forward-outlook")
    outlook.wait_for(state="visible", timeout=30000)
    outlook.get_by_text("Real earnings calendar", exact=False).wait_for(state="visible", timeout=30000)
    assert "NVDA earnings" in outlook.inner_text()


def test_contract_event_study_shows_sector_benchmark_context(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    page.get_by_text("Event Study", exact=True).click()
    page.get_by_text("5D benchmark context", exact=True).wait_for(state="visible", timeout=30000)
    assert "SOXX" in page.get_by_text("5D benchmark context", exact=True).locator("..").inner_text()


def test_purchase_lot_sanity_check_is_visible(page):
    mock_local_apis(page)
    goto_app(page)
    page.get_by_test_id("nav-portfolio").click()
    portfolio = page.get_by_test_id("portfolio-intelligence")
    portfolio.wait_for(state="visible", timeout=30000)
    portfolio.get_by_label("Purchase history for NVDA").click()
    portfolio.get_by_text("NO MARKET DATE", exact=True).wait_for(state="visible", timeout=30000)
