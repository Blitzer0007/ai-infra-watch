from pathlib import Path
import yaml


ROOT = Path(__file__).resolve().parents[1]


def test_pr189_is_manual_default_denied_and_cannot_repurpose_the_old_handoff():
    workflow = yaml.safe_load((ROOT / '.github/workflows/vercel-production-deploy.yml').read_text())
    inputs = workflow[True]['workflow_dispatch']['inputs']
    assert set(workflow[True]) == {'workflow_dispatch'}
    for name in ('confirm_production_deploy', 'confirm_pr189_unprotected_main_exception'):
        assert inputs[name]['default'] == 'NO'
        assert inputs[name]['options'] == ['NO', 'YES']
    assert inputs['reviewed_pr189_head_sha']['default'] == ''
    assert inputs['run_live_checks']['default'] is False
    job = workflow['jobs']['deploy']
    assert job['env']['AIW_PR189_PROTECTION_WAIVER'] == '${{ inputs.confirm_pr189_unprotected_main_exception }}'
    assert job['env']['AIW_REVIEWED_PR_HEAD_SHA'] == '${{ inputs.reviewed_pr189_head_sha }}'
    assert job['env']['AIW_CONFIRM_PRODUCTION_DEPLOY'] == '${{ inputs.confirm_production_deploy }}'
    assert job['env']['AIW_RUN_LIVE_CHECKS'] == '${{ inputs.run_live_checks }}'
    assert job['env']['AIW_RELEASE_PR'] == '188'  # historical path is separate
    build = next(step for step in job['steps'] if step['name'] == 'Build Vercel deployment')
    assert build['env']['VITE_QA_MODE'] == ''
    assert build['env']['VITE_RESEARCH_ROLE_DEV_ENABLED'] == ''
    dispatcher = (ROOT / 'scripts/dispatch-milestone5-release.mjs').read_text()
    assert 'export const M5_HANDOFF_PR = 188;' in dispatcher
    assert 'confirm_pr189_unprotected_main_exception' not in dispatcher


def test_production_deploy_requires_explicit_opt_in():
    workflow = (ROOT / ".github" / "workflows" / "vercel-production-deploy.yml").read_text()
    assert "workflow_run:" not in workflow
    assert "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'" in workflow
    assert "inputs.confirm_production_deploy == 'YES'" in workflow
    assert "  push:" not in workflow
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


def test_release_stages_and_checks_same_build_before_promotion():
    workflow = yaml.safe_load((ROOT / '.github/workflows/vercel-production-deploy.yml').read_text())
    job = workflow['jobs']['deploy']
    assert job['environment'] == 'production'
    assert workflow['permissions'] == {'contents': 'read', 'actions': 'read'}
    assert workflow['concurrency']['cancel-in-progress'] is False
    steps = job['steps']
    names = [step['name'] for step in steps]
    assert names.index('Verify reviewed candidate and exact-main CI') < names.index('Verify Vercel token is configured')
    assert names.index('Verify project and known-good rollback deployment') < names.index('Pull Vercel production configuration')
    assert names.index('Check staged homepage and access gates') < names.index('Promote the tested production build')
    assert names.index('Recheck candidate before promotion') < names.index('Promote the tested production build')
    stage = next(step for step in steps if step.get('id') == 'stage')
    assert '--prod --skip-domain' in stage['run']
    assert 'node scripts/release-candidate.mjs staged' in stage['run']
    assert '--meta "aiwReleaseCommit=$EXPECTED_MAIN_SHA"' in stage['run']
    check = next(step for step in steps if step['name'] == 'Check staged homepage and access gates')
    promote = next(step for step in steps if step['name'] == 'Promote the tested production build')
    assert check['env']['BASE_URL'] == promote['env']['DEPLOYMENT_URL'] == '${{ steps.stage.outputs.url }}'
    assert 'company-scale' not in check['run']
    assert 'decision-center' not in check['run']


def test_provider_calling_checks_require_separate_opt_in_and_actions_are_pinned():
    workflow = yaml.safe_load((ROOT / '.github/workflows/vercel-production-deploy.yml').read_text())
    inputs = workflow[True]['workflow_dispatch']['inputs']  # PyYAML's YAML 1.1 'on'.
    assert inputs['run_live_checks']['default'] is False
    assert inputs['expected_main_sha']['required'] is True
    assert inputs['rollback_deployment']['required'] is True
    steps = workflow['jobs']['deploy']['steps']
    for step in steps:
        command = step.get('run', '')
        if 'company-scale?' in command or 'refresh=true' in command or '/api/job-health' in command:
            assert step['if'] == 'inputs.run_live_checks == true'
        if 'uses' in step:
            pin = step['uses'].split('@')[1]
            assert len(pin) == 40 and all(c in '0123456789abcdef' for c in pin)
        assert 'vercel@latest' not in command
    checkout = steps[0]
    assert checkout['with']['ref'] == '${{ github.sha }}'
    assert checkout['with']['persist-credentials'] is False


def test_release_guard_changes_run_both_required_workflows():
    for name in ('frontend-ci.yml', 'qa-validation.yml'):
        workflow = yaml.safe_load((ROOT / '.github/workflows' / name).read_text())
        triggers = workflow[True]
        assert 'workflow_dispatch' in triggers
        for event in ('push', 'pull_request'):
            assert 'scripts/release-candidate.mjs' in triggers[event]['paths']


