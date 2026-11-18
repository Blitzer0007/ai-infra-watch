import assert from 'node:assert/strict';
import test from 'node:test';

const envKeys = ['AIW_ACCESS_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
const original = Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
process.env.AIW_ACCESS_TOKEN = 'fictional-m4-access';
process.env.SUPABASE_URL = 'https://fictional-supabase.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fictional-service-key';
const {default:handler} = await import('./forecast-validation.js?milestone4-integration');

const fixed={
  ticker:'FICT',horizon:20,status:'verified',
  created_at:'2026-09-01T12:00:00Z',target_date:'2026-09-29',
  verified_at:'2026-09-30T09:00:00Z',median:5,actual_return:7,
  p25:1,p75:9,p10:-4,p90:14,created_source:'fictional',
  evidence_snapshot:{privateToken:'NEVER-SEND-THIS'},
};
function responseMock(){
  let statusCode=null,body=null;const headers={};
  return {
    res: {setHeader(k,v){headers[k]=v;return this;},status(v){statusCode=v;return this;},json(v){body=v;return this;}},
    output:()=>({statusCode,body,headers}),
  };
}
function request({ticker='FICT',horizon='20',method='GET',token='fictional-m4-access'}={}){
  return {method,query:{ticker,horizon},headers:{authorization:'Bearer '+token}};
}

test('forecast lifecycle cannot be read without valid private access or through writes',async()=>{
  const old=globalThis.fetch;let called=0;
  globalThis.fetch=async()=>{called++;throw new Error('should never execute');};
  try{
    const denied=responseMock();await handler(request({token:'wrong'}),denied.res);
    assert.equal(denied.output().statusCode,401);
    const method=responseMock();await handler(request({method:'POST'}),method.res);
    assert.equal(method.output().statusCode,405);
    const ticker=responseMock();await handler(request({ticker:'BAD&injection'}),ticker.res);
    assert.equal(ticker.output().statusCode,400);
    assert.equal(called,0);
  }finally{globalThis.fetch=old;}
});

test('GET preserves verified metrics and adds only a bounded aggregated lifecycle window',async()=>{
  const old=globalThis.fetch;const urls=[];
  globalThis.fetch=async url=>{
    const parsed=new URL(String(url));urls.push(parsed);
    assert.equal(parsed.hostname,'fictional-supabase.example.test');
    const status=parsed.searchParams.get('status');
    if(status==='eq.verified') return {ok:true,json:async()=>[fixed]};
    assert.equal(status,null);
    assert.equal(parsed.searchParams.get('limit'),'1001');
    assert.equal(parsed.searchParams.get('ticker'),'eq.FICT');
    assert.equal(parsed.searchParams.get('horizon'),'eq.20');
    assert.doesNotMatch(parsed.searchParams.get('select')||'',/evidence_snapshot|privateToken/);
    return {ok:true,json:async()=>[
      fixed,
      {ticker:'FICT',horizon:20,status:'pending',created_at:'2026-01-01T00:00:00Z',target_date:'2026-01-29'},
      {ticker:'FICT',horizon:20,status:'pending',created_at:'2026-10-10T00:00:00Z',target_date:'2099-01-01'},
      {ticker:'FICT',horizon:20,status:'verified',created_at:'2026-01-02T00:00:00Z',target_date:'2026-02-02',verified_at:'2026-02-03T00:00:00Z',median:null,actual_return:4},
    ]};
  };
  try{
    const item=responseMock();await handler(request(),item.res);
    const out=item.output();assert.equal(out.statusCode,200);
    assert.equal(out.body.ok,true);
    assert.equal(out.body.evaluationProtocolStatus,'ready');
    assert.equal(out.body.evaluationProtocol.version,'forecast-evaluation-v1');
    assert.equal(out.body.evaluationProtocol.lifecycle.total,4);
    assert.equal(out.body.evaluationProtocol.lifecycle.pendingDueForReview,1);
    assert.equal(out.body.evaluationProtocol.lifecycle.pendingNotDue,1);
    assert.equal(out.body.evaluationProtocol.lifecycle.verifiedUnscorable,1);
    assert.equal(out.body.evaluationProtocol.lifecycle.independentScorable,1);
    assert.equal(out.body.evaluationProtocol.coverage.completeUniverse,false);
    assert.equal(out.body.evaluationProtocol.decisionEligible,false);
    assert.equal(out.body.globalValidationGate.ready,false);
    assert.doesNotMatch(JSON.stringify(out.body.evaluationProtocol),/FICT|privateToken|NEVER-SEND-THIS|fictional-service-key/);
    assert.equal(urls.length,3);
    assert.match(out.headers['Cache-Control'],/no-store/);
  }finally{globalThis.fetch=old;}
});

test('failed lifecycle read remains unknown without destroying established verified-history response',async()=>{
  const old=globalThis.fetch;globalThis.fetch=async url=>{
    if(new URL(String(url)).searchParams.get('status')==='eq.verified')return {ok:true,json:async()=>[fixed]};
    return {ok:false,status:503,json:async()=>({message:'fictional-private-secret'})};
  };
  try{
    const item=responseMock();await handler(request(),item.res);
    const out=item.output();assert.equal(out.statusCode,200);
    assert.equal(out.body.evaluationProtocolStatus,'unavailable');
    assert.equal(out.body.evaluationProtocol,null);
    assert.equal(out.body.overall.count,1);
    assert.doesNotMatch(JSON.stringify(out.body),/fictional-private-secret/);
  }finally{globalThis.fetch=old;}
});

test.after(()=>{
  for(const key of envKeys) {
    if(original[key]===undefined) delete process.env[key];
    else process.env[key]=original[key];
  }
});
