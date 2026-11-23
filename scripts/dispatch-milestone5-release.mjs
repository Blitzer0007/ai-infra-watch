// Prepared one-time PR #188 repair release: owner approval is required before
// merge; trusted exact-main CI then dispatches the
// existing environment-gated manual release. Does not deploy or read Vercel
// credentials itself. Never log tokens or remote API bodies.
import { pathToFileURL } from 'node:url';
import { RELEASE_REPOSITORY, M5_PROTECTION_EXCEPTION, verifyMilestone5Exception, checkCandidate, jsonGet } from './release-candidate.mjs';

export const M5_HANDOFF_PARENT = '978ccefac76e36fa24e4b35cab2f1a08cbaca899';
export const M5_HANDOFF_PR = 188;
export const M5_ROLLBACK = 'dpl_BxDnHxX17q5mXVjLntaUtU4fazV6';
const SHA = /^[a-f0-9]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,14}$/;

export function verifyCompletion(env, run) {
  const sha = env.CI_RUN_SHA;
  if (env.GITHUB_REPOSITORY !== RELEASE_REPOSITORY ||
      env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_run' ||
      !SHA.test(sha || '') || env.GITHUB_SHA !== sha ||
      !RUN_ID.test(String(env.CI_RUN_ID || '')) ||
      run?.id !== Number(env.CI_RUN_ID) ||
      run?.path !== '.github/workflows/qa-validation.yml' ||
      run?.event !== 'push' || run?.head_branch !== 'main' ||
      run?.head_repository?.full_name !== RELEASE_REPOSITORY ||
      run?.head_sha !== sha || run?.status !== 'completed' ||
      run?.conclusion !== 'success') {
    throw Error('One-time release handoff requires the completed, successful exact-main UI/API/DB workflow.');
  }
  return sha;
}

export async function dispatchOneTimeRelease(env, fetcher = fetch) {
  const token = env.GH_TOKEN;
  if (!token) throw Error('GitHub Actions authentication is required.');
  if (!RUN_ID.test(String(env.CI_RUN_ID || '')) || !SHA.test(env.CI_RUN_SHA || '')) {
    throw Error('Missing valid triggering run and exact commit.');
  }
  const base = 'https://api.github.com/repos/' + RELEASE_REPOSITORY;
  const sourceRun = await jsonGet(base + '/actions/runs/' + env.CI_RUN_ID, token, fetcher);
  const sha = verifyCompletion(env, sourceRun);
  // Authorize only PR #188's pinned two-parent merge if the branch later
  // becomes protected; never rely on main.protected to permit a broader
  // successful-CI commit to dispatch a release.
  const pr = await jsonGet(base + '/pulls/' + M5_HANDOFF_PR, token, fetcher);
  if (pr?.number !== M5_HANDOFF_PR) throw Error('One-time release PR identity does not match.');
  const commit = await jsonGet(base + '/commits/' + sha, token, fetcher);
  verifyMilestone5Exception({ expectedSha: sha, waiver: M5_PROTECTION_EXCEPTION, pr, commit });

  // checkCandidate performs an independent branch + paged CI check and only
  // permits the exact two-parent PR #188 merge (first parent 978ccef,
  // second parent authenticated PR head) while main remains unprotected.
  await checkCandidate({
    GITHUB_REPOSITORY: RELEASE_REPOSITORY, GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha, EXPECTED_MAIN_SHA: sha,
    AIW_MAIN_PROTECTION_WAIVER: 'YES', AIW_RELEASE_PR: '188', GH_TOKEN: token,
  }, fetcher);

  // Fail closed if this commit already has a production release workflow run.
  // GitHub may deliver/retry workflow_run events; never dispatch it twice.
  for (let page = 1; page <= 10; page++) {
    const info = await jsonGet(base + '/actions/workflows/vercel-production-deploy.yml/runs?head_sha='
      + sha + '&event=workflow_dispatch&per_page=100&page=' + page, token, fetcher);
    if (!Array.isArray(info?.workflow_runs) ||
        !Number.isSafeInteger(info.total_count) || info.total_count < 0) {
      throw Error('Existing release-run evidence is malformed.');
    }
    if (info.workflow_runs.some(run => run?.head_sha === sha && run?.event === 'workflow_dispatch')) {
      return { status: 'already-requested', sha };
    }
    if ((page * 100) >= info.total_count) break;
    if (info.workflow_runs.length !== 100 || page === 10) {
      throw Error('Existing release-run evidence is incomplete.');
    }
  }
  const current = await jsonGet(base + '/branches/main', token, fetcher);
  if (current?.commit?.sha !== sha) throw Error('Main changed before dispatch.');

  const response = await fetcher(base + '/actions/workflows/vercel-production-deploy.yml/dispatches', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        confirm_production_deploy: 'YES',
        confirm_milestone5_unprotected_main_exception: 'YES',
        expected_main_sha: sha,
        rollback_deployment: M5_ROLLBACK,
        run_live_checks: 'false',
      },
    }),
  });
  if (response.status !== 204 || response.ok !== true) {
    throw Error('One-time production release dispatch rejected (HTTP ' + response.status + ').');
  }
  return { status: 'dispatched', sha };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dispatchOneTimeRelease(process.env).then(value => {
    console.log('PR #188 repair one-time release: ' + value.status + ' for ' + value.sha);
  }).catch(() => {
    console.error('PR #188 repair one-time release was not dispatched; review exact-main CI and GitHub Actions permissions. No secrets or remote response bodies logged.');
    process.exitCode = 1;
  });
}