def test_milestone5_protection_exception_is_explicit_and_default_denied():
    workflow = yaml.safe_load((ROOT / '.github/workflows/vercel-production-deploy.yml').read_text())
    inputs = workflow[True]['workflow_dispatch']['inputs']
    waiver = inputs['confirm_milestone5_unprotected_main_exception']
    assert waiver['required'] is True
    assert waiver['default'] == 'NO'
    assert waiver['options'] == ['NO', 'YES']
    deploy = workflow['jobs']['deploy']
    assert deploy['environment'] == 'production'
    assert deploy['env']['AIW_MAIN_PROTECTION_WAIVER'] == (
        '${{ inputs.confirm_milestone5_unprotected_main_exception }}'
    )
    checks = [step for step in deploy['steps']
              if 'node scripts/release-candidate.mjs candidate' in step.get('run','')]
    assert len(checks) == 3
    assert all(deploy['steps'].index(step) < next(
        i for i, entry in enumerate(deploy['steps'])
        if entry['name'] == 'Promote the tested production build'
    ) for step in checks)


def test_protected_staged_vercel_smoke_preserves_app_auth_checks():
    workflow = yaml.safe_load((ROOT / '.github/workflows/vercel-production-deploy.yml').read_text())
    steps = workflow['jobs']['deploy']['steps']
    staged = next(step for step in steps if step['name'] == 'Check staged homepage and access gates')
    assert staged['env']['BASE_URL'] == '${{ steps.stage.outputs.url }}'
    assert staged['env']['VERCEL_TOKEN'] == '${{ secrets.VERCEL_TOKEN }}'
    commands = staged['run']
    # Authenticate only at the Vercel protection layer, never disable SSO or
    # substitute a successful platform response for app-owned HTTP 401 gates.
    # Three original homepage/auth/portfolio checks plus the fixed asset loop.
    assert commands.count('$(vercel curl "$BASE_URL/') == 4
    assert commands.count(' -- --silent --show-error --max-time=20 ') == 4
    assert 'vercel curl --silent --show-error --max-time 20' not in commands
    assert 'vercel curl "$BASE_URL/" --' in commands
    assert 'vercel curl "$BASE_URL/api/auth" --' in commands
    assert 'vercel curl "$BASE_URL/api/portfolio" --' in commands
    assert '--data' in commands
    assert 'vercel protection' not in commands.lower()
    assert 'vercel promote' not in commands
    assert 'test "$auth_status"' not in commands  # Existing explicit branch/exit gates below.
    assert 'if [ "$auth_status" != "401" ]' in commands
    assert 'if [ "$portfolio_status" != "401" ]' in commands
    assert 'cmp --silent .vercel/output/static/index.html /tmp/staged-home.html' in commands


def test_one_time_milestone5_handoff_waits_for_main_ci_and_preserves_manual_release():
    handoff = yaml.safe_load(
        (ROOT / ".github/workflows/milestone5-one-time-release-handoff.yml").read_text()
    )
    assert handoff[True]["workflow_run"] == {
        "workflows": ["UI API DB Validation"], "types": ["completed"]
    }
    assert handoff["permissions"] == {"contents": "read", "actions": "write"}
    assert handoff["concurrency"]["cancel-in-progress"] is False
    job = handoff["jobs"]["handoff"]
    assert "workflow_run.conclusion == 'success'" in job["if"]
    assert "workflow_run.event == 'push'" in job["if"]
    assert "workflow_run.head_branch == 'main'" in job["if"]
    assert "head_repository.full_name == 'Blitzer0007/ai-infra-watch'" in job["if"]
    assert job["steps"][0]["with"]["persist-credentials"] is False
    assert job["steps"][0]["with"]["ref"] == "${{ github.sha }}"
    assert job["steps"][-1]["env"]["GH_TOKEN"] == "${{ github.token }}"
    assert job["steps"][-1]["run"] == "node scripts/dispatch-milestone5-release.mjs"
    assert "VERCEL_TOKEN" not in repr(handoff)
    assert "secrets." not in repr(handoff)
    release = yaml.safe_load(
        (ROOT / ".github/workflows/vercel-production-deploy.yml").read_text()
    )
    assert list(release[True]) == ["workflow_dispatch"]
    assert release["jobs"]["deploy"]["environment"] == "production"
    assert release[True]["workflow_dispatch"]["inputs"]["run_live_checks"]["default"] is False


def test_nov22_release_keeps_pr_identity_and_checks_both_ui_assets_before_and_after_promotion():
    workflow = yaml.safe_load((ROOT / '.github/workflows/vercel-production-deploy.yml').read_text())
    job = workflow['jobs']['deploy']
    assert job['env']['AIW_RELEASE_PR'] == '188'
    assert 'PR #188' in workflow[True]['workflow_dispatch']['inputs']['confirm_milestone5_unprotected_main_exception']['description']
    steps = job['steps']
    staged = next(step for step in steps if step['name'] == 'Check staged homepage and access gates')
    public = next(step for step in steps if step['name'] == 'Verify production homepage')
    for step, prefix in [(staged, 'staged'), (public, 'production')]:
        assert 'for asset in assets/main.js assets/styles.css' in step['run']
        assert 'test "$asset_status" = "200"' in step['run']
        assert f'cmp --silent ".vercel/output/static/$asset" "/tmp/{prefix}-${{asset##*/}}"' in step['run']
    assert 'vercel curl "$BASE_URL/$asset" --' in staged['run']
    assert steps.index(staged) < next(i for i, step in enumerate(steps) if step['name'] == 'Promote the tested production build')
