"""Private, bounded OHLC EOD/as_of capability probe.

This is a capability diagnostic only. It deliberately does not print price values,
the API key, response bodies, or upload any market-data artifact to GitHub.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

SYMBOL = "XNAS:NVDA"
AS_OF = "2026-10-03"
DATE_FROM = "2025-10-01"
DATE_TO = "2025-10-03"


def safe_text(value: object, api_key: str, limit: int = 160) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.replace(api_key, "[redacted]") if api_key else value
    value = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", value)
    value = re.sub(r"https?://\S+", "[url redacted]", value)
    value = re.sub(r"[A-Za-z0-9_-]{32,}", "[token redacted]", value)
    return value[:limit]


def main() -> int:
    api_key = os.environ.get("OHLC_API_KEY", "").strip()
    if not api_key:
        print("OHLC_PROBE status=blocked reason=missing_secret")
        return 2

    query = urllib.parse.urlencode(
        {
            "symbols": SYMBOL,
            "from": DATE_FROM,
            "to": DATE_TO,
            "as_of": AS_OF,
            "order": "asc",
            "limit": "10",
        }
    )
    request = urllib.request.Request(
        f"https://api.ohlc.io/v1/eod?{query}",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
            "User-Agent": "AI-Infra-Watch-private-asof-diagnostic/1.0",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            status = response.status
            headers = response.headers
            body = response.read()
    except urllib.error.HTTPError as exc:
        # Only emit a whitelisted, sanitized problem summary; never the response body.
        body = exc.read()
        try:
            problem = json.loads(body)
        except (UnicodeDecodeError, json.JSONDecodeError):
            problem = {}
        code = problem.get("code") if isinstance(problem, dict) else None
        title = problem.get("title") if isinstance(problem, dict) else None
        detail = problem.get("detail") if isinstance(problem, dict) else None
        combined = " ".join(str(v) for v in (code, title, detail) if v is not None).lower()
        if "point-in-time-unavailable" in combined:
            code = "point-in-time-unavailable"
        elif not code:
            code = "provider_http_error"
        earliest = re.search(r"(?:earliest|available from|history begins).*?(20\\d{2}-\\d{2}-\\d{2})", combined)
        earliest_date = earliest.group(1) if earliest else None
        print(
            "OHLC_PROBE "
            + json.dumps(
                {
                    "result": "FAIL",
                    "http_status": exc.code,
                    "error_code": safe_text(code, api_key),
                    "error_title": safe_text(title, api_key),
                    "error_detail": safe_text(detail, api_key),
                    "earliest_as_of_hint": earliest_date,
                    "request_id": exc.headers.get("X-Request-ID") if exc.headers else None,
                },
                sort_keys=True,
            )
        )
        return 1
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"OHLC_PROBE status=error transport={type(exc).__name__}")
        return 1

    raw_sha256 = hashlib.sha256(body).hexdigest()
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        print(
            f"OHLC_PROBE status=error http_status={status} "
            f"body_sha256={raw_sha256} reason=invalid_json"
        )
        return 1

    data = payload.get("data")
    meta = payload.get("meta")
    if not isinstance(data, list) or not isinstance(meta, dict):
        print(
            f"OHLC_PROBE status=error http_status={status} "
            f"body_sha256={raw_sha256} reason=unexpected_schema"
        )
        return 1

    # Emit only non-sensitive structural facts; never dump bars or prices.
    dates = sorted(
        str(row.get("date"))
        for row in data
        if isinstance(row, dict) and row.get("date") is not None
    )
    symbols = sorted(
        {str(row.get("symbol")) for row in data if isinstance(row, dict) and row.get("symbol")}
    )
    instrument_ids = sorted(
        {
            str(row.get("instrument_id"))
            for row in data
            if isinstance(row, dict) and row.get("instrument_id")
        }
    )
    response_as_of = meta.get("as_of")
    summary = {
        "http_status": status,
        "requested_symbol": SYMBOL,
        "requested_as_of": AS_OF,
        "response_as_of": response_as_of,
        "row_count": len(data),
        "dates": dates,
        "symbols": symbols,
        "has_instrument_id": bool(instrument_ids),
        "body_sha256": raw_sha256,
        "request_id": headers.get("X-Request-ID"),
        "credits_cost": headers.get("X-Credits-Cost"),
        "credits_remaining": headers.get("X-Credits-Remaining"),
    }

    if status != 200:
        summary["result"] = "FAIL"
    elif response_as_of != AS_OF:
        summary["result"] = "FAIL"
        summary["reason"] = "response_as_of_does_not_match_requested_cutoff"
    elif not data:
        summary["result"] = "FAIL"
        summary["reason"] = "no_rows_returned"
    elif symbols and any(symbol.upper() not in {"NVDA", "XNAS:NVDA"} for symbol in symbols):
        summary["result"] = "FAIL"
        summary["reason"] = "unexpected_symbol_returned"
    elif any(not (DATE_FROM <= date <= DATE_TO) for date in dates):
        summary["result"] = "FAIL"
        summary["reason"] = "date_outside_requested_range"
    else:
        summary["result"] = "PASS"
        summary["note"] = (
            "Capability probe only. A PASS does not clear AI Infra Watch's "
            "historical-evidence release gate or prove membership history."
        )

    print("OHLC_PROBE " + json.dumps(summary, sort_keys=True))
    return 0 if summary["result"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
