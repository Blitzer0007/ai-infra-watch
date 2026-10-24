from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_production_deploy_requires_explicit_opt_in():
    workflow = (ROOT / ".github" / "workflows" / "vercel-production-deploy.yml").read_text()
    assert "workflow_run:" not in workflow
    assert "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'" in workflow
    assert "contains(github.event.head_commit.message, '[deploy]')" in workflow
    assert "vercel deploy --prebuilt --archive=tgz --prod" in workflow


def test_deployment_workflow_changes_trigger_pull_request_validation():
    workflow = (ROOT / ".github" / "workflows" / "qa-validation.yml").read_text()
    pull_request_paths = workflow.split("  pull_request:", 1)[1].split("  schedule:", 1)[0]
    assert '".github/workflows/vercel-production-deploy.yml"' in pull_request_paths


def test_live_production_ui_suite_requires_manual_dispatch():
    workflow = (ROOT / ".github" / "workflows" / "qa-validation.yml").read_text()
    ui_job = workflow.split("  ui:\n", 1)[1].split("\n\n  telegram-outbox-migration-test:", 1)[0]
    assert "github.event_name == 'workflow_dispatch'" in ui_job
    assert "github.event_name != 'pull_request'" not in ui_job
