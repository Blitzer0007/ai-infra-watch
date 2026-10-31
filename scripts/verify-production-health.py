#!/usr/bin/env python3
"""Read-only authenticated production verification for AI Infra Watch.

This script performs GET requests only. It does not send Telegram messages,
modify alert configuration, or enable Re-entry.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_URL = "https://ai-infra-watch-theta.vercel.app"


def fail(message: str) -> None:
    raise SystemExit(message)


def get_json(path: str, headers: dict[str, str]) -> dict:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "aiw-production-health-verification/1.0",
        **headers,
    }
    request = Request(BASE_URL + path, headers=request_headers, method="GET")
    try:
        with urlopen(request, timeout=60) as response:
            status = response.status
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        fail(f"Authenticated GET {path} returned HTTP {exc.code}.")
    except (URLError, TimeoutError) as exc:
        fail(f"Authenticated GET {path} failed: {type(exc).__name__}.")
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail(f"Authenticated GET {path} did not return valid JSON.")

    if status != 200 or not isinstance(payload, dict):
        fail(f"Authenticated GET {path} returned an unexpected response.")
    return payload


def load_headers() -> dict[str, str]:
    raw_headers = os.environ.get("QA_HEADERS_JSON", "").strip()
    if not raw_headers:
        fail("QA_HEADERS_JSON is missing. Add the existing auth header JSON as a GitHub Actions secret.")

    try:
        headers = json.loads(raw_headers)
    except json.JSONDecodeError:
        fail("QA_HEADERS_JSON must contain a JSON object.")

    if not isinstance(headers, dict):
        fail("QA_HEADERS_JSON must contain a JSON object.")

    normalized = {str(key): str(value) for key, value in headers.items()}
    authorization = next(
        (value for key, value in normalized.items() if key.lower() == "authorization"),
        "",
    )
    if not authorization.lower().startswith("bearer ") or not authorization[7:].strip():
        fail("QA_HEADERS_JSON must include an existing Authorization: Bearer token header.")
    return normalized


def verify_data_health(headers: dict[str, str]) -> None:
    market = get_json("/api/market?route=market-data-health&refresh=true", headers)
    rows = market.get("rows")
    if market.get("ok") is not True or not isinstance(rows, list) or not rows:
        fail("Data Health did not return a non-empty market diagnostics payload.")

    for row in rows:
        if not isinstance(row, dict) or not row.get("symbol"):
            fail("Data Health returned a row without a symbol.")
        if not isinstance(row.get("quote"), dict) or not isinstance(row.get("history"), dict):
            fail(f"Data Health diagnostics are incomplete for {row.get('symbol', 'unknown')}.")

    print(f"PASS — Data Health endpoint returned {len(rows)} symbol(s).")
    for row in rows:
        quote = row["quote"]
        history = row["history"]
        print(
            f"  {row['symbol']}: quote={quote.get('providerStatus') or quote.get('errorCode') or 'unknown'}, "
            f"history={history.get('providerStatus') or history.get('errorCode') or 'unknown'}, "
            f"adjusted_coverage={history.get('adjustedCoveragePct', 'n/a')}%, "
            f"adjusted_complete={history.get('adjustedCloseAvailable', False)}"
        )


def verify_scheduler_and_reentry(headers: dict[str, str]) -> None:
    health = get_json("/api/job-health", headers)
    jobs_value = health.get("jobs")
    if health.get("ok") is not True or not isinstance(jobs_value, list):
        fail("Scheduler health did not return its jobs inventory.")

    jobs = {job.get("id"): job for job in jobs_value if isinstance(job, dict)}
    scheduler = jobs.get("server-smart-alerts")
    if not scheduler:
        fail("Scheduler health did not include server-smart-alerts.")

    last_success = scheduler.get("lastSuccessAt")
    if not last_success:
        fail("No successful Server Smart Alerts scheduler run is recorded.")
    try:
        last_success_time = datetime.fromisoformat(str(last_success).replace("Z", "+00:00"))
        age_minutes = (datetime.now(timezone.utc) - last_success_time).total_seconds() / 60
    except (TypeError, ValueError):
        fail("Server Smart Alerts lastSuccessAt is not a valid timestamp.")

    if last_success_time.tzinfo is None or age_minutes < -1 or age_minutes > 45:
        fail(f"Server Smart Alerts last success is outside the 45-minute window (age={age_minutes:.1f}m).")
    if scheduler.get("isStuck") is True or int(scheduler.get("stuckRunCount") or 0) > 0:
        fail("Server Smart Alerts reports a stuck scheduler run.")

    print(f"PASS — Server Smart Alerts last success {last_success} ({age_minutes:.1f} minutes ago).")

    reentry = jobs.get("reentry-alerts")
    if not reentry:
        fail("Scheduler health did not include the Re-entry workflow.")

    delivery = reentry.get("deliveryHealth")
    if reentry.get("deliveryHealthError") or not isinstance(delivery, dict):
        fail("Re-entry delivery ledger could not be read.")

    counts = delivery.get("statusCounts")
    if not isinstance(counts, dict):
        fail("Re-entry delivery ledger did not return status counts.")
    for status in ("sending", "accepted", "rejected", "uncertain"):
        if not isinstance(counts.get(status), int) or counts[status] < 0:
            fail(f"Re-entry delivery ledger has an invalid {status} count.")

    ledger_rows = delivery.get("deliveryLedgerRowsInWindow")
    if not isinstance(ledger_rows, int) or ledger_rows < 0:
        fail("Re-entry delivery ledger row count is invalid.")

    print(
        "PASS — Re-entry delivery ledger readable; "
        f"rows={ledger_rows}, accepted={counts['accepted']}, "
        f"rejected={counts['rejected']}, uncertain={counts['uncertain']}, "
        f"sending={counts['sending']}, "
        f"active_watchlist={delivery.get('activeWatchlistRows')}."
    )
    if counts["accepted"] > 0 and delivery.get("lastAcceptedAt"):
        print(f"Historical Telegram API acceptance recorded at {delivery['lastAcceptedAt']}.")
    else:
        print("NOTICE — No accepted Re-entry Telegram delivery in the current ledger window.")
        print("No test message was sent; this is not a Telegram delivery acceptance test.")


def main() -> int:
    headers = load_headers()
    verify_data_health(headers)
    verify_scheduler_and_reentry(headers)
    print("Production health verification completed using GET-only requests.")
    print("No Telegram messages were sent and no alert gates were changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
