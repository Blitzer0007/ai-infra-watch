"""Collect auditable Yahoo Finance observations without overstating point-in-time validity."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .historical_evidence import validate_universe_membership

USER_AGENT = "AI-Infra-Watch-Historical-Evidence/1.0"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fetch_chart(symbol: str, period1: int, period2: int) -> tuple[dict[str, Any], str]:
    encoded = urllib.parse.quote(symbol, safe=".^=-")
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}"
        f"?period1={period1}&period2={period2}&interval=1d&events=div%2Csplits"
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read()
        if response.status != 200:
            raise RuntimeError(f"Yahoo chart returned HTTP {response.status} for {symbol}")
    body = json.loads(raw)
    result = (body.get("chart") or {}).get("result") or []
    errors = (body.get("chart") or {}).get("error")
    if errors or not result:
        raise RuntimeError(f"No Yahoo chart result for {symbol}: {errors or 'empty result'}")
    return {"raw": body, "raw_bytes": raw, "raw_sha256": hashlib.sha256(raw).hexdigest()}, url


def extract_price_rows(symbol: str, payload: dict[str, Any], source_url: str, retrieved_at: str) -> list[dict[str, Any]]:
    result = payload["raw"]["chart"]["result"][0]
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quote = (indicators.get("quote") or [{}])[0]
    adjusted = (indicators.get("adjclose") or [{}])[0].get("adjclose") or []
    closes = quote.get("close") or []
    rows = []
    for i, epoch in enumerate(timestamps):
        close = closes[i] if i < len(closes) else None
        adj_close = adjusted[i] if i < len(adjusted) else None
        if not isinstance(epoch, (int, float)) or not isinstance(adj_close, (int, float)):
            continue
        observed_at = datetime.fromtimestamp(epoch, timezone.utc).isoformat().replace("+00:00", "Z")
        rows.append({
            "symbol": symbol,
            "date": observed_at,
            "close": close,
            "adjusted_close": adj_close,
            "adjusted": True,
            "source": "Yahoo Finance chart API",
            "source_url": source_url,
            "retrieved_at": retrieved_at,
            "available_at": None,
            "availability_status": "unknown_vendor_publication_time",
            "decision_cutoff": None,
            "provider_timestamp": observed_at,
            "provider_timezone": "UTC",
        })
    return rows


def read_json(path: str | None) -> Any:
    if not path:
        return []
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def build_integrity_summary(rows: list[dict[str, Any]], symbols: list[str], start: str, end: str, collection_errors: list[dict[str, Any]]) -> dict[str, Any]:
    keys = [(row.get("symbol"), row.get("date")) for row in rows]
    duplicate_count = len(keys) - len(set(keys))
    invalid_value_count = sum(
        not isinstance(row.get("close"), (int, float)) or row.get("close") <= 0
        or not isinstance(row.get("adjusted_close"), (int, float)) or row.get("adjusted_close") <= 0
        for row in rows
    )
    out_of_range_count = sum(not (start <= str(row.get("date", ""))[:10] < end) for row in rows)
    weekend_count = sum(
        datetime.fromisoformat(str(row["date"]).replace("Z", "+00:00")).weekday() >= 5
        for row in rows if isinstance(row.get("date"), str)
    )
    per_symbol = {symbol: sum(1 for row in rows if row.get("symbol") == symbol) for symbol in symbols}
    errors = []
    if duplicate_count:
        errors.append(f"Found {duplicate_count} duplicate symbol/date rows.")
    if invalid_value_count:
        errors.append(f"Found {invalid_value_count} missing, non-numeric, or non-positive close values.")
    if out_of_range_count:
        errors.append(f"Found {out_of_range_count} observations outside the requested date range.")
    if weekend_count:
        errors.append(f"Found {weekend_count} weekend observations; verify provider timestamps/calendar.")
    if collection_errors:
        errors.append(f"Provider collection failed for {len(collection_errors)} symbol(s).")
    return {
        "status": "PASS" if not errors else "FAIL",
        "symbols_with_rows": per_symbol,
        "total_rows": len(rows),
        "duplicate_symbol_date_rows": duplicate_count,
        "invalid_price_rows": invalid_value_count,
        "out_of_range_rows": out_of_range_count,
        "weekend_rows": weekend_count,
        "errors": errors,
        "note": "This does not prove every exchange session is present. Validate against an explicit exchange calendar before backtesting.",
    }


def build_session_coverage(
    rows: list[dict[str, Any]],
    symbols: list[str],
    start: str,
    end: str,
    expected_sessions: list[str],
    calendar_metadata: dict[str, Any],
    collection_errors: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compare observed session dates with an independent exchange-calendar model."""
    expected = sorted({d for d in expected_sessions if start <= d < end})
    per_symbol = {}
    any_gaps = False
    for symbol in symbols:
        observed = sorted({
            str(row.get("date", ""))[:10]
            for row in rows
            if row.get("symbol") == symbol and isinstance(row.get("date"), str)
            and start <= str(row.get("date", ""))[:10] < end
        })
        observed_set = set(observed)
        expected_set = set(expected)
        missing = sorted(expected_set - observed_set)
        unexpected = sorted(observed_set - expected_set)
        any_gaps = any_gaps or bool(missing or unexpected)
        per_symbol[symbol] = {
            "expected_sessions": len(expected),
            "observed_sessions": len(observed_set),
            "missing_sessions": missing,
            "unexpected_sessions": unexpected,
            "coverage_pct": round(100 * len(expected_set & observed_set) / len(expected_set), 3) if expected_set else None,
            "status": "PASS" if not missing and not unexpected and symbol not in {
                str(item.get("symbol", "")).upper() for item in collection_errors
            } else "FAIL",
        }
    failed_symbols = [symbol for symbol, data in per_symbol.items() if data["status"] != "PASS"]
    return {
        "status": "PASS" if not any_gaps and not failed_symbols and not collection_errors else "FAIL",
        "calendar": calendar_metadata,
        "expected_session_count": len(expected),
        "symbols": per_symbol,
        "collection_error_count": len(collection_errors),
        "note": "This compares dates to the exchange_calendars XNYS schedule model. It is an independent completeness check, not a first-party exchange attestation or proof of historical data availability.",
    }


