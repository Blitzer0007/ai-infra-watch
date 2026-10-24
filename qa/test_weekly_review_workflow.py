from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_weekly_review_uses_configured_aiw_cron_secret():
    workflow = (ROOT / ".github" / "workflows" / "jev-lab-weekly-review.yml").read_text()
    assert "CRON_SECRET: ${{ secrets.AIW_CRON_SECRET }}" in workflow
    assert "CRON_SECRET: ${{ secrets.CRON_SECRET }}" not in workflow


def test_weekly_review_workflow_changes_trigger_pull_request_validation():
    workflow = (ROOT / ".github" / "workflows" / "qa-validation.yml").read_text()
    pull_request_paths = workflow.split("  pull_request:", 1)[1].split("  schedule:", 1)[0]
    assert '".github/workflows/jev-lab-weekly-review.yml"' in pull_request_paths
