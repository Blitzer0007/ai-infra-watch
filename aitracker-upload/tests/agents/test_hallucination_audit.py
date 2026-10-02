from types import SimpleNamespace

from app.agents.autonomous import _hallucination_audit


def test_hallucination_audit_flags_unsupported_claim():
    calls = [
        SimpleNamespace(
            ok=True,
            output={"title": "SEC filing", "description": "8-K Item 1.01 contract disclosure."},
        )
    ]
    report = _hallucination_audit(
        "The filing is an 8-K Item 1.01 contract disclosure. The contract value is $99 billion.",
        calls,
    )
    assert report["enabled"] is True
    assert report["claimCount"] == 2
    assert report["ungroundedClaims"] >= 1
    assert report["status"] == "REVIEW"


def test_hallucination_audit_clear_when_claim_matches_sources():
    calls = [
        SimpleNamespace(
            ok=True,
            output={"title": "SEC filing", "description": "8-K Item 1.01 contract disclosure."},
        )
    ]
    report = _hallucination_audit(
        "The filing is an 8-K Item 1.01 contract disclosure.",
        calls,
    )
    assert report["claimCount"] == 1
    assert report["ungroundedClaims"] == 0
    assert report["status"] == "CLEAR"



def test_finalization_uses_private_hallucination_audit_helper():
    """Regression guard for the production NameError seen on finalization."""
    import ast
    from pathlib import Path

    source = (Path(__file__).resolve().parents[2] / "app" / "agents" / "autonomous.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    bare_calls = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "hallucination_audit"
    ]
    assert bare_calls == []
