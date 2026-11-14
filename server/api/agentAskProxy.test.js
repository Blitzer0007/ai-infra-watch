import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { agentBackendToken } from '../../api/agent-ask.js';

test('agent proxy token precedence matches the Python settings contract', () => {
  assert.equal(agentBackendToken({
    AI_INFRA_AGENT_TOKEN: 'infra-token',
    AIW_ACCESS_TOKEN: 'app-token',
    AGENT_API_TOKEN: 'legacy-token',
    CRON_SECRET: 'cron-token',
  }), 'infra-token');
  assert.equal(agentBackendToken({ AIW_ACCESS_TOKEN: 'app-token', AGENT_API_TOKEN: 'legacy-token' }), 'app-token');
  assert.equal(agentBackendToken({ AGENT_API_TOKEN: 'legacy-token' }), 'legacy-token');
  assert.equal(agentBackendToken({ CRON_SECRET: 'cron-token' }), 'cron-token');
  assert.equal(agentBackendToken({}), '');
});

// Isolated children receive only fictional bindings, never copy/read a production credential.
function run({ env = {}, req = {}, mode = 'ok' } = {}) {
  const script = `
    import handler from './api/agent-ask.js';
    const calls=[]; const mode=${JSON.stringify(mode)};
    globalThis.fetch=async(url,init)=>{
      calls.push({url:String(url),method:init.method,headers:init.headers,redirect:init.redirect,body:init.body});
      if(mode==='throw')throw new Error('fictional-private-token https://private.invalid/hidden');
      if(mode==='redirect')return new Response(null,{status:307,headers:{Location:'https://untrusted.invalid'}});
      if(mode==='redirected')return {status:200,redirected:true,json:async()=>({ok:true})};
      return new Response(JSON.stringify({ok:true,mode:'autonomous-mcp'}),{status:mode==='upstream-error'?429:200});
    };
    const headers={};const res={statusCode:0,body:null,setHeader(k,v){headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
    await handler({method:'POST',headers:{authorization:'Bearer fictional-session',host:'untrusted.invalid','x-forwarded-proto':'http','x-forwarded-host':'other.invalid',cookie:'fictional-private-cookie'},body:{question:'fictional research'},...${JSON.stringify(req)}},res);
    process.stdout.write(JSON.stringify({status:res.statusCode,body:res.body,headers,calls}));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, AIW_ACCESS_TOKEN: 'fictional-session', AI_INFRA_AGENT_TOKEN: 'fictional-internal', ...env }, encoding: 'utf8', timeout: 10_000,
  }));
}
const native = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'fictional-preview.vercel.app', VERCEL_PROJECT_PRODUCTION_URL: 'fictional-production.vercel.app' };
test('authenticated native proxy forwards only the internal token to the current deployment', () => {
  const r = run({ env: native });
  assert.equal(r.status, 200); assert.equal(r.body.mode, 'autonomous-mcp');
  assert.equal(r.calls[0].url, 'https://fictional-preview.vercel.app/api/agent-python');
  assert.deepEqual(r.calls[0].headers, { 'Content-Type': 'application/json', Authorization: 'Bearer fictional-internal' });
  assert.deepEqual(JSON.parse(r.calls[0].body), { question: 'fictional research' });
  assert.equal(r.calls[0].redirect, 'error'); assert.equal(r.headers['Cache-Control'], 'no-store');
});
test('fixed explicit backend ignores all incoming origin headers', () => {
  const r = run({ env: { AI_INFRA_AGENT_URL: 'https://approved.example.invalid/' } });
  assert.equal(r.status, 200); assert.equal(r.calls[0].url, 'https://approved.example.invalid/api/agent-python');
});
test('health probes keep their query inside the fixed endpoint and block redirects', () => {
  const r = run({ env: native, req: { method: 'GET', query: { probe_mcp: 'stocks?host=untrusted&path=/other' } } });
  assert.equal(r.status, 200); assert.equal(r.calls[0].method, 'GET'); assert.equal(r.calls[0].redirect, 'error');
  const url = new URL(r.calls[0].url); assert.equal(url.origin, 'https://fictional-preview.vercel.app');
  assert.equal(url.pathname, '/api/agent-python'); assert.equal(url.searchParams.get('probe_mcp'), 'stocks?host=untrusted&path=/other');
});
for (const [name, env] of [['absent', {}], ['bad explicit', { ...native, AI_INFRA_AGENT_URL: 'http://169.254.169.254' }], ['bad native', { ...native, VERCEL_URL: 'untrusted.invalid' }]]) {
  test('no header fallback or upstream call when origin is ' + name, () => { const r = run({ env }); assert.equal(r.status, 503); assert.deepEqual(r.calls, []); });
}
for (const method of ['GET', 'POST']) for (const mode of ['throw', 'redirect', 'redirected']) test(method + ' ' + mode + ' fails closed without raw exception disclosure', () => {
  const r = run({ env: native, req: { method }, mode });
  assert.equal(r.status, 502); assert.equal(r.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(r.body), /fictional-private-token|private.invalid|hidden|fictional-internal/);
  assert.equal(r.headers['Cache-Control'], 'no-store');
});
test('authentication/method rejection precedes destination access; upstream error status remains scoped', () => {
  const rejected = run({ env: native, req: { headers: { authorization: 'Bearer wrong' } } });
  assert.equal(rejected.status, 401); assert.deepEqual(rejected.calls, []);
  const unsupported = run({ req: { method: 'DELETE' } }); assert.equal(unsupported.status, 405); assert.deepEqual(unsupported.calls, []);
  const unconfigured = run({ env: { AIW_ACCESS_TOKEN: '' } }); assert.equal(unconfigured.status, 503); assert.deepEqual(unconfigured.calls, []);
  assert.equal(run({ env: native, mode: 'upstream-error' }).status, 429);
});

for (const method of ['GET', 'POST']) for (const status of [200, 302, 307, 308]) test(`native fetch ${method}/${status} keeps the fixed endpoint and never follows loopback traps`, () => {
  const script = `
    import http from 'node:http';import handler from './api/agent-ask.js';
    let trap=0;let requests=0;let observedToken='';
    const other=http.createServer((req,res)=>{trap++;res.end('{}')});await new Promise(r=>other.listen(0,'127.0.0.1',r));
    const first=http.createServer((req,res)=>{requests++;observedToken=req.headers.authorization;if(req.url!=='/api/agent-python'){trap++;res.end('{}');return;}
      if(${status}===200){req.resume();res.setHeader('Content-Type','application/json');res.end('{"ok":true}');return;}
      req.resume();res.writeHead(${status},{Location:${status === 307 ? "'/unexpected'" : "'http://127.0.0.1:'+other.address().port+'/unexpected'"}});res.end();});
    await new Promise(r=>first.listen(0,'127.0.0.1',r));process.env.AI_INFRA_AGENT_URL='http://127.0.0.1:'+first.address().port;
    const res={statusCode:0,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}};
    try{await handler({method:${JSON.stringify(method)},headers:{authorization:'Bearer fictional-session',host:'untrusted.invalid'},body:{question:'fictional'}},res);
      process.stdout.write(JSON.stringify({status:res.statusCode,trap,requests,observedToken}));}
    finally{await Promise.all([new Promise(r=>first.close(r)),new Promise(r=>other.close(r))]);}
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: process.cwd(), env: { PATH: process.env.PATH, NODE_ENV: 'test', AIW_ACCESS_TOKEN: 'fictional-session', AI_INFRA_AGENT_TOKEN: 'fictional-internal' }, encoding: 'utf8', timeout: 10_000 }));
  assert.deepEqual(result, { status: status === 200 ? 200 : 502, trap: 0, requests: 1, observedToken: 'Bearer fictional-internal' });
});
