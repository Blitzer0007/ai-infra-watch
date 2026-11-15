import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../../api/auth.js';

const keys=['AIW_ACCESS_TOKEN','AGENT_API_TOKEN','CRON_SECRET'];
const fictionalAccess='fictional-only-release-key';
function fixture(t){
 const prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 for(const key of keys)delete process.env[key];
 t.after(()=>{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}});
 const transport=t.mock.method(globalThis,'fetch',async()=>{throw Error('Release access checks must not call any data provider');});
 t.after(()=>assert.equal(transport.mock.callCount(),0));
 return async (req={method:'GET',query:{check:'release'},headers:{}})=>{
  const response={code:null,body:null,headers:{},status(code){this.code=code;return this;},json(body){this.body=body;return this;},setHeader(key,value){this.headers[key]=value;}};
  await handler(req,response);return response;
 };
}

test('release access probe withholds when authentication is not configured and never reads data',async t=>{
 const invoke=fixture(t),res=await invoke();
 assert.equal(res.code,503);assert.equal(res.body.ok,false);
 assert.equal(res.headers['Cache-Control'],'no-store');
});
test('anonymous and invalid release probes return only the private-access denial',async t=>{
 const invoke=fixture(t);process.env.AIW_ACCESS_TOKEN=fictionalAccess;
 for(const headers of [{},{authorization:'Bearer '+'fictional-wrong-key'}]){
  const res=await invoke({method:'GET',query:{check:'release'},headers});
  assert.equal(res.code,401);assert.deepEqual(res.body,{ok:false,error:'Authentication required'});
  assert.equal(res.headers['Cache-Control'],'no-store');
 }
});
test('authenticated release probe returns only a boolean access receipt',async t=>{
 const invoke=fixture(t);process.env.AIW_ACCESS_TOKEN=fictionalAccess;
 const res=await invoke({method:'GET',query:{check:'release'},headers:{authorization:'Bearer '+fictionalAccess}});
 assert.equal(res.code,200);assert.deepEqual(res.body,{ok:true,authenticated:true});
 assert.equal(JSON.stringify(res.body).includes('fictional-only-release-key'),false);
});
test('existing method restrictions and login attempts are preserved',async t=>{
 const invoke=fixture(t);process.env.AIW_ACCESS_TOKEN=fictionalAccess;
 for(const query of [{},{check:'other'},{check:['release']}]){
  const res=await invoke({method:'GET',query,headers:{}});assert.equal(res.code,405);assert.equal(res.headers.Allow,'POST');
 }
 for(let i=0;i<20;i++)assert.equal((await invoke()).code,401);
 const invalid=await invoke({method:'POST',headers:{'x-forwarded-for':'192.0.2.171'},body:{token:''}});
 assert.equal(invalid.code,401);
 const valid=await invoke({method:'POST',headers:{'x-forwarded-for':'192.0.2.171'},body:{token:fictionalAccess}});
 assert.equal(valid.code,200);assert.deepEqual(valid.body,{ok:true,authenticated:true});
});
