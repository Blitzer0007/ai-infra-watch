// Read-only release checks. Never print credentials or remote response bodies.
import { pathToFileURL } from 'node:url';

export const RELEASE_REPOSITORY = 'Blitzer0007/ai-infra-watch';
const REQUIRED = ['frontend-ci.yml', 'qa-validation.yml', 'security-audit.yml'];
const CHECKS = [...REQUIRED, 'vercel-python-ci.yml', 'agents-python-tests.yml',
  'ai-quality-gate.yml', 'continuous-quality-eval.yml', 'backend-container-ci.yml'];

// Exact PR-to-main release allowlist, independently verified against GitHub.
// A waiver is never permission to deploy arbitrary unprotected-main commits;
// each approved release retains its reviewed PR, source branch, and first parent.
const M5_PR = 176;
const M5_BASE_SHA = '4449fa2dbbcff5aacb1c328ccd09e4fba8fcc772';
const M5_HEAD_BRANCH = 'feature/milestone5-operational-integrity-20261118';
const M5_REPAIR_PR = 177;
const M5_MERGE_SHA = 'a8f61d6d5e8f41349574345cd666065d2d6d04b1';
const M5_REPAIR_BRANCH = 'fix/milestone5-staged-curl-20261119';
const M5_ONE_SHOT_PR = 178;
const M5_REPAIR_MERGE_SHA = 'b4397929332dc8f87815e117f976d3aa929856f0';
const M5_ONE_SHOT_BRANCH = 'fix/milestone5-one-time-ci-release-20261119';
// Owner-approved Milestone 6 portfolio UI release: one exact, reviewed merge
// directly following the successfully deployed Milestone 5 main.
const M6_UI_PR = 179;
const M6_UI_FIRST_PARENT = '6827cce1a323949e1b36c06a0a1dca030e63c127';
const M6_UI_HEAD_BRANCH = 'feature/milestone6-rea-informed-ui-20261119';
// Owner-approved application-wide UI shell release, pinned to live Milestone 6.
const M7_APP_UI_PR = 182;
const M7_APP_UI_FIRST_PARENT = '3bae7b12b567f669c93c859f68fae5d5a5c84cca';
const M7_APP_UI_HEAD_BRANCH = 'feature/milestone7-application-wide-ui-20261119';
// The immediate post-merge fix restores exact 360px Holding Details scroll.
// It is restricted to the main commit that failed UI validation.
const M7_SCROLL_REPAIR_PR = 183;
const M7_SCROLL_REPAIR_PARENT = '69921f7a9022af5187ac2206aa5b688b11c855a1';
const M7_SCROLL_REPAIR_BRANCH = 'fix/milestone7-mobile-holding-scroll-20261119';
// Owner-approved November 21 data/brief release, limited to PR #180's
// direct regular merge onto the verified UI production commit.
const DATA_REPAIR_PR = 180;
const DATA_REPAIR_PARENT = '347240c7657af8a6f830b254e84bedc10f88d785';
const DATA_REPAIR_BRANCH = 'fix/telegram-daily-brief-evidence-20261119';
// Owner-approved November 22 combined light UI/quote release. This is a new
// PR-specific exception; the prior data/brief release's ancestry is unchanged.
const LIGHT_QUOTES_PR = 187;
const LIGHT_QUOTES_PARENT = '529e956254bc73c12ed8d7f4ffa6510f9b3d4442';
const LIGHT_QUOTES_BRANCH = 'feature/data-health-evidence-states';
// Prepared PR #188 release: requires its own explicit owner decision before
// merge. The historical #187 approval does not authorize this candidate.
const RESEARCH_REPAIRS_PR = 188;
const RESEARCH_REPAIRS_PARENT = '978ccefac76e36fa24e4b35cab2f1a08cbaca899';
const RESEARCH_REPAIRS_BRANCH = 'feature/read-only-health-snapshot';
export const M5_PROTECTION_EXCEPTION = 'MILESTONE5_PR176_ONE_TIME';

