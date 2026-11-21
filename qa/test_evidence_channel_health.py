"""Collection-state diagnostics with fictional evidence, blocked external traffic and no writes."""
import datetime
import json
import pytest
from playwright.sync_api import expect
from test_ui import mock_local_apis


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
