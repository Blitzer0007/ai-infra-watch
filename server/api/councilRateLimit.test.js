import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import handler from '../../api/agent-ask.js';

test('council gateway retains its twelve-request minute cap independently of model/evidence cases',async()=>{
  const names=['AIW_ACCESS_TOKEN','AI_INFRA_AGENT_TOKEN','AI_INFRA_AGENT_URL','COUNCIL_DEV_ENABLED','VERCEL','VERCEL_ENV','NODE_ENV'];
  const prior=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const fetchBefore=globalThis.fetch,clockBefore=Date.now;
  const fixture=JSON.parse(readFileSync('aitracker-upload/data/research/council-ui-case.json','utf8'));
  let upstreamCalls=0;
  try{
    for(const name of ['VERCEL','VERCEL_ENV','NODE_ENV'])delete process.env[name];
    process.env.AIW_ACCESS_TOKEN='fictional-council-rate-session';
    process.env.AI_INFRA_AGENT_TOKEN='fictional-council-rate-backend';
    process.env.AI_INFRA_AGENT_URL='http://127.0.0.1:9123';
    process.env.COUNCIL_DEV_ENABLED='true';
    let now=1795420800000;Date.now=()=>now;
    globalThis.fetch=async(input)=>{
      assert.equal(String(input),'http://127.0.0.1:9123/api/agent-python?task=council');
      upstreamCalls++;
      return new Response(JSON.stringify(fixture.result),{headers:{'Content-Type':'application/json'}});
    };
    const request=()=>({method:'POST',headers:{authorization:'Bearer '+process.env.AIW_ACCESS_TOKEN,'x-forwarded-for':'203.0.113.188'},query:{task:'council'},body:fixture.request});
    async function call(){
      const output={status:null,body:null};
      const response={setHeader(){},status(value){output.status=value;return this;},json(value){output.body=value;return this;}};
      await handler(request(),response);return output;
    }
    for(let i=0;i<12;i++)assert.equal((await call()).status,200);
    for(let i=0;i<2;i++)assert.deepEqual(await call(),{status:429,body:{error:'Review request limit reached'}});
    assert.equal(upstreamCalls,12);
    now+=60000;
    assert.equal((await call()).status,200);assert.equal(upstreamCalls,13);
  }finally{
    globalThis.fetch=fetchBefore;Date.now=clockBefore;
    for(const name of names){if(prior[name]===undefined)delete process.env[name];else process.env[name]=prior[name];}
  }
});
