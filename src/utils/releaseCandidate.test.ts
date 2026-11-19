import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCandidate, verifyMilestone5Exception, M5_PROTECTION_EXCEPTION, verifyVercelTarget, deploymentUrl, checkCandidate, jsonGet } from '../../scripts/release-candidate.mjs';

const SHA = 'a'.repeat(40), OTHER = 'b'.repeat(40);
const run = (file:string, id:number, overrides:any = {}) => ({ id, path:'.github/workflows/' + file,
  head_sha:SHA, head_branch:'main', event:'push', status:'completed', conclusion:'success', ...overrides });
const candidate = (overrides:any = {}) => ({ repository:'Blitzer0007/ai-infra-watch', ref:'refs/heads/main',
  dispatchSha:SHA, expectedSha:SHA, currentMainSha:SHA,mainProtected:true,
  runs:[run('frontend-ci.yml',1),run('qa-validation.yml',2),run('security-audit.yml',8)], ...overrides });

test('release accepts exact main and successful required CI, without optional path-filtered runs', () => {
  assert.deepEqual(verifyCandidate(candidate()), [1,2,8]);
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
test('a missing, failing or pending security audit blocks the release',()=>{
 for(const audit of [null,run('security-audit.yml',8,{conclusion:'failure'}),run('security-audit.yml',8,{status:'in_progress',conclusion:null})]){
  assert.throws(()=>verifyCandidate(candidate({runs:[run('frontend-ci.yml',1),run('qa-validation.yml',2),...(audit?[audit]:[])]})));
 }
});
test('latest relevant run blocks release while optional failures and reruns remain unresolved', () => {
  for (const extra of [run('frontend-ci.yml',3,{status:'queued',conclusion:null}),run('vercel-python-ci.yml',4,{conclusion:'failure'})]) {
    assert.throws(() => verifyCandidate(candidate({runs:[...candidate().runs,extra]})));
  }
  assert.deepEqual(verifyCandidate(candidate({runs:[run('frontend-ci.yml',1,{conclusion:'failure'}),run('frontend-ci.yml',3),run('qa-validation.yml',2),run('security-audit.yml',8)]})),[3,2,8]);
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
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
  };
  assert.deepEqual(await checkCandidate({GITHUB_REPOSITORY:'Blitzer0007/ai-infra-watch',GITHUB_REF:'refs/heads/main',GITHUB_SHA:SHA,EXPECTED_MAIN_SHA:SHA,GH_TOKEN:'fictional-test-token'},fetcher),[1,2,8]);
  assert.equal(requests.length,3);
  assert(requests.every(r=>r.url.startsWith('https://api.github.com/repos/Blitzer0007/ai-infra-watch/') && r.options.redirect==='error'));
  assert(requests[2].url.includes('head_sha='+SHA));
});
test('release request failures never echo remote bodies or token values', async () => {
  const remote=new Response('fictional private response must never be echoed',{status:403});
  await assert.rejects(()=>jsonGet('https://example.invalid','fictional-secret',async()=>remote),/^Error: Release evidence request failed \(HTTP 403\)\.$/);
  await assert.rejects(()=>jsonGet('https://example.invalid','',async()=>{throw Error('must not call');}),/not configured/);
});

test('release evidence must be a complete HTTP 200 JSON response',async()=>{
  for (const status of [202,204,206]) {
    const body = status === 204 ? null : JSON.stringify({protected:true,workflow_runs:[]});
    const response = new Response(body,{status,headers:{'content-type':'application/json'}});
    await assert.rejects(
      ()=>jsonGet('https://api.github.com/repos/Blitzer0007/ai-infra-watch/branches/main',
        'fictional-test-token',async()=>response),
      /Release evidence request failed/
    );
  }
  for (const type of ['text/html','text/plain','']) {
    const response=new Response('{"protected":true}',{
      status:200,headers:type?{'content-type':type}:{},
    });
    await assert.rejects(
      ()=>jsonGet('https://api.github.com/repos/Blitzer0007/ai-infra-watch/branches/main',
        'fictional-test-token',async()=>response),
      /Release evidence response is not JSON/
    );
  }
});

const M5_BASE = '4449fa2dbbcff5aacb1c328ccd09e4fba8fcc772';
const M5_HEAD = 'c'.repeat(40);
const mergedM5 = () => ({
  waiver: M5_PROTECTION_EXCEPTION,
  waiverPr: { number: 176, merged: true, state: 'closed',
    merge_commit_sha: SHA, base: { ref: 'main' },
    head: { ref:'feature/milestone5-operational-integrity-20261118',
      sha:M5_HEAD, repo: { full_name:'Blitzer0007/ai-infra-watch' } } },
  waiverCommit: { sha: SHA, parents:[{sha:M5_BASE},{sha:M5_HEAD}] },
});

test('unprotected main is allowed only for the exact verified Milestone 5 merge',()=>{
  const scoped={...candidate({mainProtected:false}),...mergedM5()};
  assert.deepEqual(verifyCandidate(scoped),[1,2,8]);
  assert.equal(verifyMilestone5Exception({
    expectedSha:SHA, waiver:scoped.waiver, pr:scoped.waiverPr, commit:scoped.waiverCommit,
  }),true);
  for(const change of [
    {waiver:null}, {waiver:'YES'}, {waiverPr:{...scoped.waiverPr,number:177}},
    {waiverPr:{...scoped.waiverPr,merged:false}},
    {waiverPr:{...scoped.waiverPr,state:'open'}},
    {waiverPr:{...scoped.waiverPr,merge_commit_sha:OTHER}},
    {waiverPr:{...scoped.waiverPr,base:{ref:'develop'}}},
    {waiverPr:{...scoped.waiverPr,head:{...scoped.waiverPr.head,ref:'other'}}},
    {waiverPr:{...scoped.waiverPr,head:{...scoped.waiverPr.head,repo:{full_name:'evil/fork'}}}},
    {waiverCommit:{...scoped.waiverCommit,sha:OTHER}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:OTHER},{sha:M5_HEAD}]}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:M5_BASE},{sha:OTHER}]}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:M5_BASE}]}},
  ]) assert.throws(()=>verifyCandidate({...scoped,...change}));
  assert.throws(()=>verifyCandidate({...scoped,currentMainSha:OTHER}));
  assert.throws(()=>verifyCandidate({...scoped,runs:[]}));
  assert.throws(()=>verifyCandidate({...scoped,runs:[
    run('frontend-ci.yml',1),run('qa-validation.yml',2),run('security-audit.yml',8,{conclusion:'failure'}),
  ]}));
  assert.throws(()=>verifyCandidate({...scoped,mainProtected:undefined}));
});

