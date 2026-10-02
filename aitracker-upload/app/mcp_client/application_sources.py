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
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import httpx

from app.mcp_client.client import MCPClientError


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

    def __init__(self, live: bool = False, stocks: Any | None = None, timeout: float = 7.0) -> None:
        self.live = bool(live)
        self.stocks = stocks
        self.timeout = timeout
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

    def _supabase_get(self, table: str, params: dict[str, Any]) -> list[dict[str, Any]]:
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
        return _records(data)

    def portfolio_context(self, symbol: str | None = None) -> dict[str, Any]:
        requested = str(symbol or "").strip().upper()
        if not self.live:
            path = self._repo_root / "data" / "portfolio_snapshot.json"
            snapshot = json.loads(path.read_text(encoding="utf-8"))
            positions = _records(snapshot.get("positions"))
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

        rows = self._supabase_get(
            "portfolio_holdings",
            {"select": "*", "order": "symbol.asc"},
        )
        if requested:
            rows = [row for row in rows if str(row.get("symbol", "")).upper() == requested]

        holdings = []
        invested_total = 0.0
        current_total = 0.0
        live_quote_count = 0
        for row in rows:
            sym = str(row.get("symbol") or "").strip().upper()
            qty = _number(row.get("quantity"), 0.0) or 0.0
            avg = _number(row.get("average_cost"), 0.0) or 0.0
            invested = qty * avg
            invested_total += invested
            current_value: float | None = None
            daily_change_pct: float | None = None
            if self.stocks is not None and sym:
                try:
                    quote = self.stocks.get_quote(sym).model_dump()
                    price = _number(quote.get("price"))
                    if price is not None and price > 0:
                        current_value = qty * price
                        current_total += current_value
                        live_quote_count += 1
                    daily_change_pct = _number(quote.get("change_pct") or quote.get("changePct"))
                except Exception:
                    current_value = None
            holdings.append({
                "id": row.get("id"),
                "symbol": sym,
                "quantity": qty,
                "averageCost": avg,
                "purchaseDate": row.get("purchase_date"),
                "notes": row.get("notes") or "",
                "investedValue": round(invested, 4),
                "currentValue": None if current_value is None else round(current_value, 4),
                "dailyChangePct": daily_change_pct,
            })

        current_available = live_quote_count == len(holdings) if holdings else False
        unrealized = (current_total - invested_total) if current_available else None
        return {
            "source": "supabase",
            "mode": "live",
            "persistent": True,
            "holdings": holdings,
            "portfolio": {
                "investedValue": round(invested_total, 4),
                "currentValue": round(current_total, 4) if current_available else None,
                "unrealizedPnl": round(unrealized, 4) if unrealized is not None else None,
                "unrealizedPct": round(unrealized / invested_total * 100, 3) if unrealized is not None and invested_total else None,
            },
            "data_quality": {
                "holdingCount": len(holdings),
                "liveQuoteCount": live_quote_count,
                "allQuotesFresh": current_available,
            },
        }

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
