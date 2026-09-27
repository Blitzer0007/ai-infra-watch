"""Relationship graph data for the configurable AI Infra Watch universe."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

WATCHLIST_PATH = Path(__file__).resolve().parents[3] / "data" / "stock_watchlist.json"
PORTFOLIO_PATH = Path(__file__).resolve().parents[3] / "data" / "portfolio_snapshot.json"


class RelationshipService:
    """Resolve peer/theme/geography relationships from the shared watchlist."""

    def __init__(self, path: Path | str | None = None, portfolio_path: Path | str | None = None) -> None:
        self.path = Path(path) if path is not None else WATCHLIST_PATH
        self.portfolio_path = Path(portfolio_path) if portfolio_path is not None else PORTFOLIO_PATH

    def _entries(self) -> list[dict[str, Any]]:
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        entries = list(raw.get("watchlist", [])) if isinstance(raw, dict) else []

        # Portfolio names are part of the relationship universe even when the
        # symbol is not in the secondary watchlist (e.g. NVDA / AVGO).
        try:
            portfolio_raw = json.loads(self.portfolio_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            portfolio_raw = {}
        for row in portfolio_raw.get("positions", []) if isinstance(portfolio_raw, dict) else []:
            if not isinstance(row, dict) or not row.get("symbol"):
                continue
            entries.append({
                "symbol": row.get("symbol"),
                "name": row.get("name", row.get("symbol")),
                "group": row.get("group", ""),
                "theme": row.get("theme", ""),
                "peers": row.get("peers", []),
                "geo": row.get("geo", ""),
            })

        deduped: dict[str, dict[str, Any]] = {}
        for row in entries:
            symbol = str(row.get("symbol", "")).strip().upper()
            if symbol:
                deduped.setdefault(symbol, row)
                # Preserve richer watchlist metadata while filling any missing
                # fields from the portfolio snapshot.
                deduped[symbol] = {**row, **{k: v for k, v in deduped[symbol].items() if v not in (None, "", [])}}
        return list(deduped.values())

    def get(self, symbol: str) -> dict[str, Any]:
        sym = symbol.strip().upper()
        entries = self._entries()
        row = next((x for x in entries if str(x.get("symbol", "")).upper() == sym), None)
        if row is None:
            raise ValueError(f"unknown relationship symbol: {sym}")
        reverse = [
            str(x.get("symbol", "")).upper()
            for x in entries
            if sym in {str(p).upper() for p in (x.get("peers") or [])}
        ]
        peers = [str(x).upper() for x in (row.get("peers") or [])]
        return {
            "symbol": sym,
            "name": row.get("name", sym),
            "group": row.get("group", ""),
            "theme": row.get("theme", ""),
            "geo": row.get("geo", ""),
            "peers": peers,
            "related_by_peer_links": sorted(set(peers + reverse)),
        }

    def get_many(self) -> list[dict[str, Any]]:
        return [self.get(str(x.get("symbol", ""))) for x in self._entries() if x.get("symbol")]


def from_env() -> RelationshipService:
    return RelationshipService()
