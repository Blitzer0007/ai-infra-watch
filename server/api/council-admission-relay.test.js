import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
function run(mode){
  const script=`
    import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import handler from './api/agent-ask.js';import {councilRequestDigest} from './shared/councilAdmission.js';
    const mode=${JSON.stringify(mode)},f=JSON.parse(readFileSync('qa/fixtures/council-admission.fictional.json','utf8'));
    const payload=f.request;if(mode!=='council')payload.mode='admission-v2';
    if(mode==='production')process.env.VERCEL='1';
    if(mode==='lineage')payload.sources.sec.observations[0].inputs[0].value=999;
    let count=0;
    globalThis.fetch=async(url,options)=>{
      count++;assert.equal(String(url),'http://127.0.0.1:8001/api/agent-python?task=council');assert.deepEqual(JSON.parse(options.body),payload);
      assert.equal(options.headers.Authorization,'Bearer fictional-backend');assert.equal(options.redirect,'error');
      if(mode==='upstream')return new Response('fictional-private-upstream',{status:500});
      const value=mode==='council'?f.result:f.admission,digest=await councilRequestDigest(payload);
      if(mode==='council'){value.admission.request_sha256=digest;value.snapshot_id=digest;}else value.request_sha256=digest;
      if(mode==='digest')value.request_sha256='0'.repeat(64);
      if(mode==='window')value.records[2].publication_window.earliest='2026-02-20T00:00:00Z';
      if(mode==='authority')value.source_authenticity_verified=true;
      return new Response(JSON.stringify(value));
    };
    let status,body;const headers={},res={setHeader(k,v){headers[k]=v;},status(v){status=v;return this;},json(v){body=v;return this;}};
    const req={method:'POST',query:{task:'council'},headers:{authorization:'Bearer fictional-session',host:'untrusted.invalid'},body:payload};
    if(mode==='auth')delete req.headers.authorization;
    await handler(req,res);assert.equal(status,{success:200,council:200,auth:401,production:404,lineage:400,digest:503,window:503,authority:503,upstream:503}[mode]);
    assert.equal(count,['auth','production','lineage'].includes(mode)?0:1);assert.equal(headers['Cache-Control'],'no-store');assert.ok(!JSON.stringify(body).includes('fictional-private'));console.log('ok');
  `;
  return execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,COUNCIL_DEV_ENABLED:'true',AIW_ACCESS_TOKEN:'fictional-session',AI_INFRA_AGENT_TOKEN:'fictional-backend',AI_INFRA_AGENT_URL:'http://127.0.0.1:8001'},encoding:'utf8',timeout:10000}).trim();
}
for(const mode of ['success','council','auth','production','lineage','digest','window','authority','upstream'])test('source admission relay: '+mode,()=>assert.equal(run(mode),'ok'));
