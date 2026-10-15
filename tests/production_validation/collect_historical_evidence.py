"""Collect auditable Yahoo Finance daily price observations for offline validation.

This collector is read-only and does not claim point-in-time availability. Yahoo's
chart response does not establish when a historical value was first available to a
strategy, nor does it provide historical universe membership. Those gates stay
BLOCKED until separately sourced evidence is supplied.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .historical_evidence import validate_price_evidence, validate_universe_membership

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
    return {"raw": body, "raw_sha256": hashlib.sha256(raw).hexdigest()}, url


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
        # A chart observation timestamp is not evidence of publication/availability.
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--symbols", required=True, help="Comma-separated symbols, e.g. NVDA,MU,MSFT")
    parser.add_argument("--start", required=True, help="UTC start date YYYY-MM-DD")
    parser.add_argument("--end", required=True, help="UTC end date YYYY-MM-DD (exclusive)")
    parser.add_argument("--membership-json", help="Separately sourced, effective-dated universe membership JSON")
    parser.add_argument("--output", default="historical-evidence-report.json")
    args = parser.parse_args(argv)

    try:
        start = datetime.strptime(args.start, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        end = datetime.strptime(args.end, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if end <= start:
            raise ValueError("--end must be after --start")
        symbols = sorted({s.strip().upper() for s in args.symbols.split(",") if s.strip()})
        if not symbols:
            raise ValueError("Provide at least one symbol")
    except ValueError as exc:
        parser.error(str(exc))

    report: dict[str, Any] = {
        "schema_version": 1,
        "generated_at": utc_now(),
        "collector": "tests.production_validation.collect_historical_evidence",
        "period": {"start_utc": args.start, "end_utc_exclusive": args.end},
        "symbols_requested": symbols,
        "sources": [],
        "price_rows": [],
        "errors": [],
    }
    period1, period2 = int(start.timestamp()), int(end.timestamp())
    for symbol in symbols:
        try:
            payload, url = fetch_chart(symbol, period1, period2)
            retrieved_at = utc_now()
            rows = extract_price_rows(symbol, payload, url, retrieved_at)
            report["price_rows"].extend(rows)
            report["sources"].append({
                "symbol": symbol,
                "source": "Yahoo Finance chart API",
                "source_url": url,
                "retrieved_at": retrieved_at,
                "raw_response_sha256": payload["raw_sha256"],
                "rows_collected": len(rows),
            })
            print(f"{symbol}: collected {len(rows)} adjusted-close observations; availability time remains unverified")
        except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError, KeyError) as exc:
            report["errors"].append({"symbol": symbol, "error": str(exc)})
            print(f"{symbol}: ERROR {exc}", file=sys.stderr)

    # Intentionally BLOCKED: vendor retrieval time is not substituted for historical availability.
    price_validation = {
        "status": "BLOCKED",
        "checked": len(report["price_rows"]),
        "errors": [
            "Yahoo chart data alone does not prove when each historical observation was first available.",
            "No strategy-specific decision_cutoff/available_at evidence was inferred from retrieval time.",
        ],
    }
    membership = read_json(args.membership_json)
    membership_validation = validate_universe_membership(membership)
    report["validation"] = {
        "price_evidence": price_validation,
        "universe_membership": membership_validation,
        "overall_status": "BLOCKED",
    }
    report["release_note"] = (
        "Collected prices are source-attributed observations, not a validated point-in-time backtest dataset. "
        "Attach independently sourced publication/availability timestamps, decision cutoffs, and effective-dated "
        "universe membership before upgrading either gate."
    )
    output = Path(args.output)
    output.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(f"Report: {output.resolve()}")
    print(f"Report SHA-256: {digest}")
    print(f"Price gate: {price_validation['status']}; universe gate: {membership_validation['status']}")
    if report["errors"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
