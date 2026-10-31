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
MAX_SCHEDULER_AGE_MINUTES = 45


def fail(message: str) -> None:
    raise SystemExit(message)


def get_json(path: str, headers: dict[str, str]) -> dict:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "aiw-production-health-verification/1.1",
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


def verify_scheduler_and_reentry(headers: dict[str, str]) -> list[str]:
    failures: list[str] = []
    health = get_json("/api/job-health", headers)
    jobs_value = health.get("jobs")
    if health.get("ok") is not True or not isinstance(jobs_value, list):
        fail("Scheduler health did not return its jobs inventory.")

    jobs = {job.get("id"): job for job in jobs_value if isinstance(job, dict)}
    scheduler = jobs.get("server-smart-alerts")

    if not scheduler:
        failures.append("Scheduler health did not include server-smart-alerts.")
        print("FAIL — Server Smart Alerts job is missing from the scheduler inventory.")
    else:
        last_success = scheduler.get("lastSuccessAt")
        print(
            "Server Smart Alerts details: "
            f"status={scheduler.get('status')}, conclusion={scheduler.get('conclusion')}, "
            f"last_run={scheduler.get('lastRunAt')}, last_success={last_success}, "
            f"recent_failures={scheduler.get('recentFailureCount')}, "
            f"recent_skips={scheduler.get('recentSkippedCount')}, "
            f"stuck_runs={scheduler.get('stuckRunCount')}."
        )
        recent_runs = scheduler.get("recentRuns")
        if isinstance(recent_runs, list):
            for run in recent_runs[:5]:
                if isinstance(run, dict):
                    print(
                        "  scheduler run: "
                        f"number={run.get('number')}, created={run.get('createdAt')}, "
                        f"status={run.get('status')}, conclusion={run.get('conclusion')}"
                    )

        if not last_success:
            failures.append("No successful Server Smart Alerts scheduler run is recorded.")
            print("FAIL — No successful Server Smart Alerts run is recorded.")
        else:
            try:
                last_success_time = datetime.fromisoformat(str(last_success).replace("Z", "+00:00"))
                age_minutes = (datetime.now(timezone.utc) - last_success_time).total_seconds() / 60
            except (TypeError, ValueError):
                failures.append("Server Smart Alerts lastSuccessAt is not a valid timestamp.")
                print("FAIL — Server Smart Alerts lastSuccessAt is not a valid timestamp.")
            else:
                if last_success_time.tzinfo is None or age_minutes < -1 or age_minutes > MAX_SCHEDULER_AGE_MINUTES:
                    failures.append(
                        f"Server Smart Alerts last success is outside the {MAX_SCHEDULER_AGE_MINUTES}-minute window "
                        f"(age={age_minutes:.1f}m)."
                    )
                    print(
                        f"FAIL — Server Smart Alerts last success is {age_minutes:.1f} minutes old; "
                        f"limit is {MAX_SCHEDULER_AGE_MINUTES} minutes."
                    )
                else:
                    print(f"PASS — Server Smart Alerts last success is {age_minutes:.1f} minutes old.")

        try:
            stuck_count = int(scheduler.get("stuckRunCount") or 0)
        except (TypeError, ValueError):
            stuck_count = 1
        if scheduler.get("isStuck") is True or stuck_count > 0:
            failures.append("Server Smart Alerts reports a stuck scheduler run.")
            print("FAIL — Server Smart Alerts reports a stuck scheduler run.")

    # Check the independent Re-entry ledger even when the unrelated Smart Alerts
    # scheduler freshness gate fails. This avoids hiding a useful health result.
    reentry = jobs.get("reentry-alerts")
    if not reentry:
        failures.append("Scheduler health did not include the Re-entry workflow.")
        print("FAIL — Re-entry workflow is missing from the scheduler inventory.")
    else:
        delivery = reentry.get("deliveryHealth")
        if reentry.get("deliveryHealthError") or not isinstance(delivery, dict):
            failures.append("Re-entry delivery ledger could not be read.")
            print("FAIL — Re-entry delivery ledger could not be read.")
        else:
            counts = delivery.get("statusCounts")
            valid_counts = isinstance(counts, dict) and all(
                isinstance(counts.get(status), int) and counts[status] >= 0
                for status in ("sending", "accepted", "rejected", "uncertain")
            )
            ledger_rows = delivery.get("deliveryLedgerRowsInWindow")
            valid_rows = isinstance(ledger_rows, int) and ledger_rows >= 0
            if not valid_counts:
                failures.append("Re-entry delivery ledger has invalid status counts.")
                print("FAIL — Re-entry delivery ledger has invalid status counts.")
            elif not valid_rows:
                failures.append("Re-entry delivery ledger row count is invalid.")
                print("FAIL — Re-entry delivery ledger row count is invalid.")
            else:
                print(
                    "PASS — Re-entry delivery ledger is readable; "
                    f"rows={ledger_rows}, accepted={counts['accepted']}, "
                    f"rejected={counts['rejected']}, uncertain={counts['uncertain']}, "
                    f"sending={counts['sending']}, "
                    f"active_watchlist={delivery.get('activeWatchlistRows')}."
                )
                if counts["accepted"] > 0 and delivery.get("lastAcceptedAt"):
                    print(f"Historical Telegram API acceptance recorded at {delivery['lastAcceptedAt']}.")
                else:
                    print("NOTICE — No accepted Re-entry Telegram delivery in the current ledger window.")
                    print("No test message was sent; ledger readability is not a Telegram acceptance test.")

    return failures


def main() -> int:
    headers = load_headers()
    verify_data_health(headers)
    failures = verify_scheduler_and_reentry(headers)
    if failures:
        print("Production health verification found release-gate failures:")
        for item in failures:
            print(f"  - {item}")
        return 1

    print("Production health verification completed using GET-only requests.")
    print("No Telegram messages were sent and no alert gates were changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
