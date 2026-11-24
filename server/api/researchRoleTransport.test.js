import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import handler from '../../api/agent-ask.js';
const inputs=JSON.parse(readFileSync('aitracker-upload/data/research/council-benchmark.fictional.json','utf8'));
const fixture=JSON.parse(readFileSync('aitracker-upload/data/research/research-role-response.fictional.json','utf8')).cases[0];
let sequence=0;
const names=['AIW_ACCESS_TOKEN','AI_INFRA_AGENT_TOKEN','AI_INFRA_AGENT_URL','COUNCIL_DEV_ENABLED','RESEARCH_ROLE_HTTP_DEV_ENABLED','VERCEL','NODE_ENV','VERCEL_ENV'];
async function configured(fn){
  const prior=Object.fromEntries(names.map(k=>[k,process.env[k]])),before=globalThis.fetch;
  try{
    for(const k of ['VERCEL','NODE_ENV','VERCEL_ENV'])delete process.env[k];
    Object.assign(process.env,{AIW_ACCESS_TOKEN:'fictional-role-session',AI_INFRA_AGENT_TOKEN:'fictional-role-backend',AI_INFRA_AGENT_URL:'http://127.0.0.1:9123',COUNCIL_DEV_ENABLED:'true',RESEARCH_ROLE_HTTP_DEV_ENABLED:'true'});
    await fn();
  }finally{globalThis.fetch=before;for(const k of names){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}}
}
const request=()=>({method:'POST',headers:{authorization:'Bearer fictional-role-session','x-forwarded-for':`203.0.113.${++sequence}`},query:{task:'council'},body:{...structuredClone(inputs.cases[0].request),mode:'research-v2'}});
async function call(req=request()){
  const out={status:null,body:null};const res={setHeader(){},status(n){out.status=n;return this;},json(value){out.body=value;return this;}};
  await handler(req,res);return out;
}
test('private research mode uses only the configured loopback and strict Python envelope',()=>configured(async()=>{
  let calls=0;globalThis.fetch=async(url,opts)=>{calls++;assert.equal(String(url),'http://127.0.0.1:9123/api/agent-python?task=council');assert.equal(opts.redirect,'error');assert.equal(opts.headers.Authorization,'Bearer fictional-role-backend');assert.equal(JSON.parse(opts.body).mode,'research-v2');return new Response(JSON.stringify(fixture.response));};
  const out=await call();assert.equal(out.status,200);assert.deepEqual(out.body,fixture.response);assert.equal(calls,1);
}));
test('auth production opt-in and target guards prevent all upstream work',()=>configured(async()=>{
  globalThis.fetch=async()=>assert.fail('No upstream work allowed');
  const anon=request();delete anon.headers.authorization;assert.equal((await call(anon)).status,401);
  delete process.env.RESEARCH_ROLE_HTTP_DEV_ENABLED;assert.equal((await call()).status,404);
  process.env.RESEARCH_ROLE_HTTP_DEV_ENABLED='true';process.env.VERCEL='1';assert.equal((await call()).status,404);
  delete process.env.VERCEL;process.env.AI_INFRA_AGENT_URL='https://other.invalid';assert.equal((await call()).status,503);
  process.env.AI_INFRA_AGENT_URL='http://127.0.0.1:9123';const bad=request();bad.body.api_key='fictional-private-key';assert.equal((await call(bad)).status,400);
}));
test('forged selections oversized bodies redirects and provider errors stay redacted',()=>configured(async()=>{
  const forged=structuredClone(fixture.response);forged.result.roles.company.evidence_ids=['outside'];
  for(const response of [()=>new Response(JSON.stringify(forged)),()=>new Response('x'.repeat(65537)),()=>new Response('fictional-private-body',{status:429}),()=>new Response('fictional-private-body',{status:302,headers:{Location:'https://other.invalid'}})]){
    let calls=0;globalThis.fetch=async()=>{calls++;return response();};
    const out=await call();assert([429,503].includes(out.status));assert.equal(calls,1);assert(!JSON.stringify(out).includes('fictional-private-body'));
  }
}));
