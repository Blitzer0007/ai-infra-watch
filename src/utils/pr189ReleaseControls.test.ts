import test from 'node:test';
import assert from 'node:assert/strict';
import { PR189_RELEASE, PR189_PROTECTION_EXCEPTION, M5_PROTECTION_EXCEPTION,
  RELEASE_REPOSITORY, checkCandidate, verifyCandidate, verifyPR189Exception,
  verifyMilestone5Exception, verifyVercelTarget } from '../../scripts/release-candidate.mjs';

const SHA = 'a'.repeat(40), HEAD = 'c'.repeat(40), OTHER = 'd'.repeat(40);
const files = ['frontend-ci.yml', 'qa-validation.yml', 'security-audit.yml',
  'vercel-python-ci.yml', 'agents-python-tests.yml', 'ai-quality-gate.yml',
  'continuous-quality-eval.yml', 'backend-container-ci.yml'];
const runs = () => files.map((file, i) => ({id:i+1, path:'.github/workflows/'+file,
  head_sha:SHA, head_branch:'main', event:'push', status:'completed', conclusion:'success'}));
const pr = () => ({number:189, merged:true, state:'closed', merge_commit_sha:SHA,
  base:{ref:'main',repo:{full_name:RELEASE_REPOSITORY}},
  head:{ref:PR189_RELEASE.branch,sha:HEAD,repo:{full_name:RELEASE_REPOSITORY}}});
const commit = () => ({sha:SHA,parents:[{sha:PR189_RELEASE.parent},{sha:HEAD}]});
const candidate = (protectedMain=false) => ({repository:RELEASE_REPOSITORY,ref:'refs/heads/main',
  dispatchSha:SHA,expectedSha:SHA,currentMainSha:SHA,mainProtected:protectedMain,runs:runs(),
  waiver:PR189_PROTECTION_EXCEPTION,reviewedHeadSha:HEAD,waiverPr:pr(),waiverCommit:commit()});
const env = () => ({GITHUB_REPOSITORY:RELEASE_REPOSITORY,GITHUB_REF:'refs/heads/main',
  GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_SHA:SHA,EXPECTED_MAIN_SHA:SHA,
  GITHUB_RUN_ID:'12345',GITHUB_RUN_ATTEMPT:'1',GH_TOKEN:'fictional-ci-token',
  AIW_PR189_PROTECTION_WAIVER:'YES',AIW_MAIN_PROTECTION_WAIVER:'NO',
  AIW_CONFIRM_PRODUCTION_DEPLOY:'YES',AIW_RUN_LIVE_CHECKS:'false',
  AIW_REVIEWED_PR_HEAD_SHA:HEAD,ROLLBACK_DEPLOYMENT:PR189_RELEASE.rollback});
const dispatch = (id=12345) => ({id,path:'.github/workflows/vercel-production-deploy.yml',
  head_sha:SHA,head_branch:'main',event:'workflow_dispatch'});

function github(options:any={}) {
  const calls:{url:string,method:string}[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
    const url=String(input);calls.push({url,method:init?.method||'GET'});
    assert.equal(init?.redirect,'error');
    let body:any;
    if(url.endsWith('/branches/main')) body={protected:options.protected??false,commit:{sha:options.mainSha??SHA}};
    else if(url.includes('/actions/runs?')) body={total_count:8,workflow_runs:options.runs??runs()};
    else if(url.endsWith('/pulls/189')) body=options.pr??pr();
    else if(url.endsWith('/commits/'+SHA)) body=options.commit??commit();
    else if(url.includes('/actions/workflows/vercel-production-deploy.yml/runs?'))
      body=options.dispatches??{total_count:1,workflow_runs:[dispatch()]};
    else throw Error('Unexpected evidence endpoint');
    return new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
  };
  return {calls,fetcher};
}

