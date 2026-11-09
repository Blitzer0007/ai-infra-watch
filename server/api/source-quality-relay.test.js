import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sourceQualityPayload,sourceQualityDevelopmentEnabled} from '../services/sourceQualityInput.js';

test('development review transport rejects private fields, overrides and oversized shapes',()=>{
  const base={run_id:'fictional',assessed_at:'2026-11-09T00:00:00Z',symbols:['NVDA'],observations:[]};
  assert.equal(sourceQualityPayload(base),base);
  for(const extra of [{policy:{}},{api_key:'fictional'},{question:'send alert'}])assert.equal(sourceQualityPayload({...base,...extra}),null);
  for(const row of [{notes:'private'},{constructor:'private'},{price:'100'},{price:Infinity},{stale:'false'},{source_mode:'x'.repeat(11)}])assert.equal(sourceQualityPayload({...base,observations:[row]}),null);
  assert.equal(sourceQualityPayload({...base,symbols:Array(6).fill('NVDA')}),null);
  assert.equal(sourceQualityPayload({...base,observations:Array(16).fill({})}),null);
  assert.equal(sourceQualityDevelopmentEnabled({SOURCE_QUALITY_DEV_ENABLED:'true'}),true);
  for(const env of [{},{SOURCE_QUALITY_DEV_ENABLED:'true',VERCEL:'1'},{SOURCE_QUALITY_DEV_ENABLED:'true',NODE_ENV:'production'},{SOURCE_QUALITY_DEV_ENABLED:'true',VERCEL_ENV:'production'}])assert.equal(sourceQualityDevelopmentEnabled(env),false);
});

function run(mode){
  const script=`
    import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import handler from './api/agent-ask.js';
    const mode=${JSON.stringify(mode)};const fixture=JSON.parse(readFileSync('aitracker-upload/data/research/source-quality-ui-cases.json','utf8'))[0];
    if(mode==='disabled')delete process.env.SOURCE_QUALITY_DEV_ENABLED;
    if(mode==='production')process.env.VERCEL='1';
    if(mode==='remote')process.env.AI_INFRA_AGENT_URL='https://example.invalid';
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;assert.equal(String(url),'http://127.0.0.1:8001/api/agent-python?task=source-quality');
      assert.equal(options.headers.Authorization,'Bearer fictional-backend');assert.equal(options.redirect,'error');
      assert.deepEqual(JSON.parse(options.body),fixture.request);
      if(mode==='transport')throw new Error('fictional-private-upstream');
      if(mode==='error')return new Response('fictional-private-upstream',{status:500});
      if(mode==='oversized')return new Response('x'.repeat(262145));
      if(mode==='malformed')return new Response('fictional-private-upstream');
      if(mode==='extra')return new Response(JSON.stringify({...fixture.result,token:'fictional-private-upstream'}));
      return new Response(JSON.stringify(fixture.result));
    };
    let body,status;const headers={};const res={setHeader(k,v){headers[k]=v;},status(v){status=v;return this;},json(v){body=v;return this;}};
    const req={method:mode==='method'?'GET':'POST',query:{task:mode==='unknown'?'other':'source-quality'},headers:{host:'untrusted.example',authorization:'Bearer fictional-session'},body:fixture.request};
    if(mode==='auth')delete req.headers.authorization;
    if(mode==='payload')req.body={...req.body,notes:'fictional-private-input'};
    const times=mode==='rate'?13:1;for(let i=0;i<times;i++)await handler(req,res);
    const expected={auth:401,disabled:404,production:404,remote:503,method:405,unknown:400,payload:400,transport:503,error:503,oversized:503,malformed:503,extra:503,rate:429,success:200}[mode];
    assert.equal(status,expected);assert.equal(headers['Cache-Control'],'no-store');
    if(['auth','disabled','production','remote','method','unknown','payload'].includes(mode))assert.equal(calls,0);
    else assert.equal(calls,mode==='rate'?12:1);
    assert.ok(!JSON.stringify(body).includes('fictional-private'));
    if(mode==='success')assert.deepEqual(body,fixture.result);
    console.log('ok');
  `;
  return execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,SOURCE_QUALITY_DEV_ENABLED:'true',AIW_ACCESS_TOKEN:'fictional-session',AI_INFRA_AGENT_TOKEN:'fictional-backend',AI_INFRA_AGENT_URL:'http://127.0.0.1:8001'},encoding:'utf8',timeout:10000}).trim();
}
for(const mode of ['success','auth','disabled','production','remote','method','unknown','payload','transport','error','oversized','malformed','extra','rate'])test('source-quality relay: '+mode,()=>assert.equal(run(mode),'ok'));
