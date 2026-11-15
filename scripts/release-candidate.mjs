// Read-only release checks. Never print credentials or remote response bodies.
import { pathToFileURL } from 'node:url';

export const RELEASE_REPOSITORY = 'Blitzer0007/ai-infra-watch';
const REQUIRED = ['frontend-ci.yml', 'qa-validation.yml'];
const CHECKS = [...REQUIRED, 'vercel-python-ci.yml', 'agents-python-tests.yml',
  'ai-quality-gate.yml', 'continuous-quality-eval.yml', 'backend-container-ci.yml'];

export function verifyCandidate({ repository, ref, dispatchSha, expectedSha, currentMainSha, mainProtected, runs }) {
  if (repository !== RELEASE_REPOSITORY || ref !== 'refs/heads/main') throw Error('Release requires the intended repository and main branch.');
  if (mainProtected !== true) throw Error('Production main must have enforced branch protection.');
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || dispatchSha !== expectedSha || currentMainSha !== expectedSha) {
    throw Error('Reviewed candidate, dispatch commit and current main must match.');
  }
  if (!Array.isArray(runs)) throw Error('CI evidence is unavailable.');
  const latest = new Map();
  for (const run of runs) {
    const file = String(run.path || '').replace('.github/workflows/', '');
    if (!CHECKS.includes(file) || run.head_sha !== expectedSha || run.head_branch !== 'main' ||
        !['push', 'workflow_dispatch'].includes(run.event)) continue;
    if (!Number.isSafeInteger(run.id) || run.id <= 0) throw Error('CI evidence has an invalid run identity.');
    const prior = latest.get(file);
    if (!prior || run.id > prior.id) latest.set(file, run);
  }
  for (const file of REQUIRED) if (!latest.has(file)) throw Error('Required main-commit CI evidence is missing: ' + file);
  for (const [file, run] of latest) {
    if (run.status !== 'completed' || run.conclusion !== 'success') throw Error('CI is not successful: ' + file);
  }
  return [...latest.values()].map(run => run.id);
}

export function verifyVercelTarget(project, deployment, { team, projectId, expectedSha = null }) {
  if (project?.id !== projectId || project?.accountId !== team || deployment?.projectId !== projectId ||
      deployment?.target !== 'production' || deployment?.readyState !== 'READY' || !/^dpl_[A-Za-z0-9]+$/.test(deployment?.id || '')) {
    throw Error('Vercel project or production deployment identity/state does not match.');
  }
  if (expectedSha && deployment?.meta?.aiwReleaseCommit !== expectedSha) throw Error('Staged deployment commit does not match.');
  return deployment.id;
}

export function deploymentUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Invalid staged deployment URL.'); }
  if (url.protocol !== 'https:' || url.origin !== value || !/^[a-z0-9-]+\.vercel\.app$/.test(url.hostname)) {
    throw Error('Invalid staged deployment URL.');
  }
  return value;
}

export async function jsonGet(url, token, fetcher = fetch) {
  if (!token) throw Error('Required CI authentication is not configured.');
  const response = await fetcher(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw Error('Release evidence request failed (HTTP ' + response.status + ').');
  return response.json();
}

export async function checkCandidate(env, fetcher = fetch) {
  const repo = RELEASE_REPOSITORY;
  const base = 'https://api.github.com/repos/' + repo;
  const main = await jsonGet(base + '/branches/main', env.GH_TOKEN, fetcher);
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const body = await jsonGet(base + '/actions/runs?head_sha=' + encodeURIComponent(env.EXPECTED_MAIN_SHA || '') + '&per_page=100&page=' + page, env.GH_TOKEN, fetcher);
    if (!Array.isArray(body.workflow_runs) || !Number.isSafeInteger(body.total_count) || body.total_count < 0) throw Error('CI evidence is malformed.');
    runs.push(...body.workflow_runs);
    if (runs.length >= body.total_count) break;
    if (!body.workflow_runs.length || page === 10) throw Error('CI evidence is incomplete.');
  }
  return verifyCandidate({ repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, dispatchSha: env.GITHUB_SHA,
    expectedSha: env.EXPECTED_MAIN_SHA, currentMainSha: main?.commit?.sha, mainProtected: main?.protected, runs });
}

async function main() {
  if (process.argv[2] === 'candidate') {
    const ids = await checkCandidate(process.env);
    console.log('Reviewed main commit passed CI evidence checks; run IDs: ' + ids.join(', '));
  } else if (['rollback', 'staged'].includes(process.argv[2])) {
    const { VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: projectId, VERCEL_TOKEN: token } = process.env;
    // Fixed repository-owned target; never follow a dispatch-supplied API origin.
    if (team !== 'team_TfbzU4SMDZD8lIgCHKsJNa6v' || projectId !== 'prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD') throw Error('Unexpected Vercel target.');
    const staged = process.argv[2] === 'staged';
    const value = staged ? deploymentUrl(process.env.DEPLOYMENT_URL) : process.env.ROLLBACK_DEPLOYMENT;
    if (!staged && !/^dpl_[A-Za-z0-9]+$/.test(value || '')) throw Error('A known-good rollback deployment ID is required.');
    const query = '?teamId=' + team;
    const project = await jsonGet('https://api.vercel.com/v9/projects/' + projectId + query, token);
    const deployment = await jsonGet('https://api.vercel.com/v13/deployments/' + encodeURIComponent(staged ? new URL(value).hostname : value) + query, token);
    verifyVercelTarget(project, deployment, { team, projectId, expectedSha: staged ? process.env.EXPECTED_MAIN_SHA : null });
    console.log((staged ? 'Staged' : 'Rollback') + ' production deployment identity verified.');
  } else throw Error('Unknown release check.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Release check failed; review candidate CI, target identity and protected CI configuration. No response body or credentials logged.'); process.exitCode = 1; });
}