// Prepared, manual-only PR189 path. This is not owner approval or activation.
// A later explicit decision must identify the final reviewed PR head; accepting
// that full SHA as an input avoids a self-referential commit pin in this file.
export const PR189_RELEASE = Object.freeze({
  number: 189,
  branch: 'feature/nvidia-council-evaluation',
  parent: '79fddf79a452c2a385b596fced604397781316eb',
  rollback: 'dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo',
});
export const PR189_PROTECTION_EXCEPTION = 'PR189_MANUAL_ONE_TIME';
const FULL_SHA = /^[a-f0-9]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,14}$/;

export function verifyPR189Exception({ expectedSha, reviewedHeadSha, waiver, pr, commit }) {
  if (waiver !== PR189_PROTECTION_EXCEPTION ||
      !FULL_SHA.test(expectedSha || '') || !FULL_SHA.test(reviewedHeadSha || '') ||
      pr?.number !== PR189_RELEASE.number || pr?.merged !== true || pr?.state !== 'closed' ||
      pr?.base?.ref !== 'main' || pr?.base?.repo?.full_name !== RELEASE_REPOSITORY ||
      pr?.head?.ref !== PR189_RELEASE.branch || pr?.head?.repo?.full_name !== RELEASE_REPOSITORY ||
      pr?.head?.sha !== reviewedHeadSha || pr?.merge_commit_sha !== expectedSha ||
      commit?.sha !== expectedSha || !Array.isArray(commit.parents) || commit.parents.length !== 2 ||
      commit.parents[0]?.sha !== PR189_RELEASE.parent || commit.parents[1]?.sha !== reviewedHeadSha) {
    throw Error('PR189 exception requires its exact reviewed head and direct two-parent merge.');
  }
  return true;
}

function requirePR189ManualInputs(env) {
  if (env.GITHUB_REPOSITORY !== RELEASE_REPOSITORY || env.GITHUB_REF !== 'refs/heads/main' ||
      env.GITHUB_EVENT_NAME !== 'workflow_dispatch' || env.AIW_CONFIRM_PRODUCTION_DEPLOY !== 'YES' ||
      env.AIW_MAIN_PROTECTION_WAIVER !== 'NO' || env.AIW_RUN_LIVE_CHECKS !== 'false' ||
      !FULL_SHA.test(env.EXPECTED_MAIN_SHA || '') || env.GITHUB_SHA !== env.EXPECTED_MAIN_SHA ||
      !FULL_SHA.test(env.AIW_REVIEWED_PR_HEAD_SHA || '') ||
      !RUN_ID.test(env.GITHUB_RUN_ID || '') || env.GITHUB_RUN_ATTEMPT !== '1' ||
      env.ROLLBACK_DEPLOYMENT !== PR189_RELEASE.rollback) {
    throw Error('PR189 requires a separate manual confirmation, reviewed head, pinned rollback and live checks off; old exceptions cannot be combined.');
  }
}

async function rejectDuplicatePR189Release(env, token, fetcher) {
  // Rechecks may see this workflow's own run; another dispatch of the same
  // main commit must never stage/promote concurrently or silently retry it.
  const seen = new Set();
  let ownRunSeen = false;
  for (let page = 1; page <= 10; page++) {
    const url = 'https://api.github.com/repos/' + RELEASE_REPOSITORY +
      '/actions/workflows/vercel-production-deploy.yml/runs?head_sha=' + env.EXPECTED_MAIN_SHA +
      '&event=workflow_dispatch&per_page=100&page=' + page;
    const body = await jsonGet(url, token, fetcher);
    if (!Array.isArray(body?.workflow_runs) || !Number.isSafeInteger(body.total_count) || body.total_count < 0) {
      throw Error('PR189 dispatch evidence is malformed.');
    }
    for (const run of body.workflow_runs) {
      if (!Number.isSafeInteger(run?.id) || run.id <= 0 || run.head_sha !== env.EXPECTED_MAIN_SHA ||
          run.event !== 'workflow_dispatch' || run.head_branch !== 'main' ||
          run.path !== '.github/workflows/vercel-production-deploy.yml') {
        throw Error('PR189 dispatch evidence has an unexpected identity.');
      }
      if (seen.has(run.id)) throw Error('PR189 dispatch evidence repeats a run.');
      seen.add(run.id);
      if (String(run.id) !== env.GITHUB_RUN_ID) throw Error('PR189 already has another release dispatch; review it before any further release attempt.');
      ownRunSeen = true;
    }
    if (seen.size > body.total_count) throw Error('PR189 dispatch evidence has inconsistent counts.');
    if (seen.size === body.total_count) {
      if (!ownRunSeen) throw Error('PR189 current release dispatch is missing from evidence.');
      return;
    }
    if (body.workflow_runs.length !== 100 || page === 10) throw Error('PR189 dispatch evidence is incomplete.');
  }
}

