import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPrivateHealth, PRODUCTION_ORIGIN } from '../../scripts/private-health-smoke.mjs';

const response = (status, body, type='application/json') => ({
  status, ok:status>=200&&status<300, headers:{get:name=>name==='content-type'?type:null},
  json:async()=>body,
});
test('private smoke never sends an unscoped origin, mutable request, or logs data',async()=>{
  const seen=[];
  const result=await inspectPrivateHealth({token:'test-fictional-secret',
    fetcher:async(url, options)=>{
      seen.push({url,options});
      if(url.endsWith('job-health'))return response(200,{ok:true,jobs:[{privateSecret:'MUST_NOT_LEAK'}]});
      return response(200,{ok:true,overall:{count:1,rawPrivateValue:'MUST_NOT_LEAK'},
        validationGate:{ready:false},evaluationProtocolStatus:'unavailable'});
    },
  });
  assert.equal(result.ready,true);
  assert.equal(seen.length,2);
  for(const {url,options} of seen) {
    assert.ok(url.startsWith(PRODUCTION_ORIGIN+'/api/'));
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    assert.equal(options.cache,'no-store');
    assert.equal(options.headers.Authorization,'Bearer test-fictional-secret');
    assert.equal(url.includes('?'),false);
  }
  assert.doesNotMatch(JSON.stringify(result),/test-fictional-secret|MUST_NOT_LEAK|rawPrivateValue/);
});
test('missing credentials and unexpected origin fail closed before fetch',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('should never run');};
  await assert.rejects(inspectPrivateHealth({token:'',fetcher}),/required/);
  await assert.rejects(inspectPrivateHealth({token:'secret',origin:'https://evil.example',fetcher}),/origin/);
  assert.equal(calls,0);
});
test('denied, platform HTML, transport and malformed bodies do not pass',async()=>{
  const denied=await inspectPrivateHealth({token:'test',fetcher:async()=>response(401,{error:'secret'})});
  assert.equal(denied.ready,false);
  assert.deepEqual(Object.values(denied.checks),['access-denied','access-denied']);
  const platform=await inspectPrivateHealth({token:'test',fetcher:async()=>response(200,null,'text/html')});
  assert.equal(platform.ready,false);
  assert.deepEqual(Object.values(platform.checks),['unexpected-content','unexpected-content']);
  const offline=await inspectPrivateHealth({token:'test',fetcher:async()=>{throw Error('redacted private details')}});
  assert.equal(offline.ready,false);
  assert.doesNotMatch(JSON.stringify(offline),/redacted private details/);
  const malformed=await inspectPrivateHealth({token:'test',fetcher:async()=>response(200,{ok:true,jobs:'not-an-array'})});
  assert.equal(malformed.ready,false);
});

test('partial success and no-content statuses cannot certify private health',async()=>{
  for (const status of [202,204,206]) {
    let jsonCalls=0;
    const result=await inspectPrivateHealth({token:'fictional-test-token',
      fetcher:async()=>({
        ...response(status,{ok:true,jobs:[],overall:{},validationGate:{},evaluationProtocolStatus:'ready'}),
        json:async()=>{jsonCalls++;return {ok:true,jobs:[],overall:{},validationGate:{},evaluationProtocolStatus:'ready'};},
      }),
    });
    assert.equal(result.ready,false);
    assert.deepEqual(Object.values(result.checks),['endpoint-unavailable','endpoint-unavailable']);
    assert.equal(jsonCalls,0);
  }
});
