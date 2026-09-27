from __future__ import annotations

import json

from mcp_servers.stocks.relationships import RelationshipService


def test_relationship_service_resolves_peer_links():
    svc = RelationshipService()
    out = svc.get("NVDA")
    assert out["symbol"] == "NVDA"
    assert out["peers"]
    assert "AMD" in out["peers"] or "AMD" in out["related_by_peer_links"]


def test_relationship_service_unknown_symbol_raises():
    try:
        RelationshipService().get("ZZZZ")
    except ValueError as exc:
        assert "ZZZZ" in str(exc)
    else:
        raise AssertionError("expected unknown relationship symbol")
