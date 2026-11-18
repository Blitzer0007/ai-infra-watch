from pathlib import Path
import yaml


ROOT = Path(__file__).resolve().parents[1]


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
