from __future__ import annotations

from mcp_servers.stocks.relationships import RelationshipService


def test_relationship_service_resolves_peer_links():
    svc = RelationshipService()
    out = svc.get("MU")
    assert out["symbol"] == "MU"
    assert out["peers"]
    assert "000660.KS" in out["peers"]
    assert "NVDA" in out["peers"]
    # SNDK links back to MU in the shared watchlist, so it should resolve
    # through the bidirectional peer-link set even though it is not a direct
    # MU peer entry.
    assert "SNDK" in out["related_by_peer_links"]


def test_relationship_service_unknown_symbol_raises():
    try:
        RelationshipService().get("ZZZZ")
    except ValueError as exc:
        assert "ZZZZ" in str(exc)
    else:
        raise AssertionError("expected unknown relationship symbol")
