from types import SimpleNamespace

from app.jev.evidence import detect_conflicts, evidence_health


def _call(tool, output):
    return SimpleNamespace(tool=tool, ok=True, output=output)


def test_detects_material_contract_status_conflict():
    calls = [
        _call("filings.get_catalysts", {"text": "NVDA entered into a contract and agreement is active"}),
        _call("news.search", {"title": "NVDA contract delayed"}),
    ]
    conflicts = detect_conflicts(calls)
    assert conflicts
    assert conflicts[0]["status"] == "CONFLICT"
    assert conflicts[0]["severity"] == "material"


def test_marks_old_news_stale():
    calls = [
        _call("news.search", {"publishedAt": "2020-01-01T00:00:00Z", "title": "old news"}),
    ]
    health = evidence_health(calls)
    assert health["staleCount"] == 1
    assert health["freshness"][0]["stale"] is True
