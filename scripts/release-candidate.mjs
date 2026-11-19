// Read-only release checks. Never print credentials or remote response bodies.
import { pathToFileURL } from 'node:url';

export const RELEASE_REPOSITORY = 'Blitzer0007/ai-infra-watch';
const REQUIRED = ['frontend-ci.yml', 'qa-validation.yml', 'security-audit.yml'];
const CHECKS = [...REQUIRED, 'vercel-python-ci.yml', 'agents-python-tests.yml',
  'ai-quality-gate.yml', 'continuous-quality-eval.yml', 'backend-container-ci.yml'];

// This release-specific exception permits only the audited PR #176 merge,
// or the immediately following PR #177 fix for its failed staged smoke. Each
// requires an independently fetched, exact 2-parent merge from a pinned main
// commit. It cannot authorize a future or unrelated main release.
const M5_PR = 176;
const M5_BASE_SHA = '4449fa2dbbcff5aacb1c328ccd09e4fba8fcc772';
const M5_HEAD_BRANCH = 'feature/milestone5-operational-integrity-20261118';
const M5_REPAIR_PR = 177;
const M5_MERGE_SHA = 'a8f61d6d5e8f41349574345cd666065d2d6d04b1';
const M5_REPAIR_BRANCH = 'fix/milestone5-staged-curl-20261119';
export const M5_PROTECTION_EXCEPTION = 'MILESTONE5_PR176_ONE_TIME';

export function verifyMilestone5Exception({ expectedSha, waiver, pr, commit }) {
  const expected = pr?.number === M5_PR
    ? { parent: M5_BASE_SHA, branch: M5_HEAD_BRANCH }
    : pr?.number === M5_REPAIR_PR
      ? { parent: M5_MERGE_SHA, branch: M5_REPAIR_BRANCH }
      : null;
  if (waiver !== M5_PROTECTION_EXCEPTION || !expected ||
      pr?.merged !== true || pr?.state !== 'closed' ||
      pr?.base?.ref !== 'main' || pr?.head?.ref !== expected.branch ||
      pr?.head?.repo?.full_name !== RELEASE_REPOSITORY ||
      pr?.merge_commit_sha !== expectedSha ||
      commit?.sha !== expectedSha ||
      !Array.isArray(commit.parents) || commit.parents.length !== 2 ||
      commit.parents[0]?.sha !== expected.parent ||
      commit.parents[1]?.sha !== pr.head.sha ||
      !/^[a-f0-9]{40}$/.test(pr.head.sha || '')) {
    throw Error('Unprotected-main waiver does not match the exact reviewed Milestone 5 merge or repair.');
  }
  return true;
}

export function verifyCandidate({ repository, ref, dispatchSha, expectedSha, currentMainSha, mainProtected, runs,
  waiver = null, waiverPr = null, waiverCommit = null }) {
  if (repository !== RELEASE_REPOSITORY || ref !== 'refs/heads/main') throw Error('Release requires the intended repository and main branch.');
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || dispatchSha !== expectedSha || currentMainSha !== expectedSha) {
    throw Error('Reviewed candidate, dispatch commit and current main must match.');
  }
  if (mainProtected !== true) {
    if (mainProtected !== false) throw Error('Main branch protection state is unknown.');
    verifyMilestone5Exception({ expectedSha, waiver, pr: waiverPr, commit: waiverCommit });
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
  // Only a full JSON API response can certify exact-commit release evidence.
  // HTTP 202/204/206 are not complete candidate/target attestations.
  if (response.status !== 200 || response.ok !== true) throw Error('Release evidence request failed (HTTP ' + response.status + ').');
  const type = String(response.headers?.get?.('content-type') || '');
  if (!/^application\/json(?:\s*;|\s*$)/i.test(type)) throw Error('Release evidence response is not JSON.');
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
  // The waiver is opt-in and independently attested by the exact merged PR
  // and commit ancestry. Only PR #176 and its immediate PR #177 smoke fix can
  // ever meet the pinned-parent checks; no generic branch-protection bypass.
  let waiverPr = null, waiverCommit = null;
  const waiver = env.AIW_MAIN_PROTECTION_WAIVER === 'YES' ? M5_PROTECTION_EXCEPTION : null;
  if (main?.protected === false && waiver) {
    const prNumber = env.EXPECTED_MAIN_SHA === M5_MERGE_SHA ? M5_PR : M5_REPAIR_PR;
    waiverPr = await jsonGet(base + '/pulls/' + prNumber, env.GH_TOKEN, fetcher);
    waiverCommit = await jsonGet(base + '/commits/' + encodeURIComponent(env.EXPECTED_MAIN_SHA || ''), env.GH_TOKEN, fetcher);
  }
  return verifyCandidate({ repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, dispatchSha: env.GITHUB_SHA,
    expectedSha: env.EXPECTED_MAIN_SHA, currentMainSha: main?.commit?.sha, mainProtected: main?.protected, runs,
    waiver, waiverPr, waiverCommit });
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
