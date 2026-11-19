import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchOneTimeRelease, verifyCompletion, M5_HANDOFF_PARENT, M5_ROLLBACK,
} from '../../scripts/dispatch-milestone5-release.mjs';

const REPO = 'Blitzer0007/ai-infra-watch';
const SHA = 'c'.repeat(40), HEAD = 'd'.repeat(40);
const ENV = {
  GITHUB_REPOSITORY: REPO, GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_run', GITHUB_SHA: SHA,
  CI_RUN_ID: '12345', CI_RUN_SHA: SHA, GH_TOKEN: 'fictional-ci-token',
};
const run = (overrides:any = {}) => ({
  id: 12345, path: '.github/workflows/qa-validation.yml',
  head_sha: SHA, head_branch:'main', head_repository:{ full_name: REPO },
  event: 'push', status:'completed', conclusion:'success', ...overrides,
});
const ciRun=(file:string,id:number,overrides:any={})=>({
  id, path:'.github/workflows/'+file, head_sha: SHA, head_branch:'main',
  event:'push', status:'completed', conclusion:'success', ...overrides,
});
const pr=()=>({
  number:178, merged:true, state:'closed', merge_commit_sha:SHA,
  base:{ref:'main'}, head:{ref:'fix/milestone5-one-time-ci-release-20261119',
    sha:HEAD,repo:{full_name:REPO}},
});
const commit=()=>({sha:SHA,parents:[{sha:M5_HANDOFF_PARENT},{sha:HEAD}]});

function mockGithub(opts:any={}) {
  const requests:{url:string,method:string,body?:any}[]=[];
  const fetcher:typeof fetch=async (input, init)=>{
    const url=String(input);
    const method=init?.method||'GET';
    const body=init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({url,method,body});
    if(method==='POST'){
      if(opts.postStatus) return new Response(null,{status:opts.postStatus});
      return new Response(null,{status:204});
    }
    let value:any;
    if(url.endsWith('/actions/runs/12345'))value=run(opts.triggerOverride);
    else if(url.endsWith('/pulls/178'))value={...pr(),...opts.prOverride};
    else if(url.endsWith('/commits/'+SHA))value={...commit(),...opts.commitOverride};
    else if(url.endsWith('/branches/main'))value={commit:{sha:opts.mainSha||SHA},protected:opts.protected??false};
    else if(url.includes('/actions/runs?head_sha='))value={
      total_count:3, workflow_runs:[
        ciRun('frontend-ci.yml',1),ciRun('qa-validation.yml',2,opts.qaOverride),
        ciRun('security-audit.yml',3,opts.securityOverride),
      ],
    };
    else if(url.includes('/actions/workflows/vercel-production-deploy.yml/runs?'))
      value={total_count:opts.existing?1:0,workflow_runs:opts.existing?[{
        head_sha:SHA,event:'workflow_dispatch',
      }]:[]};
    else throw Error('Unexpected GitHub endpoint '+url);
    return new Response(JSON.stringify(value),{status:200,
      headers:{'content-type':'application/json'}});
  };
  return {fetcher,requests};
}

test('one-shot handoff validates exact successful main QA run',()=>{
  assert.equal(verifyCompletion(ENV,run()),SHA);
  const variants=[
    {env:{GITHUB_EVENT_NAME:'pull_request'}},
    {env:{GITHUB_REF:'refs/heads/feature'}},
    {env:{GITHUB_REPOSITORY:'other/repo'}},
    {env:{GITHUB_SHA:HEAD}},
    {env:{CI_RUN_SHA:HEAD}},
    {env:{CI_RUN_ID:'evil'}},
    {evidence:{id:12346}},
    {evidence:{head_sha:HEAD}},
    {evidence:{path:'.github/workflows/evil.yml'}},
    {evidence:{head_branch:'feature'}},
    {evidence:{event:'pull_request'}},
    {evidence:{head_repository:{full_name:'other/repo'}}},
    {evidence:{status:'in_progress'}},
    {evidence:{conclusion:'failure'}},
  ];
  for(const variant of variants) assert.throws(()=>verifyCompletion(
    {...ENV,...variant.env},run(variant.evidence)),/exact-main UI\/API\/DB|triggering run/
  );
});

test('one-shot dispatch delegates to existing gated production workflow after CI',async()=>{
  const {fetcher,requests}=mockGithub();
  assert.deepEqual(await dispatchOneTimeRelease(ENV,fetcher),{status:'dispatched',sha:SHA});
  const writes=requests.filter(r=>r.method==='POST');
  assert.equal(writes.length,1);
  assert(writes[0].url.endsWith('/actions/workflows/vercel-production-deploy.yml/dispatches'));
  assert.deepEqual(writes[0].body,{
    ref:'main',inputs:{
      confirm_production_deploy:'YES',
      confirm_milestone5_unprotected_main_exception:'YES',
      expected_main_sha:SHA,rollback_deployment:M5_ROLLBACK,run_live_checks:'false',
    },
  });
  assert(requests.some(r=>r.url.endsWith('/pulls/178')));
  assert(requests.some(r=>r.url.endsWith('/commits/'+SHA)));
  assert(requests.some(r=>r.url.includes('/actions/runs?head_sha='+SHA)));
});

test('already-requested release does not re-dispatch even on duplicate CI completion',async()=>{
  const {fetcher,requests}=mockGithub({existing:true});
  assert.deepEqual(await dispatchOneTimeRelease(ENV,fetcher),{status:'already-requested',sha:SHA});
  assert.equal(requests.filter(r=>r.method==='POST').length,0);
});

test('any failed required gate or forged PR ancestry prevents release dispatch',async()=>{
  for(const changed of [
    {triggerOverride:{status:'in_progress'}},
    {triggerOverride:{conclusion:'failure'}},
    {triggerOverride:{event:'pull_request'}},
    {prOverride:{number:179}},
    {prOverride:{merged:false}},
    {prOverride:{head:{ref:'some-other-branch',sha:HEAD,repo:{full_name:REPO}}}},
    {prOverride:{merge_commit_sha:HEAD}},
    {commitOverride:{parents:[{sha:'a'.repeat(40)},{sha:HEAD}]}},
    {commitOverride:{parents:[{sha:M5_HANDOFF_PARENT},{sha:'a'.repeat(40)}]}},
    {protected:true,prOverride:{number:179}},
    {qaOverride:{conclusion:'failure'}},
    {securityOverride:{conclusion:'failure'}},
    {mainSha:HEAD},
  ]) {
    const {fetcher,requests}=mockGithub(changed);
    await assert.rejects(()=>dispatchOneTimeRelease(ENV,fetcher));
    assert.equal(requests.filter(r=>r.method==='POST').length,0);
  }
});

test('GitHub dispatch rejection is fail-closed without displaying bodies',async()=>{
  const {fetcher}=mockGithub({postStatus:403});
  await assert.rejects(()=>dispatchOneTimeRelease(ENV,fetcher),
    /One-time production release dispatch rejected \(HTTP 403\)/);
});
