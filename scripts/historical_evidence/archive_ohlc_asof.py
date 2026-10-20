"""Archive OHLC EOD rows as private, content-addressed as-of snapshots.

Each response is retained byte-for-byte in private Supabase Storage. Logs contain
only hashes, row counts, dates, and request metadata; never API keys or price values.
This is an evidence capture, not a release-gate approval.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any

from scripts.historical_evidence.storage import BUCKET, ArchiveError, utc_now, upload_object, upsert_metadata

API_URL = "https://api.ohlc.io/v1/eod"
EARLIEST_SUPPORTED_AS_OF = date(2026, 9, 22)
USER_AGENT = "AI-Infra-Watch-private-evidence-archive/1.0"

# This mapping is intentionally the OHLC Free-plan allowlist, not the dashboard's full universe.
FREE_SYMBOLS = {
    "AAPL": "XNAS:AAPL",
    "NVDA": "XNAS:NVDA",
    "JNJ": "XNYS:JNJ",
    "PEP": "XNAS:PEP",
    "MSFT": "XNAS:MSFT",
    "SPY": "ARCX:SPY",
    "QQQ": "XNAS:QQQ",
}


def five_year_start(cutoff: date) -> date:
    try:
        return cutoff.replace(year=cutoff.year - 5) + timedelta(days=1)
    except ValueError:
        # Leap-day edge case: use the final day of February then keep the range exclusive of 5y+1d.
        return cutoff.replace(year=cutoff.year - 5, day=28) + timedelta(days=1)


def validate_request(symbol: str, date_from: str, date_to: str, as_of: str) -> tuple[str, date, date, date]:
    if symbol not in FREE_SYMBOLS:
        raise ValueError("Symbol is outside the documented OHLC Free-plan allowlist")
    try:
        start = date.fromisoformat(date_from)
        end = date.fromisoformat(date_to)
        cutoff = date.fromisoformat(as_of)
    except ValueError as exc:
        raise ValueError("Dates must use YYYY-MM-DD format") from exc
    if cutoff < EARLIEST_SUPPORTED_AS_OF:
        raise ValueError("OHLC has not exposed point-in-time history before 2026-09-22")
    if cutoff > datetime.now(timezone.utc).date():
        raise ValueError("as_of cannot be in the future")
    if end < start:
        raise ValueError("to date must not precede from date")
    if end > cutoff:
        raise ValueError("to date must not exceed the as_of cutoff")
    if (end - start).days > 1830:
        raise ValueError("Each request is limited to a five-year lookback")
    return FREE_SYMBOLS[symbol], start, end, cutoff


def _finite_number(value: Any, *, positive: bool = False) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number) and (number > 0 if positive else number >= 0)


def validate_payload(payload: Any, symbol: str, date_from: str, date_to: str, as_of: str) -> dict[str, Any]:
    """Check one provider page's schema and point-in-time cutoff."""
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list) or not isinstance(payload.get("meta"), dict):
        raise ValueError("Provider response did not match the expected data/meta JSON schema")
    rows = payload["data"]
    meta = payload["meta"]
    response_as_of = meta.get("as_of")
    if not isinstance(response_as_of, str) or response_as_of[:10] != as_of:
        raise ValueError("Provider response as_of did not match the requested cutoff date")
    if "next_cursor" not in meta:
        raise ValueError("Provider response is missing pagination metadata; refuse a potentially truncated archive")
    if not rows:
        raise ValueError("Provider returned no rows for this symbol/window")
    dates: list[str] = []
    instrument_ids: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Provider returned a non-object bar")
        if row.get("symbol") != symbol:
            raise ValueError("Provider returned an unexpected symbol")
        trading_date = row.get("date")
        if not isinstance(trading_date, str) or len(trading_date) != 10:
            raise ValueError("Provider bar is missing a YYYY-MM-DD date")
        try:
            date.fromisoformat(trading_date)
        except ValueError as exc:
            raise ValueError("Provider returned an invalid trading date") from exc
        if not date_from <= trading_date <= date_to:
            raise ValueError("Provider returned a row outside the requested date range")
        dates.append(trading_date)
        instrument_id = row.get("instrument_id") or row.get("security_id")
        if not isinstance(instrument_id, str) or not instrument_id.strip():
            raise ValueError("Provider bar is missing a stable instrument/security identifier")
        instrument_ids.add(instrument_id)
        for field in ("open", "high", "low", "close"):
            if not _finite_number(row.get(field), positive=True):
                raise ValueError(f"Provider bar is missing a positive finite {field}")
        if row.get("volume") is not None and not _finite_number(row.get("volume")):
            raise ValueError("Provider bar volume is not a finite non-negative number")
    if len(dates) != len(set(dates)):
        raise ValueError("Provider returned duplicate trading dates within a page")
    cursor = meta.get("next_cursor")
    if cursor is not None and (not isinstance(cursor, str) or not cursor.strip()):
        raise ValueError("Provider returned malformed pagination cursor")
    return {
        "row_count": len(rows),
        "first_date": min(dates),
        "last_date": max(dates),
        "dates": dates,
        "response_as_of": response_as_of,
        "unique_instrument_ids": len(instrument_ids),
        "next_cursor": cursor,
    }


