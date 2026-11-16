import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlertInboxHandler } from './alert-inbox.js';
const response=()=>({headers:{},code:200,payload:null,setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.payload=v;return this;}});
test('all write methods are denied before configuration or data access',async()=>{
  let reads=0;const handler=createAlertInboxHandler({authorize:()=>{throw new Error('must not authorize writes');},configuration:()=>{throw new Error('must not load config');},readPage:()=>{reads++;}});
  for(const method of ['POST','PUT','PATCH','DELETE','HEAD']){const res=response();await handler({method},res);assert.equal(res.code,405);assert.equal(res.headers.Allow,'GET');}
  assert.equal(reads,0);
});
test('unauthorized reads never load credentials or a ledger',async()=>{
  const handler=createAlertInboxHandler({authorize:(_req,res)=>{res.status(401).json({ok:false});return false;},configuration:()=>{throw new Error('private configuration accessed');},readPage:()=>{throw new Error('private ledger accessed');}});
  const res=response();await handler({method:'GET'},res);assert.equal(res.code,401);assert.equal(res.headers['Cache-Control'],'no-store');
});
test('authorized route passes query to select-only service and returns normalized data',async()=>{
  const handler=createAlertInboxHandler({authorize:()=>true,configuration:()=>({recipient:'fixture'}),readPage:async({query})=>{assert.equal(query.days,'7');return {ok:true,items:[]};}});
  const res=response();await handler({method:'GET',query:{days:'7'}},res);assert.equal(res.code,200);assert.deepEqual(res.payload,{ok:true,items:[]});
});
test('errors never reveal destination, credentials, raw database errors or query text',async()=>{
  for(const status of [400,503]){const handler=createAlertInboxHandler({authorize:()=>true,configuration:()=>({}),readPage:async()=>{throw Object.assign(new Error('private-destination private-token SQL text'),{status});}});const res=response();await handler({method:'GET'},res);assert.equal(res.code,status);assert.doesNotMatch(JSON.stringify(res.payload),/private|SQL/);}
});
