from pathlib import Path

import httpx
import pytest
import yaml

from safety import guard_request, is_loopback_url, qa_base_url, require_safe_target

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("url", ["http://127.0.0.1:3000", "http://localhost:3000", "http://[::1]:3000"])
def test_loopback_targets_work_without_live_approval(monkeypatch, url):
    monkeypatch.delenv("QA_ALLOW_LIVE", raising=False)
    assert require_safe_target(url) == url


@pytest.mark.parametrize("url", [
    "https://ai-infra-watch-theta.vercel.app", "https://qjgnryjtrdwrbmlgdquk.supabase.co",
    "https://localhost.example.org", "http://127.0.0.1.example.org", "http://192.168.1.1",
])
def test_external_targets_are_blocked_by_default(monkeypatch, url):
    monkeypatch.delenv("QA_ALLOW_LIVE", raising=False)
    assert not is_loopback_url(url)
    with pytest.raises(ValueError, match="QA_ALLOW_LIVE"):
        require_safe_target(url)


def test_live_approval_still_requires_an_explicit_target(monkeypatch):
    monkeypatch.setenv("QA_ALLOW_LIVE", "true")
    monkeypatch.delenv("QA_BASE_URL", raising=False)
    with pytest.raises(ValueError, match="QA_BASE_URL"):
        qa_base_url()
    monkeypatch.setenv("QA_BASE_URL", "https://qa.example.org")
    assert qa_base_url() == "https://qa.example.org"


def test_api_fixture_never_uses_a_production_default(monkeypatch):
    from test_api import client

    monkeypatch.delenv("QA_BASE_URL", raising=False)
    monkeypatch.setenv("QA_ALLOW_LIVE", "true")
    with pytest.raises(ValueError, match="QA_BASE_URL"):
        next(client.__wrapped__())


def test_db_fixture_ignores_production_credentials(monkeypatch):
    from test_db import db_client

    monkeypatch.delenv("QA_SUPABASE_URL", raising=False)
    monkeypatch.delenv("QA_SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://production.example.org")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-test-value")
    with pytest.raises(pytest.fail.Exception, match="production fallbacks are disabled"):
        next(db_client.__wrapped__())


def test_offline_browser_ignores_authentication_state(monkeypatch):
    from conftest import _headers, _storage_state_path

    monkeypatch.delenv("QA_ALLOW_LIVE", raising=False)
    # Invalid placeholders prove offline fixtures do not even decode these values.
    monkeypatch.setenv("QA_HEADERS_JSON", "invalid-placeholder")
    monkeypatch.setenv("QA_STORAGE_STATE_B64", "invalid-placeholder")
    assert _headers() == {}
    assert _storage_state_path() is None


def test_redirect_cannot_escape_to_production(monkeypatch):
    monkeypatch.delenv("QA_ALLOW_LIVE", raising=False)
    sent = []

    def handle(request):
        sent.append(str(request.url))
        return httpx.Response(302, headers={"location": "https://ai-infra-watch-theta.vercel.app/api/quote"})

    with httpx.Client(transport=httpx.MockTransport(handle), follow_redirects=True,
                      event_hooks={"request": [guard_request]}) as client:
        with pytest.raises(ValueError, match="QA_ALLOW_LIVE"):
            client.get("http://127.0.0.1:3000/redirect")
    assert sent == ["http://127.0.0.1:3000/redirect"]


def test_pr_and_scheduled_qa_cannot_run_live_jobs():
    text = (ROOT / ".github/workflows/qa-validation.yml").read_text()
    workflow = yaml.safe_load(text)
    # PyYAML's YAML 1.1 loader treats the GitHub Actions key `on` as True.
    triggers = workflow[True]
    assert triggers["workflow_dispatch"]["inputs"]["run_live_checks"]["default"] is False
    for name in ["api", "db", "ui", "jev-production-smoke"]:
        job = workflow["jobs"][name]
        assert job["if"] == "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.run_live_checks == true }}"
        assert job["env"]["QA_ALLOW_LIVE"] == "true"
    linked = workflow["jobs"]["supabase-linked-migration-dry-run"]
    assert linked["if"] == "${{ github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.run_linked_supabase_dry_run == true }}"
    db_env = workflow["jobs"]["db"]["steps"][-1]["env"]
    assert set(db_env) == {"QA_SUPABASE_URL", "QA_SUPABASE_SERVICE_ROLE_KEY"}


def test_sec_refresh_never_runs_on_push_or_pr():
    workflow = yaml.safe_load((ROOT / ".github/workflows/sec-filings-refresh.yml").read_text())
    assert set(workflow[True]) == {"schedule", "workflow_dispatch"}
    assert workflow["jobs"]["ingest"]["if"] == "github.ref == 'refs/heads/main'"


def test_mocked_ui_serves_static_app_without_backend_providers():
    workflow = yaml.safe_load((ROOT / ".github/workflows/qa-validation.yml").read_text())
    steps = workflow["jobs"]["ui-local"]["steps"]
    start = next(step for step in steps if step.get("name") == "Start local app")
    assert "npm exec vite -- --host 127.0.0.1 --port 3000" in start["run"]
    assert "secrets." not in str(workflow["jobs"]["ui-local"])


def test_workflow_yaml_is_valid():
    for path in (ROOT / ".github/workflows").glob("*.yml"):
        workflow = yaml.safe_load(path.read_text())
        assert "jobs" in workflow, path.name