test('original Milestone 5 waiver fetches PR #176 and its exact first merge',async()=>{
  const requests:string[]=[];
  const original=M5_MERGE_SHA;
  const fetcher:typeof fetch=async(url)=>{
    const value=String(url);
    requests.push(value);
    let payload:any;
    if(value.endsWith('/branches/main'))payload={commit:{sha:original},protected:false};
    else if(value.includes('/actions/runs?'))payload={workflow_runs:candidate().runs.map(r=>({...r,head_sha:original})),total_count:3};
    else if(value.endsWith('/pulls/176'))payload={...mergedM5().waiverPr,merge_commit_sha:original};
    else if(value.endsWith('/commits/'+original))payload={...mergedM5().waiverCommit,sha:original};
    else throw Error('Unexpected release evidence request');
    return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
  };
  const env={GITHUB_REPOSITORY:'Blitzer0007/ai-infra-watch',GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:original,EXPECTED_MAIN_SHA:original,GH_TOKEN:'fictional-test-token'};
  await assert.rejects(()=>checkCandidate(env,fetcher),/waiver/);
  assert.equal(requests.length,2);
  requests.length=0;
  assert.deepEqual(await checkCandidate({...env,AIW_MAIN_PROTECTION_WAIVER:'YES'},fetcher),[1,2,8]);
  assert.equal(requests.length,4);
  assert(requests[2].endsWith('/pulls/176'));
  assert(requests[3].endsWith('/commits/'+original));
});

const M5_MERGE_SHA = 'a8f61d6d5e8f41349574345cd666065d2d6d04b1';
const mergedM5SmokeRepair=()=>({
  waiver:M5_PROTECTION_EXCEPTION,
  waiverPr:{number:177,merged:true,state:'closed',merge_commit_sha:SHA,
    base:{ref:'main'},head:{ref:'fix/milestone5-staged-curl-20261119',
      sha:M5_HEAD,repo:{full_name:'Blitzer0007/ai-infra-watch'}}},
  waiverCommit:{sha:SHA,parents:[{sha:M5_MERGE_SHA},{sha:M5_HEAD}]},
});

test('failed staged smoke may only be repaired by the exact PR #177 two-parent merge',()=>{
  const scoped={...candidate({mainProtected:false}),...mergedM5SmokeRepair()};
  assert.deepEqual(verifyCandidate(scoped),[1,2,8]);
  for(const change of [
    {waiver:null},
    {waiverPr:{...scoped.waiverPr,number:178}},
    {waiverPr:{...scoped.waiverPr,merged:false}},
    {waiverPr:{...scoped.waiverPr,merge_commit_sha:OTHER}},
    {waiverPr:{...scoped.waiverPr,head:{...scoped.waiverPr.head,ref:'some-other-fix'}}},
    {waiverPr:{...scoped.waiverPr,head:{...scoped.waiverPr.head,repo:{full_name:'other/repo'}}}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:M5_BASE},{sha:M5_HEAD}]}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:M5_MERGE_SHA},{sha:OTHER}]}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:M5_MERGE_SHA}]}},
    {waiverCommit:{...scoped.waiverCommit,parents:[{sha:M5_MERGE_SHA},{sha:M5_HEAD},{sha:OTHER}]}},
  ]) assert.throws(()=>verifyCandidate({...scoped,...change}));
  assert.throws(()=>verifyCandidate({...scoped,runs:[
    run('frontend-ci.yml',1),run('qa-validation.yml',2),run('security-audit.yml',8,{conclusion:'failure'})
  ]}));
});

