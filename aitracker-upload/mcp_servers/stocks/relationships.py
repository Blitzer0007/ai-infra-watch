"""Relationship graph data for the configurable AI Infra Watch universe."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

WATCHLIST_PATH = Path(__file__).resolve().parents[3] / "data" / "stock_watchlist.json"


class RelationshipService:
    """Resolve peer/theme/geography relationships from the shared watchlist."""

    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path is not None else WATCHLIST_PATH

    def _entries(self) -> list[dict[str, Any]]:
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        return list(raw.get("watchlist", [])) if isinstance(raw, dict) else []

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
