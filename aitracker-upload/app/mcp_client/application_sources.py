"""Application-state research adapters for Autonomous Research.

These read-only sources expose information that already exists elsewhere in
AI Infra Watch but is not naturally represented by the stocks / filings / news
MCP servers.  The in-process toolbox uses this module on Vercel so the agent
can query portfolio state, forecast tracking, AI-quality history, congress
trades, macro risk, and political-policy signals without making an internal
HTTP round-trip to another serverless function.

Fixture mode is deliberately hermetic for CI/local tests. Live mode reads
Supabase or public upstream feeds with bounded timeouts.
"""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from app.mcp_client.client import MCPClientError
from app.mcp_client.portfolio_valuation import (
    MAX_HOLDINGS, MAX_QUOTE_CALLS, QUOTE_TIME_BUDGET_SECONDS,
    number as portfolio_number, portfolio_context as build_portfolio_context, select_holdings,
)


DEFAULT_SUPABASE_URL = "https://qjgnryjtrdwrbmlgdquk.supabase.co"
GDELT_QUERY = (
    '(Donald Trump OR "JD Vance" OR "White House" OR "Trump administration") '
    '(AI OR "artificial intelligence" OR "AI infrastructure" OR "data center" '
    'OR power OR electricity OR semiconductor OR GPU OR chip OR export '
    'OR regulation OR innovation OR investment)'
)
COMMON_TICKER_ALIASES = {
    "NVIDIA": "NVDA",
    "MICROSOFT": "MSFT",
    "META": "META",
    "FACEBOOK": "META",
    "SERVICENOW": "NOW",
    "SALESFORCE": "CRM",
    "NEBIUS": "NBIS",
    "PALANTIR": "PLTR",
    "AMAZON": "AMZN",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "MICRON": "MU",
    "SANDISK": "SNDK",
    "AMD": "AMD",
    "PHARVARIS": "PHVS",
    "DIGI POWER X": "DGXX",
}


def _records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _number(value: Any, default: float | None = None) -> float | None:
    try:
        value = float(value)
        return value if value == value else default
    except (TypeError, ValueError):
        return default