test('PR189 pins the observed branch, baseline and rollback, without reusing the old exception',()=>{
  assert.deepEqual(PR189_RELEASE,{number:189,branch:'feature/nvidia-council-evaluation',
    parent:'79fddf79a452c2a385b596fced604397781316eb',rollback:'dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo'});
  assert.notEqual(PR189_PROTECTION_EXCEPTION,M5_PROTECTION_EXCEPTION);
  assert.throws(()=>verifyMilestone5Exception({expectedSha:SHA,waiver:M5_PROTECTION_EXCEPTION,pr:pr(),commit:commit()}));
});

test('PR189 requires exact reviewed regular merge even after main becomes protected',()=>{
  for(const protectedMain of [false,true]) {
    assert.deepEqual(verifyCandidate(candidate(protectedMain)),[1,2,3,4,5,6,7,8]);
    for(const patch of [
      {reviewedHeadSha:OTHER},{reviewedHeadSha:null},{waiverPr:{...pr(),number:188}},
      {waiverPr:{...pr(),merged:false}},{waiverPr:{...pr(),state:'open'}},
      {waiverPr:{...pr(),merge_commit_sha:OTHER}},
      {waiverPr:{...pr(),base:{ref:'main',repo:{full_name:'other/repo'}}}},
      {waiverPr:{...pr(),base:{ref:'feature'}}},
      {waiverPr:{...pr(),head:{...pr().head,ref:'another-branch'}}},
      {waiverPr:{...pr(),head:{...pr().head,sha:OTHER}}},
      {waiverPr:{...pr(),head:{...pr().head,repo:{full_name:'other/repo'}}}},
      {waiverCommit:{...commit(),sha:OTHER}},
      {waiverCommit:{...commit(),parents:[{sha:OTHER},{sha:HEAD}]}},
      {waiverCommit:{...commit(),parents:[{sha:PR189_RELEASE.parent},{sha:OTHER}]}},
      {waiverCommit:{...commit(),parents:[{sha:PR189_RELEASE.parent}]}},
      {waiverCommit:{...commit(),parents:[...commit().parents,{sha:OTHER}]}},
    ]) assert.throws(()=>verifyCandidate({...candidate(protectedMain),...patch}));
  }
  assert.throws(()=>verifyPR189Exception({expectedSha:SHA,reviewedHeadSha:HEAD,waiver:M5_PROTECTION_EXCEPTION,pr:pr(),commit:commit()}));
});

test('every PR189 main workflow is required; PR-only, failed or newer pending evidence cannot certify it',()=>{
  for(let i=0;i<files.length;i++) {
    const all=runs();
    assert.throws(()=>verifyCandidate({...candidate(),runs:all.filter((_,n)=>n!==i)}));
    for(const patch of [{event:'pull_request'},{head_sha:OTHER},{head_branch:'feature'},
      {conclusion:'failure'},{conclusion:'skipped'},{status:'in_progress',conclusion:null}]) {
      assert.throws(()=>verifyCandidate({...candidate(),runs:all.map((r,n)=>n===i?{...r,...patch}:r)}));
    }
  }
  assert.throws(()=>verifyCandidate({...candidate(),runs:[...runs(),{...runs()[0],id:99,status:'queued',conclusion:null}]}));
  assert.throws(()=>verifyCandidate({...candidate(),mainProtected:undefined}));
});

test('manual PR189 admission reads GitHub evidence only and tolerates its own run during rechecks',async()=>{
  for(const protectedMain of [false,true]) {
    const {fetcher,calls}=github({protected:protectedMain});
    for(let check=0;check<3;check++) assert.deepEqual(await checkCandidate(env(),fetcher),[1,2,3,4,5,6,7,8]);
    assert(calls.every(c=>c.method==='GET'&&c.url.startsWith('https://api.github.com/repos/'+RELEASE_REPOSITORY+'/')));
    assert(calls.some(c=>c.url.endsWith('/pulls/189')));
    assert(!calls.some(c=>c.url.endsWith('/pulls/188')||c.url.includes('api.vercel.com')));
  }
});

