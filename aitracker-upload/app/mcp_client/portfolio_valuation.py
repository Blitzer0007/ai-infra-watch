"""Pure stored-holdings context. Metadata gates are not source/accounting proof."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Context, Decimal, InvalidOperation, localcontext
import math
import re
from typing import Any

from app.mcp_client.client import MCPClientError

MAX_HOLDINGS = 150
MAX_QUOTE_CALLS = 20
QUOTE_TIME_BUDGET_SECONDS = 5.0
MAX_QUOTE_AGE_SECONDS = 900
MAX_ALIGNMENT_SECONDS = 60


def instant(value: Any) -> datetime | None:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})", value):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, OverflowError):
        return None


def number(value: Any, *, stored: bool = False) -> Decimal | None:
    # PostgREST NUMERIC holdings can be decimal strings. Quote numbers cannot.
    if isinstance(value, bool) or not isinstance(value, (int, float, Decimal, str)) or (isinstance(value, str) and not stored):
        return None
    text = str(value)
    if len(text) > 80 or not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d{1,4})?", text):
        return None
    try:
        result = Decimal(text)
        if not result.is_finite() or (result != 0 and not -100 <= result.adjusted() <= 100):
            return None
        if stored and result != 0:
            digits = list(result.as_tuple().digits)
            exponent = result.as_tuple().exponent
            while digits and digits[-1] == 0:
                digits.pop()
                exponent += 1
            if result.copy_abs() >= Decimal("1e12") or exponent < -8:
                return None
        return result
    except InvalidOperation:
        return None


def wire(value: Decimal | None) -> float | None:
    if value is None:
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def select_holdings(rows: Any, requested: str | None = None) -> list[dict[str, Any]]:
    if requested is not None and (not isinstance(requested, str) or not re.fullmatch(r"[A-Z0-9.^=-]{1,20}", requested)):
        raise MCPClientError("INVALID_ARGUMENT", "Invalid portfolio symbol")
    if not isinstance(rows, list) or len(rows) > MAX_HOLDINGS:
        raise MCPClientError("COVERAGE", "Stored holdings coverage is unavailable or exceeds the context limit")
    symbols = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("symbol"), str):
            raise MCPClientError("INVALID_DATA", "Stored holdings contain malformed identities")
        symbol = row["symbol"].strip().upper()
        if not re.fullmatch(r"[A-Z0-9.^=-]{1,20}", symbol) or symbol in symbols:
            raise MCPClientError("INVALID_DATA", "Stored holdings contain invalid or duplicate identities")
        symbols.append(symbol)
    return [row for row, symbol in zip(rows, symbols) if requested is None or symbol == requested]


def quote_metadata(symbol: str, raw: Any, assessed: datetime) -> tuple[dict[str, Any], list[str], bool]:
    if not isinstance(raw, dict):
        return {}, ["QUOTE_UNAVAILABLE"], False
    issues: list[str] = []
    if raw.get("symbol") != symbol:
        issues.append("QUOTE_SYMBOL_MISMATCH")
    if raw.get("source") != "finnhub" or raw.get("simulated") is not False:
        issues.append("SIMULATED_OR_UNKNOWN_SOURCE")
    if (raw.get("stale") is not None and raw.get("stale") is not False) or raw.get("status") in ("stale", "invalid", "conflicting", "missing", "simulated"):
        issues.append("SOURCE_QUALITY_BLOCKED")
    observed, retrieved = instant(raw.get("as_of")), instant(raw.get("retrieved_at"))
    if observed is None:
        issues.append("OBSERVATION_TIME_UNKNOWN")
    elif not 0 <= (assessed - observed).total_seconds() <= MAX_QUOTE_AGE_SECONDS:
        issues.append("OBSERVATION_OUTSIDE_AGE_POLICY")
    if retrieved is None:
        issues.append("RETRIEVAL_TIME_UNKNOWN")
    elif retrieved > assessed or (observed is not None and observed > retrieved):
        issues.append("INCONSISTENT_SOURCE_TIMES")
    fresh = not issues
    price = number(raw.get("price"))
    if price is None or price <= 0:
        issues.append("PRICE_UNAVAILABLE")
        price = None
    # USD is the sole supported mark unit. No case folding, minor-unit or FX guess.
    if raw.get("currency") != "USD":
        issues.append("QUOTE_CURRENCY_UNSUPPORTED_OR_UNKNOWN")
    if raw.get("adjusted_basis") != "raw":
        issues.append("ADJUSTMENT_BASIS_UNSUPPORTED_OR_UNKNOWN")
    if not isinstance(raw.get("is_market_session_open"), bool):
        issues.append("SESSION_UNKNOWN")
    if raw.get("status") is not None and raw["status"] not in ("valid", "delayed", "last_close", "stale", "invalid", "conflicting", "missing", "simulated"):
        issues.append("SOURCE_QUALITY_BLOCKED")
        fresh = False
    move = number(raw.get("change_pct"))
    # A second alias cannot silently contradict the typed Python field.
    if "changePct" in raw and number(raw["changePct"]) != move:
        move = None
    metadata = {
        "price": wire(price), "changePct": wire(move),
        "currency": raw.get("currency") if isinstance(raw.get("currency"), str) and re.fullmatch(r"[A-Za-z]{3}", raw["currency"]) else None,
        "observedAt": observed.isoformat().replace("+00:00", "Z") if observed else None,
        "retrievedAt": retrieved.isoformat().replace("+00:00", "Z") if retrieved else None,
        "source": "finnhub" if raw.get("source") == "finnhub" else "unknown",
        "simulated": raw.get("simulated") is not False,
        "adjustedBasis": "raw" if raw.get("adjusted_basis") == "raw" else "unknown",
        "isMarketSessionOpen": raw.get("is_market_session_open") if isinstance(raw.get("is_market_session_open"), bool) else None,
    }
    return metadata, list(dict.fromkeys(issues)), fresh


def portfolio_context(rows: list[dict[str, Any]], quotes: dict[str, Any], assessed_at: str,
                      errors: dict[str, str], usage: dict[str, Any], requested: str | None = None) -> dict[str, Any]:
    selected = select_holdings(rows, requested)
    assessed = instant(assessed_at)
    if assessed is None:
        raise MCPClientError("INVALID_TIME", "Portfolio assessment time is unavailable")
    holdings = []
    invested_values: list[Decimal] = []
    current_values: list[Decimal] = []
    observations: list[datetime] = []
    fresh_count = 0
    with localcontext(Context(prec=128)):
        for row in selected:
            symbol = row["symbol"].strip().upper()
            qty, avg = number(row.get("quantity"), stored=True), number(row.get("average_cost"), stored=True)
            quantity_ok = qty is not None and qty > 0
            average_ok = avg is not None and avg >= 0
            issues = []
            if not quantity_ok:
                issues.append("QUANTITY_INVALID")
            if not average_ok:
                issues.append("AVERAGE_COST_INVALID")
            # The current holdings schema has no cost-currency field. Never borrow
            # quote currency or silently assume USD; ledger reconciliation follows.
            cost_currency = row.get("cost_currency")
            if cost_currency != "USD":
                issues.append("COST_CURRENCY_UNSUPPORTED_OR_UNKNOWN")
            invested = qty * avg if quantity_ok and average_ok and cost_currency == "USD" else None
            metadata, quote_issues, fresh = quote_metadata(symbol, quotes.get(symbol), assessed)
            fresh_count += int(fresh)
            issues.extend(quote_issues)
            price = number(quotes.get(symbol, {}).get("price")) if isinstance(quotes.get(symbol), dict) else None
            current = qty * price if quantity_ok and not quote_issues and price is not None else None
            if current is not None:
                current_values.append(current)
                observations.append(instant(metadata["observedAt"]))
            if invested is not None:
                invested_values.append(invested)
            if metadata.get("changePct") is None:
                issues.append("DAILY_MOVE_UNAVAILABLE")
            holdings.append({
                "id": row.get("id"), "symbol": symbol, "quantity": wire(qty) if quantity_ok else None,
                "averageCost": wire(avg) if average_ok else None,
                "purchaseDate": row.get("purchase_date"), "notes": row.get("notes") or "",
                "costBasisCurrency": cost_currency if cost_currency == "USD" else None,
                "investedValue": wire(invested), "currentValue": wire(current),
                "dailyChangePct": metadata.get("changePct") if not quote_issues else None,
                "quote": metadata or None, "sourceFindings": list(dict.fromkeys(issues)),
                "valuationAvailable": current is not None,
            })
        count = len(selected)
        aligned = bool(observations) and (max(observations) - min(observations)).total_seconds() <= MAX_ALIGNMENT_SECONDS
        all_marks = count > 0 and len(current_values) == count and aligned
        all_costs = count > 0 and len(invested_values) == count
        current = sum(current_values, Decimal(0)) if all_marks else None
        invested = sum(invested_values, Decimal(0)) if all_costs else None
        # Average-cost inventory is unreconciled; never present a P&L/return as
        # verified accounting without the transaction/fee/corporate-action adapter.
        quality = {
            "holdingCount": count, "liveQuoteCount": fresh_count, "freshQuoteCount": fresh_count,
            "eligibleMarkCount": len(current_values), "costBasisCount": len(invested_values),
            "allQuotesFresh": count > 0 and fresh_count == count, "allMarksAvailable": all_marks,
            "allCostBasesAvailable": all_costs, "accountingReconciled": False,
            "status": "partial" if current_values or invested_values else "needs-data",
            "valuationCoverage": "complete" if all_marks else "partial" if current_values else "needs-data",
            "costBasisCoverage": "complete" if all_costs else "partial" if invested_values else "needs-data",
            "expectedSymbols": [row["symbol"] for row in holdings],
            "missingValuationSymbols": [row["symbol"] for row in holdings if not row["valuationAvailable"]],
            "missingCostBasisSymbols": [row["symbol"] for row in holdings if row["investedValue"] is None],
            "aggregateFindings": (["UNALIGNED_QUOTES"] if len(observations) > 1 and not aligned else []) + ["ACCOUNTING_UNRECONCILED"],
            "quoteErrors": errors, "quoteUsage": usage,
        }
        return {
            "contract_version": "portfolio-context-v2", "source": "supabase", "mode": "live", "persistent": True,
            "scope": "selected-stored-holding" if requested else "returned-stored-holdings", "requestedSymbol": requested,
            "assessed_at": assessed.isoformat().replace("+00:00", "Z"),
            "as_of": min(observations).isoformat().replace("+00:00", "Z") if all_marks else None,
            "holdings": holdings,
            "portfolio": {"currency": "USD" if current is not None or invested is not None else None,
                          "investedValue": wire(invested), "currentValue": wire(current),
                          "unrealizedPnl": None, "unrealizedPct": None,
                          "accountingBasis": "unreconciled-stored-average-cost"},
            "data_quality": quality,
            "policy": {"valuationCurrency": "USD", "maxQuoteAgeSeconds": MAX_QUOTE_AGE_SECONDS,
                       "maxAlignmentSeconds": MAX_ALIGNMENT_SECONDS, "maxHoldings": MAX_HOLDINGS},
            "verifies_provider_identity": False, "grants_decision_eligibility": False,
            "limitations": ["Metadata labels do not verify issuer identity, source truth or account entitlement.",
                            "Stored average cost is not transaction/fee/corporate-action reconciled; P&L and returns are withheld.",
                            "Quote age is a diagnostic policy, not an exchange calendar or verified latest close.",
                            "Coverage describes returned holdings in this scope, not an account-wide inventory audit."],
        }