class ApplicationResearchService:
    """Read-only cross-application research context."""

    def __init__(self, live: bool = False, stocks: Any | None = None, timeout: float = 7.0,
                 clock=None, monotonic=time.monotonic) -> None:
        self.live = bool(live)
        self.stocks = stocks
        self.timeout = timeout
        self._clock = clock or (lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
        self._monotonic = monotonic
        self.supabase_url = (
            os.getenv("SUPABASE_URL")
            or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
            or DEFAULT_SUPABASE_URL
        ).rstrip("/")
        self.supabase_key = str(os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        self._repo_root = Path(__file__).resolve().parents[3]

    def _get_json(self, url: str, params: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> Any:
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(url, params=params, headers=headers or {})
            if response.status_code >= 400:
                raise MCPClientError("UPSTREAM_HTTP", f"HTTP {response.status_code} from {url}")
            return response.json()
        except MCPClientError:
            raise
        except httpx.HTTPError as exc:
            raise MCPClientError("UPSTREAM_HTTP", f"request failed: {type(exc).__name__}: {exc}") from exc

    def _supabase_get(self, table: str, params: dict[str, Any], *, strict_records: bool = False) -> list[dict[str, Any]]:
        if not self.supabase_key:
            raise MCPClientError("CONFIG", "SUPABASE_SERVICE_ROLE_KEY is not configured")
        data = self._get_json(
            f"{self.supabase_url}/rest/v1/{table}",
            params=params,
            headers={
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}",
                "Accept": "application/json",
            },
        )
        if strict_records and (not isinstance(data, list) or any(not isinstance(row, dict) for row in data)):
            raise MCPClientError("INVALID_DATA", "Stored holdings response is malformed")
        return _records(data)

    def portfolio_context(self, symbol: str | None = None) -> dict[str, Any]:
        if symbol is not None and not isinstance(symbol, str):
            raise MCPClientError("INVALID_ARGUMENT", "Invalid portfolio symbol")
        requested = symbol.strip().upper() if symbol else ""
        if requested and not re.fullmatch(r"[A-Z0-9.^=-]{1,20}", requested):
            raise MCPClientError("INVALID_ARGUMENT", "Invalid portfolio symbol")
        if not self.live:
            path = self._repo_root / "data" / "portfolio_snapshot.json"
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            positions = [row for row in _records(snapshot.get("positions")) if (_number(row.get("quantity"), 0.0) or 0.0) > 0]
            if requested:
                positions = [row for row in positions if str(row.get("symbol", "")).upper() == requested]
            return {
                "source": "portfolio-snapshot-fixture",
                "mode": "fixture",
                "as_of": snapshot.get("asOf"),
                "portfolio": snapshot.get("portfolio") or {},
                "holdings": positions,
                "persistent": False,
            }

        params = {"select": "id,symbol,quantity,average_cost,purchase_date,notes", "order": "symbol.asc", "limit": str(MAX_HOLDINGS + 1)}
        try:
            rows = self._supabase_get("portfolio_holdings", params, strict_records=True)
        except Exception as error:
            code = error.code if isinstance(error, MCPClientError) and error.code in {"CONFIG", "INVALID_DATA"} else "UPSTREAM_HTTP"
            raise MCPClientError(code, "Stored holdings context is unavailable") from None
        rows = select_holdings(rows, requested or None)
        quotes: dict[str, Any] = {}
        errors: dict[str, str] = {}
        attempts = 0
        termination = "completed"
        started = self._monotonic()
        for row in rows:
            sym = row["symbol"].strip().upper()
            quantity = portfolio_number(row.get("quantity"), stored=True)
            if quantity is None or quantity <= 0:
                errors[sym] = "INVALID_QUANTITY"
                continue
            if self.stocks is None:
                errors[sym] = "QUOTE_NOT_CONFIGURED"
                continue
            if attempts >= MAX_QUOTE_CALLS:
                errors[sym] = "CALL_BUDGET"
                termination = "call-budget"
                continue
            if self._monotonic() - started >= QUOTE_TIME_BUDGET_SECONDS:
                errors[sym] = "TIME_BUDGET"
                termination = "time-budget"
                continue
            attempts += 1
            try:
                value = self.stocks.get_quote(sym)
                quote = value.model_dump() if hasattr(value, "model_dump") else value
                if self._monotonic() - started >= QUOTE_TIME_BUDGET_SECONDS:
                    errors[sym] = "TIME_BUDGET"
                    termination = "time-budget"
                elif isinstance(quote, dict):
                    quotes[sym] = quote
                else:
                    errors[sym] = "INVALID_QUOTE"
            except Exception:
                errors[sym] = "PROVIDER_FAILED"
                if self._monotonic() - started >= QUOTE_TIME_BUDGET_SECONDS:
                    termination = "time-budget"
        usage = {"quoteCalls": attempts, "maxQuoteCalls": MAX_QUOTE_CALLS, "providerRequestCount": None,
                 "timeBudgetMs": int(QUOTE_TIME_BUDGET_SECONDS * 1000), "terminationReason": termination,
                 "loadedSymbols": list(quotes), "unavailableSymbols": list(errors)}
        return build_portfolio_context(rows, quotes, self._clock(), errors, usage, requested or None)

    @staticmethod
    def _normalize_forecast(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row.get("id"),
            "ticker": str(row.get("ticker") or "").upper(),
            "createdAt": row.get("created_at"),
            "targetDate": row.get("target_date"),
            "horizon": int(row.get("horizon")) if str(row.get("horizon", "")).strip() else None,
            "scenarioId": row.get("scenario_id"),
            "entryPrice": _number(row.get("entry_price")),
            "median": _number(row.get("median")),
            "p25": _number(row.get("p25")),
            "p75": _number(row.get("p75")),
            "p10": _number(row.get("p10")),
            "p90": _number(row.get("p90")),
            "modelVersion": row.get("model_version") or "analogue-v1",
            "status": row.get("status"),
            "verifiedAt": row.get("verified_at"),
            "actualDate": row.get("actual_date"),
            "actualPrice": _number(row.get("actual_price")),
            "actualReturn": _number(row.get("actual_return")),
            "medianError": _number(row.get("median_error")),
        }

    def forecast_context(
        self,
        ticker: str | None = None,
        horizon: int | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        ticker_value = str(ticker or "").strip().upper()
        horizon_value = int(horizon) if horizon is not None else None
        limit = min(max(int(limit or 50), 1), 100)

        if not self.live:
            return {
                "source": "forecast-fixture",
                "mode": "fixture",
                "forecasts": [],
                "modelConfigs": [],
                "analytics": {"verifiedCount": 0, "note": "No forecast snapshots are committed to the fixture dataset."},
            }

        params: dict[str, Any] = {
            "select": "*",
            "order": "created_at.desc",
            "limit": str(limit),
        }
        if ticker_value:
            params["ticker"] = f"eq.{ticker_value}"
        if horizon_value is not None:
            params["horizon"] = f"eq.{horizon_value}"

        rows = self._supabase_get("forecast_snapshots", params)
        forecasts = [self._normalize_forecast(row) for row in rows]

        model_params: dict[str, Any] = {
            "select": "*",
            "order": "updated_at.desc",
            "limit": "100",
        }
        if ticker_value:
            model_params["ticker"] = f"eq.{ticker_value}"
        if horizon_value is not None:
            model_params["horizon"] = f"eq.{horizon_value}"
        model_rows = self._supabase_get("forecast_model_config", model_params)

        verified = [
            row for row in forecasts
            if row.get("status") == "verified"
            and _number(row.get("actualReturn")) is not None
            and _number(row.get("median")) is not None
        ]
        errors = [abs(float(row["medianError"])) for row in verified if row.get("medianError") is not None]
        directional_rows = [
            row for row in verified
            if float(row["actualReturn"]) != 0 and float(row["median"]) != 0
        ]
        directional_accuracy = (
            sum(1 for row in directional_rows if (float(row["actualReturn"]) > 0) == (float(row["median"]) > 0))
            / len(directional_rows) * 100
            if directional_rows else None
        )
        analytics = {
            "snapshotCount": len(forecasts),
            "verifiedCount": len(verified),
            "pendingCount": sum(1 for row in forecasts if row.get("status") == "pending"),
            "medianAbsoluteError": round(sorted(errors)[len(errors) // 2], 4) if errors else None,
            "directionalAccuracyPct": round(directional_accuracy, 2) if directional_accuracy is not None else None,
        }
        return {
            "source": "supabase",
            "mode": "live",
            "forecasts": forecasts,
            "modelConfigs": model_rows,
            "analytics": analytics,
        }

    def quality_runs(self, limit: int = 20) -> dict[str, Any]:
        limit = min(max(int(limit or 20), 1), 100)
        if not self.live:
            return {
                "source": "ai-quality-fixture",
                "mode": "fixture",
                "runs": [],
                "analytics": {"runCount": 0, "note": "No persisted AI-quality runs are committed to the fixture dataset."},
            }

        rows = self._supabase_get(
            "ai_quality_runs",
            {"select": "*", "order": "created_at.desc", "limit": str(limit)},
        )
        runs = []
        for row in rows:
            runs.append({
                "id": row.get("id"),
                "createdAt": row.get("created_at"),
                "suite": row.get("suite"),
                "target": row.get("target"),
                "status": row.get("status"),
                "qualityScore": _number(row.get("quality_score")),
                "faithfulness": _number(row.get("faithfulness")),
                "relevance": _number(row.get("relevance")),
                "safety": _number(row.get("safety")),
                "hallucinationRate": _number(row.get("hallucination_rate")),
                "citationCoverage": _number(row.get("citation_coverage")),
                "adversarialFailureRate": _number(row.get("adversarial_failure_rate")),
                "caseCount": int(row.get("case_count") or 0),
                "failures": int(row.get("failures") or 0),
                "summary": row.get("summary") or "",
                "metrics": row.get("metrics") or {},
            })
        scores = [row["qualityScore"] for row in runs if row["qualityScore"] is not None]
        return {
            "source": "supabase",
            "mode": "live",
            "runs": runs,
            "analytics": {
                "runCount": len(runs),
                "averageQualityScore": round(sum(scores) / len(scores), 2) if scores else None,
                "latestQualityScore": scores[0] if scores else None,
                "latestHallucinationRate": runs[0]["hallucinationRate"] if runs else None,
            },
        }

    def congress_trades(self, symbol: str | None = None, query: str | None = None, limit: int = 100) -> dict[str, Any]:
        symbol_value = str(symbol or "").strip().upper() or "ALL"
        query_value = str(query or "").strip()
        limit = min(max(int(limit or 100), 1), 500)

        if not self.live:
            return {
                "source": "congress-fixture",
                "mode": "fixture",
                "symbol": symbol_value,
                "query": query_value or None,
                "trades": [],
                "stale": False,
            }

        if query_value and symbol_value == "ALL":
            alias = COMMON_TICKER_ALIASES.get(re.sub(r"[^A-Z0-9. -]+", "", query_value.upper()))
            if alias:
                symbol_value = alias

        if symbol_value != "ALL":
            payload = self._get_json(
                f"https://www.bargo.ai/free-apis/congress/v1/trades/{symbol_value}",
                params={"limit": str(limit)},
                headers={"Accept": "application/json", "User-Agent": "AI Infra Watch/1.0"},
            )
            trades = _records(payload.get("trades") if isinstance(payload, dict) else [])
            return {
                "source": "bargo-congress-trades",
                "mode": "live",
                "symbol": symbol_value,
                "query": query_value or None,
                "trades": trades[:limit],
                "stale": False,
                "sourceUrl": "https://www.bargo.ai/free-apis/congress",
            }

        # OpenRegs is useful for person-name searches and is also a fallback
        # when the query is not a known ticker/company alias.
        safe = query_value.replace("'", "''").upper()
        where = "ticker IS NOT NULL"
        if safe:
            where = (
                "(UPPER(member_name) LIKE UPPER('%" + safe + "%') OR "
                "UPPER(ticker) = UPPER('" + safe + "'))"
            )
        sql = (
            "SELECT member_name, transaction_date, ticker, transaction_type, amount_range, "
            "owner, chamber, source_url FROM stock_trades WHERE " + where +
            " ORDER BY transaction_date DESC LIMIT " + str(limit)
        )
        data_url = "https://regs.datadawn.org/openregs.json?" + urlencode({
            "sql": sql,
            "_shape": "objects",
        })
        rows = self._get_json(data_url, headers={"Accept": "application/json", "User-Agent": "AI Infra Watch/1.0"})
        return {
            "source": "openregs-datadawn",
            "mode": "live",
            "symbol": symbol_value,
            "query": query_value or None,
            "trades": _records(rows)[:limit],
            "stale": False,
            "sourceUrl": "https://regs.datadawn.org/explore/api.html",
        }

    def macro_signals(self) -> dict[str, Any]:
        today = time.strftime("%Y-%m-%d", time.gmtime())
        return {
            "source": "AI Infra Watch deterministic macro risk map",
            "mode": "live" if self.live else "fixture",
            "asOf": today,
            "signals": [
                {
                    "id": "taiwan",
                    "category": "Supply Chain",
                    "title": "Taiwan advanced-node exposure",
                    "impactRating": "high",
                    "description": "Monitor events that could affect advanced-node manufacturing, packaging and accelerator supply.",
                    "relatedSymbols": ["NVDA", "AMD", "TSM", "DRAM", "SNDK"],
                },
                {
                    "id": "controls",
                    "category": "Trade Policy",
                    "title": "AI-chip export controls",
                    "impactRating": "high",
                    "description": "Monitor restrictions affecting high-end accelerator shipments and China demand.",
                    "relatedSymbols": ["NVDA", "AMD", "SOXL"],
                },
                {
                    "id": "power",
                    "category": "Infrastructure",
                    "title": "Data-center power availability",
                    "impactRating": "medium",
                    "description": "Track grid interconnection, power procurement and AI capacity announcements.",
                    "relatedSymbols": ["DGXX", "NBIS", "IREN", "VIVO", "MSFT", "META"],
                },
            ],
        }

    def political_signals(self, topic: str | None = None, days: int = 3) -> dict[str, Any]:
        days = min(max(int(days or 3), 1), 7)
        topic_value = str(topic or "").strip()
        if not self.live:
            return {
                "source": "political-policy-fixture",
                "mode": "fixture",
                "topic": topic_value or None,
                "days": days,
                "signals": [],
            }

        query = GDELT_QUERY
        if topic_value:
            safe_topic = topic_value.replace('"', " ")
            query += " (" + safe_topic + ")"
        timespan = f"{days * 24}h"
        payload = self._get_json(
            "https://api.gdeltproject.org/api/v2/doc/doc",
            params={
                "query": query,
                "mode": "ArtList",
                "format": "json",
                "maxrecords": "20",
                "timespan": timespan,
                "sort": "datedesc",
            },
            headers={"User-Agent": "ai-infra-watch/1.0"},
        )
        signals = []
        for article in _records(payload.get("articles") if isinstance(payload, dict) else []):
            title = str(article.get("title") or "").strip()
            url = str(article.get("url") or "").strip()
            domain = str(article.get("domain") or article.get("source") or "GDELT")
            if not title:
                continue
            primary = domain.lower().endswith("whitehouse.gov")
            signals.append({
                "title": title,
                "source": domain,
                "date": article.get("seendate"),
                "url": url or None,
                "sourceType": "primary" if primary else "secondary",
                "note": "Primary White House domain result." if primary else "Media/secondary coverage; verify the underlying official statement before relying on wording.",
            })
        return {
            "source": "GDELT political-policy feed",
            "mode": "live",
            "topic": topic_value or None,
            "days": days,
            "signals": signals[:20],
        }

    def health(self) -> dict[str, Any]:
        return {
            "source": "application-research",
            "mode": "live" if self.live else "fixture",
            "supabaseConfigured": bool(self.supabase_key) if self.live else True,
            "capabilities": [
                "portfolio",
                "forecast",
                "quality",
                "congress",
                "macro",
                "political",
            ],
        }


__all__ = ["ApplicationResearchService"]
