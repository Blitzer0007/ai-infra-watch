from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_live_production_ui_suite_requires_manual_dispatch():
    workflow = (ROOT / ".github" / "workflows" / "qa-validation.yml").read_text()
    ui_job = workflow.split("  ui:\n", 1)[1].split("\n\n  telegram-outbox-migration-test:", 1)[0]
    assert "github.event_name == 'workflow_dispatch'" in ui_job
    assert "github.event_name != 'pull_request'" not in ui_job
