from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_jev_smoke_is_separate_from_manual_live_ui_suite():
    workflow = (ROOT / ".github" / "workflows" / "qa-validation.yml").read_text()
    assert "name: Authenticated production JEV smoke (read-only)" in workflow
    assert "run -u -m pytest -vv -s -o faulthandler_timeout=120 qa/test_jev_production.py" in workflow

    live_ui = workflow.split("  ui:\n", 1)[1].split("\n\n  jev-production-smoke:", 1)[0]
    assert "github.event_name == 'workflow_dispatch'" in live_ui
    assert "qa/test_ui.py qa/test_ui_exploratory.py" in live_ui


def test_jev_smoke_workflow_uses_configured_auth_without_exposing_it():
    workflow = (ROOT / ".github" / "workflows" / "qa-validation.yml").read_text()
    smoke_job = workflow.split("  jev-production-smoke:\n", 1)[1].split("\n\n  telegram-outbox-migration-test:", 1)[0]
    assert "QA_HEADERS_JSON: ${{ secrets.QA_HEADERS_JSON }}" in smoke_job
    assert "qa/test_jev_production.py" in smoke_job
    assert "echo ${{ secrets.QA_HEADERS_JSON }}" not in smoke_job