def fetch_response(
    qualified_symbol: str, date_from: date, date_to: date, as_of: date,
    cursor: str | None = None,
) -> tuple[bytes, dict[str, str]]:
    params = {
        "symbols": qualified_symbol,
        "from": date_from.isoformat(),
        "to": date_to.isoformat(),
        "as_of": as_of.isoformat(),
        "order": "asc",
        # The provider paginates at up to 500 rows; every cursor page is retained.
        "limit": "500",
    }
    if cursor is not None:
        params["cursor"] = cursor
    query = urllib.parse.urlencode(params)
    api_key = os.environ.get("OHLC_API_KEY", "").strip()
    if not api_key:
        raise ArchiveError("OHLC_API_KEY is not configured")
    request = urllib.request.Request(
        f"{API_URL}?{query}",
        headers={
            "Authorization": "Bearer " + api_key,
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = response.read(25 * 1024 * 1024 + 1)
            headers = {
                "request_id": response.headers.get("X-Request-ID", ""),
                "credits_cost": response.headers.get("X-Credits-Cost", ""),
                "credits_remaining": response.headers.get("X-Credits-Remaining", ""),
            }
            if len(body) > 25 * 1024 * 1024:
                raise ArchiveError("OHLC response exceeds the 25 MiB safety limit")
            return body, headers
    except urllib.error.HTTPError as exc:
        raise ArchiveError(f"OHLC request for {qualified_symbol} failed with HTTP {exc.code}") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ArchiveError(f"OHLC request failed ({type(exc).__name__})") from None


def archive_symbol(symbol: str, as_of: date) -> dict[str, Any]:
    qualified_symbol, start, end, cutoff = validate_request(
        symbol, five_year_start(as_of).isoformat(), as_of.isoformat(), as_of.isoformat()
    )
    pages: list[dict[str, Any]] = []
    all_dates: list[str] = []
    cursor: str | None = None
    seen_cursors: set[str] = set()

    for page_index in range(10):
        raw, headers = fetch_response(qualified_symbol, start, end, cutoff, cursor)
        try:
            payload = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise ArchiveError("OHLC returned invalid JSON") from None
        try:
            validated = validate_payload(
                payload, qualified_symbol, start.isoformat(), end.isoformat(), cutoff.isoformat()
            )
        except ValueError as exc:
            raise ArchiveError(f"OHLC response rejected for {symbol}: {exc}") from None

        all_dates.extend(validated["dates"])
        pages.append({
            "page_index": page_index + 1,
            "raw": raw,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "headers": headers,
            "validated": validated,
        })
        next_cursor = validated["next_cursor"]
        if next_cursor is None:
            break
        if next_cursor in seen_cursors:
            raise ArchiveError("OHLC returned a repeated pagination cursor")
        seen_cursors.add(next_cursor)
        cursor = next_cursor
    else:
        raise ArchiveError("OHLC exceeded the 10-page safety cap; refusing a truncated archive")

    if not pages or len(all_dates) != len(set(all_dates)):
        raise ArchiveError("OHLC pages produced an empty or duplicate-date history")
    ordered_dates = sorted(all_dates)
    retrieved_at = utc_now()
    page_manifest: list[dict[str, Any]] = []

    # Fetch and validate every page before writing any artifact for this symbol.
    for page in pages:
        validated = page["validated"]
        digest = page["sha256"]
        page_index = page["page_index"]
        object_path = (
            f"ohlc/eod_asof/{cutoff.isoformat()}/{symbol}/"
            f"page-{page_index:02d}/{digest}.json"
        )
        upload_object(object_path, page["raw"], "application/json")
        headers = page["headers"]
        upsert_metadata({
            "provider": "ohlc",
            "artifact_type": "eod_asof_response_page",
            "sha256": digest,
            "bucket_name": BUCKET,
            "object_path": object_path,
            "source_endpoint": API_URL,
            "retrieved_at": retrieved_at,
            "source_as_of": validated["response_as_of"],
            "market_date": cutoff.isoformat(),
            "row_count": validated["row_count"],
            "symbol_count": 1,
            "evidence_status": "candidate",
            "details": {
                "symbol": symbol,
                "qualified_symbol": qualified_symbol,
                "range_start": start.isoformat(),
                "range_end": end.isoformat(),
                "page_index": page_index,
                "page_count": len(pages),
                "first_bar_date": validated["first_date"],
                "last_bar_date": validated["last_date"],
                "stable_instrument_ids": validated["unique_instrument_ids"],
                "request_id": headers["request_id"] or None,
                "credits_cost": headers["credits_cost"] or None,
                "credits_remaining": headers["credits_remaining"] or None,
                "adjustment": "raw",
                "point_in_time_note": "Provider as_of view preserved verbatim; review semantics before using as release evidence.",
                "data_license_note": "Personal-use workflow. Do not redistribute source rows or expose the raw archive publicly.",
            },
        })
        page_manifest.append({
            "page_index": page_index,
            "object_path": object_path,
            "sha256": digest,
            "row_count": validated["row_count"],
            "first_date": validated["first_date"],
            "last_date": validated["last_date"],
            "request_id": headers["request_id"] or None,
            "credits_cost": headers["credits_cost"] or None,
        })

    manifest = {
        "schema_version": 1,
        "provider": "ohlc",
        "artifact_type": "eod_asof_full_history_manifest",
        "symbol": symbol,
        "qualified_symbol": qualified_symbol,
        "as_of": cutoff.isoformat(),
        "provider_as_of": pages[0]["validated"]["response_as_of"],
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "retrieved_at": retrieved_at,
        "row_count": len(all_dates),
        "unique_date_count": len(set(all_dates)),
        "first_date": ordered_dates[0],
        "last_date": ordered_dates[-1],
        "page_count": len(pages),
        "pages": page_manifest,
        "validation": "structural_pass",
        "release_gate": "not_evaluated",
        "note": "This manifest proves which provider responses were archived; it does not independently authenticate provider as_of semantics or clear universe membership evidence.",
    }
    manifest_bytes = json.dumps(manifest, separators=(",", ":"), sort_keys=True).encode("utf-8")
    manifest_sha = hashlib.sha256(manifest_bytes).hexdigest()
    manifest_path = (
        f"ohlc/eod_asof/{cutoff.isoformat()}/{symbol}/manifest/{manifest_sha}.json"
    )
    upload_object(manifest_path, manifest_bytes, "application/json")
    upsert_metadata({
        "provider": "ohlc",
        "artifact_type": "eod_asof_full_history_manifest",
        "sha256": manifest_sha,
        "bucket_name": BUCKET,
        "object_path": manifest_path,
        "source_endpoint": API_URL,
        "retrieved_at": retrieved_at,
        "source_as_of": pages[0]["validated"]["response_as_of"],
        "market_date": cutoff.isoformat(),
        "row_count": len(all_dates),
        "symbol_count": 1,
        "evidence_status": "candidate",
        "details": {
            "symbol": symbol,
            "qualified_symbol": qualified_symbol,
            "range_start": start.isoformat(),
            "range_end": end.isoformat(),
            "page_count": len(pages),
            "first_bar_date": ordered_dates[0],
            "last_bar_date": ordered_dates[-1],
            "unique_date_count": len(set(all_dates)),
            "page_hashes": [page["sha256"] for page in page_manifest],
            "adjustment": "raw",
            "point_in_time_note": "Provider as_of view preserved verbatim; review semantics before using as release evidence.",
            "data_license_note": "Personal-use workflow. Do not redistribute source rows or expose the raw archive publicly.",
        },
    })
    return {
        "symbol": symbol,
        "as_of": cutoff.isoformat(),
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "rows": len(all_dates),
        "pages": len(pages),
        "first_date": ordered_dates[0],
        "last_date": ordered_dates[-1],
        "manifest_sha256": manifest_sha,
        "manifest_path": manifest_path,
        "credit_costs": [page["headers"]["credits_cost"] or None for page in pages],
        "result": "archived_candidate",
    }

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", default=datetime.now(timezone.utc).date().isoformat())
    parser.add_argument("--symbols", default=",".join(FREE_SYMBOLS), help="Subset of the OHLC Free-plan allowlist")
    args = parser.parse_args(argv)
    try:
        cutoff = date.fromisoformat(args.as_of)
        symbols = [part.strip().upper() for part in args.symbols.split(",") if part.strip()]
        if not symbols or len(symbols) != len(set(symbols)):
            raise ValueError("Provide a non-empty list of unique symbols")
        if any(symbol not in FREE_SYMBOLS for symbol in symbols):
            raise ValueError("One or more symbols are outside the OHLC Free-plan allowlist")
    except ValueError as exc:
        print(f"OHLC_ARCHIVE status=blocked reason={str(exc)}")
        return 2

    results = []
    failures = []
    for symbol in symbols:
        try:
            results.append(archive_symbol(symbol, cutoff))
        except (ArchiveError, ValueError) as exc:
            failures.append({"symbol": symbol, "error": str(exc)})
    for item in results:
        print("OHLC_ARCHIVE " + json.dumps(item, sort_keys=True))
    for item in failures:
        print("OHLC_ARCHIVE " + json.dumps({"result": "failed", **item}, sort_keys=True))
    print("OHLC_ARCHIVE_SUMMARY " + json.dumps({
        "as_of": cutoff.isoformat(),
        "succeeded": len(results),
        "failed": len(failures),
        "overall": "PASS" if not failures and results else "BLOCKED",
        "release_gate": "not_evaluated",
    }, sort_keys=True))
    return 1 if failures or not results else 0


if __name__ == "__main__":
    sys.exit(main())