test('PR189 confirmation, live checks, reruns and rollback errors fail before any API request',async()=>{
  for(const patch of [
    {AIW_CONFIRM_PRODUCTION_DEPLOY:'NO'},{AIW_MAIN_PROTECTION_WAIVER:'YES'},
    {AIW_MAIN_PROTECTION_WAIVER:undefined},{AIW_RUN_LIVE_CHECKS:'true'},
    {AIW_RUN_LIVE_CHECKS:undefined},{AIW_REVIEWED_PR_HEAD_SHA:''},
    {AIW_REVIEWED_PR_HEAD_SHA:'main'},{ROLLBACK_DEPLOYMENT:'dpl_other'},
    {GITHUB_EVENT_NAME:'workflow_run'},{GITHUB_REF:'refs/heads/feature'},
    {GITHUB_REPOSITORY:'other/repo'},{GITHUB_RUN_ID:''},
    {GITHUB_RUN_ATTEMPT:'2'},{EXPECTED_MAIN_SHA:'main'},{GITHUB_SHA:OTHER},
  ]) {
    const {fetcher,calls}=github();
    await assert.rejects(()=>checkCandidate({...env(),...patch},fetcher));
    assert.equal(calls.length,0);
  }
  const {fetcher}=github();
  await assert.rejects(()=>checkCandidate({...env(),AIW_PR189_PROTECTION_WAIVER:'NO'},fetcher));
});

test('duplicate dispatches and incomplete or forged dispatch evidence block PR189',async()=>{
  for(const body of [
    {total_count:2,workflow_runs:[dispatch(),dispatch(12346)]},
    {total_count:0,workflow_runs:[]},
    {total_count:1,workflow_runs:[]},
    {total_count:0,workflow_runs:[dispatch()]},
    {total_count:2,workflow_runs:[dispatch(),dispatch()]},
    {total_count:101,workflow_runs:[dispatch()]},
    {total_count:1,workflow_runs:[{...dispatch(),id:0}]},
    {total_count:1,workflow_runs:[{...dispatch(),head_sha:OTHER}]},
    {total_count:1,workflow_runs:[{...dispatch(),event:'push'}]},
    {total_count:1,workflow_runs:[{...dispatch(),path:'.github/workflows/other.yml'}]},
    {total_count:1,workflow_runs:[{...dispatch(),head_branch:'feature'}]},
    {total_count:'1',workflow_runs:[dispatch()]},
  ]) {
    const {fetcher,calls}=github({dispatches:body});
    await assert.rejects(()=>checkCandidate(env(),fetcher));
    assert(calls.every(c=>c.method==='GET'));
  }
});

test('PR189 admission refuses moved main, changed reviewed source and failing CI',async()=>{
  for(const option of [{mainSha:OTHER},{pr:{...pr(),head:{...pr().head,sha:OTHER}}},
    {commit:{...commit(),parents:[{sha:OTHER},{sha:HEAD}]}},
    {runs:runs().map((r,i)=>i===7?{...r,conclusion:'failure'}:r)}]) {
    const {fetcher}=github(option);
    await assert.rejects(()=>checkCandidate(env(),fetcher));
  }
});

test('PR189 rollback binds deployment ID and original source, not just READY project metadata',()=>{
  const project={id:'prj_test',accountId:'team_test'};
  const deployment={id:PR189_RELEASE.rollback,projectId:'prj_test',target:'production',
    readyState:'READY',meta:{githubCommitSha:PR189_RELEASE.parent}};
  const expected={team:'team_test',projectId:'prj_test',expectedId:PR189_RELEASE.rollback,rollbackSha:PR189_RELEASE.parent};
  assert.equal(verifyVercelTarget(project,deployment,expected),PR189_RELEASE.rollback);
  for(const patch of [{id:'dpl_other'},{meta:{githubCommitSha:OTHER}},{meta:{}},
    {target:'preview'},{readyState:'ERROR'}]) assert.throws(()=>verifyVercelTarget(project,{...deployment,...patch},expected));
});