def load_exchange_sessions(start: str, end: str) -> tuple[list[str], dict[str, Any]]:
    """Generate expected US equity sessions using the XNYS schedule model."""
    import exchange_calendars as xcals
    from importlib.metadata import version
    from datetime import date, timedelta

    end_inclusive = (date.fromisoformat(end) - timedelta(days=1)).isoformat()
    calendar = xcals.get_calendar("XNYS")
    sessions = calendar.sessions_in_range(start, end_inclusive)
    session_dates = sorted({session.date().isoformat() for session in sessions})
    metadata = {
        "provider": "exchange_calendars",
        "package_version": version("exchange-calendars"),
        "calendar_id": "XNYS",
        "range_start_inclusive": start,
        "range_end_exclusive": end,
        "session_count": len(session_dates),
        "purpose": "independent exchange-session completeness cross-check",
    }
    return session_dates, metadata


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", required=True, help="Comma-separated symbols, e.g. NVDA,MU,MSFT")
    parser.add_argument("--start", required=True, help="UTC start date YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="UTC end date YYYY-MM-DD (exclusive)")
    parser.add_argument("--membership-json", help="Separately sourced, effective-dated universe membership JSON")
    parser.add_argument("--output", default="historical-evidence-report.json")
    parser.add_argument("--raw-dir", help="Directory for exact raw provider response bodies; defaults to <output-stem>_raw")
    args = parser.parse_args(argv)

    try:
        start_dt = datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if end_dt <= start_dt:
            raise ValueError("--end must be after --start")
        symbols = sorted({s.strip().upper() for s in args.symbols.split(",") if s.strip()})
        if not symbols:
            raise ValueError("Provide at least one symbol")
    except ValueError as exc:
        parser.error(str(exc))

    output = Path(args.output)
    raw_dir = Path(args.raw_dir) if args.raw_dir else output.with_name(output.stem + "_raw")
    raw_dir.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "schema_version": 2,
        "generated_at": utc_now(),
        "collector": "tests.production_validation.collect_historical_evidence",
        "period": {"start_utc": args.start, "end_utc_exclusive": args.end},
        "symbols_requested": symbols,
        "sources": [],
        "price_rows": [],
        "errors": [],
    }
    period1, period2 = int(start_dt.timestamp()), int(end_dt.timestamp())
    for symbol in symbols:
        try:
            payload, url = fetch_chart(symbol, period1, period2)
            retrieved_at = utc_now()
            rows = extract_price_rows(symbol, payload, url, retrieved_at)
            raw_path = raw_dir / f"{symbol}.response.json"
            raw_path.write_bytes(payload["raw_bytes"])
            report["price_rows"].extend(rows)
            report["sources"].append({
                "symbol": symbol,
                "source": "Yahoo Finance chart API",
                "source_url": url,
                "retrieved_at": retrieved_at,
                "raw_response_sha256": payload["raw_sha256"],
                "raw_response_file": str(raw_path),
                "rows_collected": len(rows),
            })
            print(f"{symbol}: collected {len(rows)} adjusted-close observations; raw response preserved; availability time remains unverified")
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError, KeyError, OSError) as exc:
            report["errors"].append({"symbol": symbol, "error": str(exc)})
            print(f"{symbol}: ERROR {exc}", file=sys.stderr)

    report["integrity_checks"] = build_integrity_summary(
        report["price_rows"], symbols, args.start, args.end, report["errors"]
    )
    membership_validation = validate_universe_membership(read_json(args.membership_json))
    report["validation"] = {
        "price_evidence": {
            "status": "BLOCKED",
            "checked": len(report["price_rows"]),
            "errors": [
                "Yahoo chart data alone does not prove when each historical observation was first available.",
                "No strategy-specific decision_cutoff/available_at evidence was inferred from retrieval time.",
                "Adjusted-close values can incorporate later corporate-action adjustments and require point-in-time semantics review.",
            ],
        },
        "universe_membership": membership_validation,
        "overall_status": "BLOCKED",
    }
    report["raw_response_directory"] = str(raw_dir)
    report["release_evidence_summary"] = {
        "structural_integrity": report["integrity_checks"]["status"],
        "historical_price_availability": "BLOCKED",
        "historical_universe_membership": membership_validation["status"],
        "raw_response_files_preserved": len(report["sources"]),
        "provider_collection_errors": len(report["errors"]),
        "release_ready": False,
    }
    report["release_note"] = (
        "Source-attributed observations and raw response bodies are preserved for audit. "
        "They are not a validated point-in-time backtest dataset. Attach independently sourced publication/availability "
        "timestamps, decision cutoffs, an exchange calendar, and effective-dated universe membership before upgrading gates."
    )
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"Report: {output.resolve()}")
    print(f"Report SHA-256: {digest}")
    print(f"Raw provider responses: {raw_dir.resolve()}")
    print(f"Structural integrity: {report['integrity_checks']['status']}")
    print(f"Price gate: BLOCKED; universe gate: {membership_validation['status']}; release ready: NO")
    return 1 if report["errors"] or report["integrity_checks"]["status"] != "PASS" else 0


if __name__ == "__main__":
    raise SystemExit(main())
