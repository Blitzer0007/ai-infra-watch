"""Collection-state diagnostics with fictional evidence, blocked external traffic and no writes."""
import datetime
import json
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis


def test_history_omissions_explain_retained_coverage_without_promoting_adjusted_use(page):
    mock_local_apis(page)
    page.route('**/api/market?route=market-data-health*',lambda route:route.fulfill(json={
        'ok':True,'rows':[{'symbol':'FICT','quote':{'available':False},'history':{
            'available':True,'provider':'yahoo','adjustedCoveragePct':100,'adjustedPointCount':2,'pointCount':2,
            'adjustedCloseAvailable':False,'discardedPointCount':1,'duplicateDateCount':1,'invalidAdjustedPointCount':0}}]}))
    writes=[];page.on('request',lambda r:writes.append(r.url) if r.method not in ('GET','HEAD','OPTIONS') else None)
    page.goto('/health')
    row=page.get_by_test_id('market-sample-row')
    expect(row.get_by_test_id('sample-history-normalization')).to_contain_text('1 unusable, 1 repeated')
    expect(row).to_contain_text('Adjusted-history use remains withheld')
    expect(row).to_contain_text('percentage counts retained rows only')
    panel=page.get_by_label('Source diagnostics',exact=True);panel.locator('summary').click()
    panel.get_by_role('button',name='Prepare source diagnostics',exact=True).click()
    report=json.loads(panel.get_by_role('textbox',name='Source diagnostics preview',exact=True).input_value())
    assert report['rows'][0]['history']['discardedPointCount']==1
    assert report['rows'][0]['history']['duplicateDateCount']==1
    assert report['rows'][0]['history']['adjustedCloseAvailable'] is False
    page.set_viewport_size({'width':360,'height':1000})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    assert writes==[]


@pytest.mark.parametrize("width,clipboard_ok", [(360, True), (1440, False)])
def test_source_diagnostic_preview_is_redacted_local_and_has_manual_copy_fallback(page, width, clipboard_ok):
    mock_local_apis(page)
    page.set_viewport_size({"width": width, "height": 1000})
    page.add_init_script("""Object.defineProperty(navigator, 'clipboard', {value: {
      writeText: async text => { %s }
    }});""" % ("window.copiedReport = text;" if clipboard_ok else "throw new Error('fictional denial');"))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    page.route("**/api/market?route=market-data-health*", lambda route: route.fulfill(status=200, json={
        "ok": True, "retrievedAt": now, "rows": [{"symbol": "PRIVATEHOLDING", "quantity": 987654,
            "quote": {"provider": "yahoo", "available": False, "errorCode": "rate_limited", "price": 12345.67,
                      "error": "fictional-sensitive-key", "valuationAdmission": {"eligible": False, "status": "missing"}},
            "history": {"available": False}}]}))
    requests, writes = [], []
    page.on("request", lambda request: requests.append(request.url))
    page.on("request", lambda request: writes.append(request.url) if request.method not in ("GET", "HEAD", "OPTIONS") else None)
    page.goto("/health")
    expect(page.get_by_test_id("market-sample-row")).to_be_visible()
    page.wait_for_load_state("networkidle")
    initial_requests = len(requests)
    panel = page.get_by_label("Source diagnostics", exact=True)
    panel.locator("summary").focus()
    page.keyboard.press("Enter")
    panel.get_by_role("button", name="Prepare source diagnostics", exact=True).click()
    preview = panel.get_by_role("textbox", name="Source diagnostics preview", exact=True)
    report_text = preview.input_value()
    report = json.loads(report_text)
    assert report["rows"][0]["quote"]["errorCode"] == "rate_limited"
    assert report["rows"][0]["quote"]["reportedEligible"] is False
    assert "does not test the public Yahoo" in report["sourcePath"]
    for private in ["PRIVATEHOLDING", "fictional-sensitive-key", "987654", "12345.67"]:
        assert private not in report_text
    panel.get_by_role("button", name="Copy report", exact=True).click()
    if clipboard_ok:
        expect(panel.get_by_role("status")).to_contain_text("Copied")
        assert page.evaluate("window.copiedReport") == report_text
    else:
        expect(panel.get_by_role("status")).to_contain_text("copy the preview manually")
        expect(preview).to_have_value(report_text)
    assert len(requests) == initial_requests and writes == []
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def fictional_channels():
    now = datetime.datetime.now(datetime.timezone.utc)
    def timestamp(seconds):
        return (now - datetime.timedelta(seconds=seconds)).isoformat()
    current = {"status": "AVAILABLE", "retrievedAt": timestamp(30), "refreshIntervalSeconds": 60}
    return {
        "market": current,
        "news": {**current, "freshness": {"status": "STALE", "ageMinutes": 500}},
        "contracts": {**current, "lastRefreshError": "fictional-sensitive-source-detail"},
        "political": {**current, "conflictStatus": "CONFLICT"},
        "congress": {**current, "fallback": True},
        "macro": {**current, "retrievedAt": timestamp(181)},
        "empty": {"status": "NOT_FOUND"},
        "pending": {"status": "PENDING"},
        "odd": {**current, "status": "FICTIONAL_PRIVATE_STATUS"},
        "excluded": {"status": "NOT_APPLICABLE"},
    }


def packet(channels):
    return {"stockPrices": {}, "contracts": [], "congressTrades": [], "macroRisks": [],
            "marketSentiment": "Fictional QA evidence", "evidenceAvailability": channels}


