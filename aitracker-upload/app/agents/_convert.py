"""Shared quote->stock_data conversion.

The Market Agent's `build_data` node and `scripts/gen_fixtures.py` BOTH convert
a `QuoteBatch` into the `stock_data` dicts that feed `build_prompt`. This
module is the single implementation of that conversion so the two can never
drift: the fixture script imports it, guaranteeing the prompt hash it commits
is byte-identical to what the agent computes at runtime.

Only price facts that are stable across runs go into the rows — the
time-varying `as_of`/`source` fields are intentionally excluded, or the prompt
(and thus the fixture key) would change every run.
"""
from __future__ import annotations

from typing import Any

from mcp_servers.stocks.schemas import QuoteBatch


def quotes_to_stock_data(batch: QuoteBatch) -> list[dict[str, Any]]:
    """Convert a QuoteBatch into the per-stock dicts the synthesis prompt uses.

    Tolerates absent `name`/`news` fields (the fixture quotes carry neither);
    the insight reason falls back to a price-only statement.
    """
    rows: list[dict[str, Any]] = []
    for q in batch.quotes:
        name = (getattr(q, "name", None) or "").strip() or q.symbol
        news = getattr(q, "news", None) or []
        rows.append(
            {
                "symbol": q.symbol,
                "name": name,
                "price": q.price,
                "change_pct": q.change_pct,
                "news": list(news),
            }
        )
    return rows


def stock_data_facts(rows: list[dict[str, Any]]) -> list[str]:
    """Fact sentences derived from stock_data rows, for grounding a summary.

    The synthesis prompt declares every data field a fact ("all fields are
    facts"), so a summary claim about a move magnitude is grounded by the
    `change_pct` row, and per-row news is grounding too. This mirrors
    `app/eval/run_eval._data_facts` so the market agent's runtime grounding
    and the /api/eval grounding check judge against the SAME source set.
    """
    facts: list[str] = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        name = row.get("name") or row.get("symbol") or ""
        symbol = row.get("symbol") or ""
        change = row.get("change_pct")
        if change is not None:
            facts.append(f"{name} ({symbol}) moved {change}%.")
        for item in row.get("news", []) or []:
            if item:
                facts.append(str(item))
    return facts