export function verifyMilestone5Exception({ expectedSha, waiver, pr, commit }) {
  const expected = pr?.number === RESEARCH_REPAIRS_PR
    ? { parent: RESEARCH_REPAIRS_PARENT, branch: RESEARCH_REPAIRS_BRANCH }
    : pr?.number === LIGHT_QUOTES_PR
    ? { parent: LIGHT_QUOTES_PARENT, branch: LIGHT_QUOTES_BRANCH }
    : pr?.number === DATA_REPAIR_PR
    ? { parent: DATA_REPAIR_PARENT, branch: DATA_REPAIR_BRANCH }
    : pr?.number === M5_PR
    ? { parent: M5_BASE_SHA, branch: M5_HEAD_BRANCH }
    : pr?.number === M5_REPAIR_PR
      ? { parent: M5_MERGE_SHA, branch: M5_REPAIR_BRANCH }
      : pr?.number === M5_ONE_SHOT_PR
        ? { parent: M5_REPAIR_MERGE_SHA, branch: M5_ONE_SHOT_BRANCH }
        : pr?.number === M6_UI_PR
          ? { parent: M6_UI_FIRST_PARENT, branch: M6_UI_HEAD_BRANCH }
          : pr?.number === M7_APP_UI_PR
            ? { parent: M7_APP_UI_FIRST_PARENT, branch: M7_APP_UI_HEAD_BRANCH }
            : pr?.number === M7_SCROLL_REPAIR_PR
              ? { parent: M7_SCROLL_REPAIR_PARENT, branch: M7_SCROLL_REPAIR_BRANCH }
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
  waiver = null, waiverPr = null, waiverCommit = null, reviewedHeadSha = null }) {
  if (repository !== RELEASE_REPOSITORY || ref !== 'refs/heads/main') throw Error('Release requires the intended repository and main branch.');
  if (!/^[a-f0-9]{40}$/.test(expectedSha || '') || dispatchSha !== expectedSha || currentMainSha !== expectedSha) {
    throw Error('Reviewed candidate, dispatch commit and current main must match.');
  }
  if (mainProtected !== true && mainProtected !== false) throw Error('Main branch protection state is unknown.');
  if (waiver === PR189_PROTECTION_EXCEPTION) {
    // Pin this candidate even if protection is added after preparation.
    verifyPR189Exception({ expectedSha, reviewedHeadSha, waiver, pr: waiverPr, commit: waiverCommit });
  } else if (mainProtected !== true) {
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
  const required = waiver === PR189_PROTECTION_EXCEPTION ? CHECKS : REQUIRED;
  for (const file of required) if (!latest.has(file)) throw Error('Required main-commit CI evidence is missing: ' + file);
  for (const [file, run] of latest) {
    if (run.status !== 'completed' || run.conclusion !== 'success') throw Error('CI is not successful: ' + file);
  }
  return [...latest.values()].map(run => run.id);
}

export function verifyVercelTarget(project, deployment, { team, projectId, expectedSha = null,
  expectedId = null, rollbackSha = null }) {
  if (project?.id !== projectId || project?.accountId !== team || deployment?.projectId !== projectId ||
      deployment?.target !== 'production' || deployment?.readyState !== 'READY' || !/^dpl_[A-Za-z0-9]+$/.test(deployment?.id || '')) {
    throw Error('Vercel project or production deployment identity/state does not match.');
  }
  if (expectedSha && deployment?.meta?.aiwReleaseCommit !== expectedSha) throw Error('Staged deployment commit does not match.');
  if (expectedId && deployment.id !== expectedId) throw Error('Rollback deployment ID does not match.');
  if (rollbackSha && deployment?.meta?.githubCommitSha !== rollbackSha) throw Error('Rollback source commit does not match.');
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
  const pr189 = env.AIW_PR189_PROTECTION_WAIVER === 'YES';
  if (pr189) requirePR189ManualInputs(env);
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
  // and commit ancestry. Only the bounded reviewed PRs #176–#179, #182
  // immediate UI-restore PR #183, explicitly selected data/brief PR #180,
  // and the separately owner-approved combined light/quote PR #187
  // can meet this exception. Every candidate
  // must match its pinned direct main parent; never a generic bypass.
  let waiverPr = null, waiverCommit = null;
  const waiver = pr189 ? PR189_PROTECTION_EXCEPTION
    : env.AIW_MAIN_PROTECTION_WAIVER === 'YES' ? M5_PROTECTION_EXCEPTION : null;
  if (pr189) {
    waiverPr = await jsonGet(base + '/pulls/' + PR189_RELEASE.number, env.GH_TOKEN, fetcher);
    waiverCommit = await jsonGet(base + '/commits/' + encodeURIComponent(env.EXPECTED_MAIN_SHA || ''), env.GH_TOKEN, fetcher);
  } else if (main?.protected === false && waiver) {
    const prNumber = env.AIW_RELEASE_PR === '188' ? RESEARCH_REPAIRS_PR
      : env.AIW_RELEASE_PR === '187' ? LIGHT_QUOTES_PR
      : env.AIW_RELEASE_PR === '180' ? DATA_REPAIR_PR
      : env.EXPECTED_MAIN_SHA === M5_MERGE_SHA ? M5_PR
      : env.EXPECTED_MAIN_SHA === M5_REPAIR_MERGE_SHA ? M5_REPAIR_PR
      : env.EXPECTED_MAIN_SHA === M6_UI_FIRST_PARENT ? M5_ONE_SHOT_PR
      : env.EXPECTED_MAIN_SHA === M7_APP_UI_FIRST_PARENT ? M6_UI_PR
      : env.EXPECTED_MAIN_SHA === M7_SCROLL_REPAIR_PARENT ? M7_APP_UI_PR
      : M7_SCROLL_REPAIR_PR;
    waiverPr = await jsonGet(base + '/pulls/' + prNumber, env.GH_TOKEN, fetcher);
    if (waiverPr?.number !== prNumber) throw Error('Release PR identity does not match the requested candidate.');
    waiverCommit = await jsonGet(base + '/commits/' + encodeURIComponent(env.EXPECTED_MAIN_SHA || ''), env.GH_TOKEN, fetcher);
  }
  const ids = verifyCandidate({ repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, dispatchSha: env.GITHUB_SHA,
    expectedSha: env.EXPECTED_MAIN_SHA, currentMainSha: main?.commit?.sha, mainProtected: main?.protected, runs,
    waiver, waiverPr, waiverCommit, reviewedHeadSha: env.AIW_REVIEWED_PR_HEAD_SHA });
  if (pr189) await rejectDuplicatePR189Release(env, env.GH_TOKEN, fetcher);
  return ids;
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
    const pr189Rollback = !staged && process.env.AIW_PR189_PROTECTION_WAIVER === 'YES';
    verifyVercelTarget(project, deployment, { team, projectId, expectedSha: staged ? process.env.EXPECTED_MAIN_SHA : null,
      expectedId: pr189Rollback ? PR189_RELEASE.rollback : null,
      rollbackSha: pr189Rollback ? PR189_RELEASE.parent : null });
    console.log((staged ? 'Staged' : 'Rollback') + ' production deployment identity verified.');
  } else throw Error('Unknown release check.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Release check failed; review candidate CI, target identity and protected CI configuration. No response body or credentials logged.'); process.exitCode = 1; });
}