def reply_with(page, channels):
    mock_local_apis(page)
    page.route("**/api/live-data*", lambda route: route.fulfill(
        status=200, content_type="application/json", body=json.dumps(packet(channels))))


@pytest.mark.parametrize("width", [360, 768, 1440])
def test_summary_and_channel_recovery_states_agree_without_extra_reads_or_writes(page, width):
    reply_with(page, fictional_channels())
    page.set_viewport_size({"width": width, "height": 1000})
    writes, provider_reads, errors = [], [], []
    page.on("request", lambda request: writes.append(request.url)
            if request.method not in ("GET", "HEAD", "OPTIONS") else None)
    page.on("request", lambda request: provider_reads.append(request.url)
            if "/api/market?route=market-data-health" in request.url else None)
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto("/health")
    summary = page.get_by_test_id("evidence-channel-summary")
    expect(summary).to_contain_text("Evidence channels · attention")
    for key, count in [("healthy", 1), ("attention", 5), ("missing", 1),
                       ("unknown", 2), ("not-applicable", 1), ("total", 10)]:
        expect(summary.get_by_test_id("channel-count-" + key)).to_have_text(str(count))
    expect(summary).to_contain_text("Needs refresh: 1")
    expect(summary).to_contain_text("Provider issues: 1")
    expect(summary).to_contain_text("do not establish quote eligibility")
    details = page.get_by_label("Evidence channel health", exact=True)
    expect(page.get_by_test_id("evidence-channel-news")).not_to_be_visible()
    details.locator("summary").focus()
    page.keyboard.press("Enter")
    for key, label in [("news", "Needs refresh"), ("contracts", "Provider issue"),
                       ("political", "Conflict"), ("congress", "Fallback"), ("macro", "Aging"),
                       ("empty", "Missing"), ("pending", "Pending"), ("odd", "Unknown"),
                       ("excluded", "Not applicable")]:
        row = page.get_by_test_id("evidence-channel-" + key)
        expect(row.get_by_text(label, exact=True)).to_be_visible()
        expect(row).to_contain_text("Next:")
    expect(page.get_by_test_id("evidence-channel-contracts")).to_contain_text("Previously returned items may still exist")
    expect(page.get_by_test_id("evidence-channel-empty")).to_contain_text("does not establish that no events occurred")
    assert "fictional-sensitive-source-detail" not in details.inner_text()
    assert "FICTIONAL_PRIVATE_STATUS" not in details.inner_text()
    page.wait_for_load_state("networkidle")
    assert 1 <= len(provider_reads) <= 2, "The existing bounded sample must not gain additional reads"
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    assert writes == [] and errors == []


@pytest.mark.parametrize("fields", [
    {"retrievedAt": None}, {"retrievedAt": "not-a-date"},
    {"retrievedAt": "2999-01-01T00:00:00Z"}, {"refreshIntervalSeconds": 0},
    {"freshness": {"status": "UNKNOWN", "ageMinutes": None}},
    {"feedHealth": {"status": "UNRECOGNIZED"}},
])
def test_incomplete_source_metadata_is_unknown_even_with_a_success_status(page, fields):
    reply_with(page, {"market": {**fictional_channels()["market"], **fields}})
    page.goto("/health")
    expect(page.get_by_test_id("channel-count-healthy")).to_have_text("0")
    expect(page.get_by_test_id("channel-count-unknown")).to_have_text("1")
    page.get_by_label("Evidence channel health", exact=True).locator("summary").click()
    expect(page.get_by_test_id("evidence-channel-market").get_by_text("Unknown", exact=True)).to_be_visible()


@pytest.mark.parametrize("channels", [{}, None, []])
def test_completed_empty_or_malformed_channels_do_not_claim_zero_issues(page, channels):
    reply_with(page, channels)
    page.goto("/health")
    summary = page.get_by_test_id("evidence-channel-summary")
    expect(summary).to_contain_text("No channel observations returned; coverage is unknown.")
    expect(summary.get_by_test_id("channel-count-healthy")).to_have_text("—")
    expect(summary.get_by_test_id("channel-count-total")).to_have_text("0")


def test_failed_feed_refresh_unconfirms_old_records_and_retry_can_recover(page):
    mock_local_apis(page)
    failed = [False]
    def respond(route):
        route.fulfill(status=503 if failed[0] else 200, content_type="application/json",
                      body='{"error":"fictional-private-provider-response"}' if failed[0]
                      else json.dumps(packet({"market": fictional_channels()["market"]})))
    page.route("**/api/live-data*", respond)
    writes = []
    page.on("request", lambda request: writes.append(request.url)
            if request.method not in ("GET", "HEAD", "OPTIONS") else None)
    page.goto("/health")
    expect(page.get_by_test_id("channel-count-healthy")).to_have_text("1")
    page.wait_for_load_state("networkidle")
    failed[0] = True
    page.get_by_role("button", name="Refresh evidence data", exact=True).click()
    summary = page.get_by_test_id("evidence-channel-summary")
    expect(summary).to_contain_text("Latest feed request failed")
    expect(summary.get_by_test_id("channel-count-healthy")).to_have_text("—")
    page.get_by_label("Evidence channel health", exact=True).locator("summary").click()
    expect(page.get_by_test_id("evidence-channel-market").get_by_text("Unknown", exact=True)).to_be_visible()
    failed[0] = False
    page.get_by_role("button", name="Refresh evidence data", exact=True).click()
    expect(summary.get_by_test_id("channel-count-healthy")).to_have_text("1")
    expect(summary.get_by_role("alert")).to_have_count(0)
    assert "fictional-private-provider-response" not in summary.inner_text()
    assert writes == []
