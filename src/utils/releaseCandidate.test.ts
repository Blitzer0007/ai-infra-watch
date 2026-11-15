import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCandidate, verifyVercelTarget, deploymentUrl, checkCandidate, jsonGet } from '../../scripts/release-candidate.mjs';

const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40);
const run = (file:string, id:number, overrides:any = {}) => ({ id, path:'.github/workflows/' + file,
  head_sha:SHA, head_branch:'main', event:'push', status:'completed', conclusion:'success', ...overrides });
const candidate = (overrides:any = {}) => ({ repository:'Blitzer0007/ai-infra-watch', ref:'refs/heads/main',
  dispatchSha:SHA, expectedSha:SHA, currentMainSha:SHA,mainProtected:true,
  runs:[run('frontend-ci.yml',1),run('qa-validation.yml',2)], ...overrides });

test('release accepts exact main and successful required CI, without optional path-filtered runs', () => {
  assert.deepEqual(verifyCandidate(candidate()), [1,2]);
});
for (const changes of [{repository:'other/repo'}, {ref:'refs/heads/feature'}, {expectedSha:'main'},
  {dispatchSha:OTHER}, {currentMainSha:OTHER}, {mainProtected:false},{mainProtected:undefined},{runs:[]}, {runs:null}]) {
  test('release rejects mismatched or missing candidate evidence: ' + JSON.stringify(changes), () => {
    assert.throws(() => verifyCandidate(candidate(changes)));
  });
}
for (const changes of [{event:'pull_request'}, {head_sha:OTHER}, {head_branch:'feature'},
  {status:'in_progress'}, {conclusion:'failure'}, {conclusion:'skipped'}, {id:0}]) {
  test('unusable frontend CI cannot certify a release: ' + JSON.stringify(changes), () => {
    assert.throws(() => verifyCandidate(candidate({runs:[run('frontend-ci.yml',1,changes),run('qa-validation.yml',2)]})));
  });
}
test('latest relevant run blocks release while optional failures and reruns remain unresolved', () => {
  for (const extra of [run('frontend-ci.yml',3,{status:'queued',conclusion:null}),run('vercel-python-ci.yml',4,{conclusion:'failure'})]) {
    assert.throws(() => verifyCandidate(candidate({runs:[...candidate().runs,extra]})));
  }
  assert.deepEqual(verifyCandidate(candidate({runs:[run('frontend-ci.yml',1,{conclusion:'failure'}),run('frontend-ci.yml',3),run('qa-validation.yml',2)]})),[3,2]);
});
test('Vercel checks fixed project/team and production READY state; staged metadata binds commit', () => {
  const project={id:'prj_test',accountId:'team_test'};
  const deployment={id:'dpl_test',projectId:'prj_test',target:'production',readyState:'READY',meta:{aiwReleaseCommit:SHA}};
  const expected={projectId:'prj_test',team:'team_test',expectedSha:SHA};
  assert.equal(verifyVercelTarget(project,deployment,expected),'dpl_test');
  for (const value of [{projectId:'other'}, {target:'preview'}, {readyState:'ERROR'}, {id:'bad\nvalue'}, {meta:{aiwReleaseCommit:OTHER}}]) {
    assert.throws(()=>verifyVercelTarget(project,{...deployment,...value},expected));
  }
  assert.throws(()=>verifyVercelTarget({...project,accountId:'other'},deployment,expected));
});
test('deployment output cannot inject paths, credentials, lines or a lookalike host', () => {
  assert.equal(deploymentUrl('https://aiw-test.vercel.app'),'https://aiw-test.vercel.app');
  for (const value of ['', 'https://aiw-test.vercel.app/', 'http://aiw-test.vercel.app',
    'https://user@aiw-test.vercel.app','https://aiw-test.vercel.app.evil.test','https://aiw-test.vercel.app\nurl=evil','https://api.vercel.com']) assert.throws(()=>deploymentUrl(value));
});
test('CI requests page through exact-sha evidence and forbid redirects; no deployment endpoint is called', async () => {
  const requests:any[]=[];
  const rows=Array.from({length:100},(_,index)=>run('unrelated.yml',100+index));
  const fetcher:typeof fetch=async(input,options)=>{
    const url=String(input);
    requests.push({url,options});
    const body=url.includes('/branches/main') ? {commit:{sha:SHA},protected:true} : url.endsWith('page=1')
      ? {workflow_runs:rows,total_count:102} : {workflow_runs:candidate().runs,total_count:102};
    return new Response(JSON.stringify(body),{status:200});
  };
  assert.deepEqual(await checkCandidate({GITHUB_REPOSITORY:'Blitzer0007/ai-infra-watch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:SHA,EXPECTED_MAIN_SHA:SHA,GH_TOKEN:'fictional-test-token'},fetcher),[1,2]);
  assert.equal(requests.length,3);
  assert(requests.every(r=>r.url.startsWith('https://api.github.com/repos/Blitzer0007/ai-infra-watch/') && r.options.redirect==='error'));
  assert(requests[2].url.includes('head_sha='+SHA));
});
test('release request failures never echo remote bodies or token values', async () => {
  const remote=new Response('fictional private response must never be echoed',{status:403});
  await assert.rejects(()=>jsonGet('https://example.invalid','fictional-secret',async()=>remote),/^Error: Release evidence request failed \(HTTP 403\)\.$/);
  await assert.rejects(()=>jsonGet('https://example.invalid','',async()=>{throw Error('must not call');}),/not configured/);
});
