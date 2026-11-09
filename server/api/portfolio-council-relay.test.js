import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
function run(mode){
  const script=`
    import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import handler from './api/agent-ask.js';
    const mode=${JSON.stringify(mode)},fixture=JSON.parse(readFileSync('aitracker-upload/data/research/council-ui-case.json','utf8'));
    if(mode==='disabled')delete process.env.COUNCIL_DEV_ENABLED;
    if(mode==='production')process.env.VERCEL='1';
    if(mode==='remote')process.env.AI_INFRA_AGENT_URL='https://example.invalid';
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;assert.equal(String(url),'http://127.0.0.1:8001/api/agent-python?task=council');
      assert.equal(options.headers.Authorization,'Bearer fictional-backend');assert.equal(options.redirect,'error');
      assert.deepEqual(JSON.parse(options.body),fixture.request);
      if(mode==='transport')throw Error('fictional-private-upstream');
      if(mode==='error')return new Response('fictional-private-upstream',{status:500});
      if(mode==='oversized')return new Response('x'.repeat(65537));
      if(mode==='malformed')return new Response('fictional-private-upstream');
      if(mode==='extra')return new Response(JSON.stringify({...fixture.result,token:'fictional-private-upstream'}));
      if(mode==='mismatch')return new Response(JSON.stringify({...fixture.result,run_id:'wrong'}));
      return new Response(JSON.stringify(fixture.result));
    };
    let body,status;const headers={};const res={setHeader(k,v){headers[k]=v;},status(v){status=v;return this;},json(v){body=v;return this;}};
    const req={method:mode==='method'?'GET':'POST',query:{task:'council'},headers:{host:'untrusted.invalid',authorization:'Bearer fictional-session'},body:fixture.request};
    if(mode==='auth')delete req.headers.authorization;
    if(mode==='payload')req.body={...req.body,notes:'fictional-private-input'};
    const times=mode==='rate'?13:1;for(let i=0;i<times;i++)await handler(req,res);
    assert.equal(status,{success:200,auth:401,disabled:404,production:404,remote:503,method:405,payload:400,transport:503,error:503,oversized:503,malformed:503,extra:503,mismatch:503,rate:429}[mode]);
    assert.equal(headers['Cache-Control'],'no-store');
    assert.equal(calls,['auth','disabled','production','remote','method','payload'].includes(mode)?0:mode==='rate'?12:1);
    assert.ok(!JSON.stringify(body).includes('fictional-private'));console.log('ok');
  `;
  return execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,COUNCIL_DEV_ENABLED:'true',AIW_ACCESS_TOKEN:'fictional-session',AI_INFRA_AGENT_TOKEN:'fictional-backend',AI_INFRA_AGENT_URL:'http://127.0.0.1:8001'},encoding:'utf8',timeout:10000}).trim();
}
for(const mode of ['success','auth','disabled','production','remote','method','payload','transport','error','oversized','malformed','extra','mismatch','rate'])test('private council relay: '+mode,()=>assert.equal(run(mode),'ok'));