test('repair waiver fetches only PR #177 and its real merge commit',async()=>{
  const requests:string[]=[];
  const exactRepairSha='b4397929332dc8f87815e117f976d3aa929856f0';
  const fetcher:typeof fetch=async(url)=>{
    const target=String(url);requests.push(target);
    let body:any;
    if(target.endsWith('/branches/main'))body={commit:{sha:exactRepairSha},protected:false};
    else if(target.includes('/actions/runs?'))body={
      workflow_runs:candidate().runs.map(r=>({...r,head_sha:exactRepairSha})),
      total_count:3,
    };
    else if(target.endsWith('/pulls/177'))body={
      ...mergedM5SmokeRepair().waiverPr,merge_commit_sha:exactRepairSha,
    };
    else if(target.endsWith('/commits/'+exactRepairSha))body={
      ...mergedM5SmokeRepair().waiverCommit,sha:exactRepairSha,
    };
    else throw Error('Unexpected GitHub attestation endpoint');
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  const env={GITHUB_REPOSITORY:'Blitzer0007/ai-infra-watch',GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:exactRepairSha,EXPECTED_MAIN_SHA:exactRepairSha,GH_TOKEN:'fictional-test-token',
    AIW_MAIN_PROTECTION_WAIVER:'YES'};
  assert.deepEqual(await checkCandidate(env,fetcher),[1,2,8]);
  assert.equal(requests.length,4);
  assert(requests[2].endsWith('/pulls/177'));
  assert(requests[3].endsWith('/commits/'+exactRepairSha));
});


test('Milestone 6 UI release waiver accepts only PR #179 regular merge from pinned main',()=>{
  const base='6827cce1a323949e1b36c06a0a1dca030e63c127';
  const pr={
    number:179,merged:true,state:'closed',merge_commit_sha:SHA,base:{ref:'main'},
    head:{ref:'feature/milestone6-rea-informed-ui-20261119',sha:M5_HEAD,
      repo:{full_name:'Blitzer0007/ai-infra-watch'}},
  };
  const commit={sha:SHA,parents:[{sha:base},{sha:M5_HEAD}]};
  const scoped={...candidate({mainProtected:false}),waiver:M5_PROTECTION_EXCEPTION,
    waiverPr:pr,waiverCommit:commit};
  assert.deepEqual(verifyCandidate(scoped),[1,2,8]);
  for(const modifications of [
    {waiver:null},
    {waiverPr:{...pr,number:180}},
    {waiverPr:{...pr,merged:false}},
    {waiverPr:{...pr,merge_commit_sha:OTHER}},
    {waiverPr:{...pr,head:{...pr.head,ref:'feature/unrelated'}}},
    {waiverPr:{...pr,head:{...pr.head,repo:{full_name:'other/repo'}}}},
    {waiverCommit:{...commit,parents:[{sha:OTHER},{sha:M5_HEAD}]}},
    {waiverCommit:{...commit,parents:[{sha:base},{sha:OTHER}]}},
    {waiverCommit:{...commit,parents:[{sha:base}]}},
    {waiverCommit:{...commit,parents:[{sha:base},{sha:M5_HEAD},{sha:OTHER}]}},
    {runs:[run('frontend-ci.yml',1),run('qa-validation.yml',2),run('security-audit.yml',8,{conclusion:'failure'})]},
  ])assert.throws(()=>verifyCandidate({...scoped,...modifications}));
});

test('UI waiver fetches exactly PR #179 and GitHub-attested two-parent commit',async()=>{
  const queried:string[]=[];
  const source={
    number:179,merged:true,state:'closed',base:{ref:'main'},merge_commit_sha:SHA,
    head:{ref:'feature/milestone6-rea-informed-ui-20261119',sha:M5_HEAD,
      repo:{full_name:'Blitzer0007/ai-infra-watch'}},
  };
  const api:typeof fetch=async(url)=>{
    const target=String(url);queried.push(target);let body:any;
    if(target.endsWith('/branches/main'))body={protected:false,commit:{sha:SHA}};
    else if(target.includes('/actions/runs?'))body={total_count:3,workflow_runs:candidate().runs};
    else if(target.endsWith('/pulls/179'))body=source;
    else if(target.endsWith('/commits/'+SHA))body={sha:SHA,parents:[
      {sha:'6827cce1a323949e1b36c06a0a1dca030e63c127'},{sha:M5_HEAD}]};
    else throw Error('Unexpected endpoint');
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  const env={GITHUB_REPOSITORY:'Blitzer0007/ai-infra-watch',GITHUB_REF:'refs/heads/main',
    GITHUB_SHA:SHA,EXPECTED_MAIN_SHA:SHA,GH_TOKEN:'fictional-test-token',
    AIW_MAIN_PROTECTION_WAIVER:'YES'};
  assert.deepEqual(await checkCandidate(env,api),[1,2,8]);
  assert(queried[2].endsWith('/pulls/179'));
  assert(queried[3].endsWith('/commits/'+SHA));
});
