import assert from 'node:assert/strict';
import test from 'node:test';
import companyScale from './company-scale.js';

test('actual history controller retains raw closes and source metadata from a fictional Yahoo response',async()=>{
  const before=globalThis.fetch;let requests=0;
  globalThis.fetch=async url=>{
    requests++;assert.equal(new URL(String(url)).hostname,'query1.finance.yahoo.com');
    return new Response(JSON.stringify({chart:{result:[{meta:{symbol:'FICTCHART',currency:'USD',exchangeName:'Fictional'},
      timestamp:[1795179600,1795438800],indicators:{quote:[{close:[100,102]}],adjclose:[{adjclose:[80,82]}]}}]}}));
  };
  const out={status:null,body:null,headers:{}};
  const res={setHeader(k,v){out.headers[k]=v;},status(n){out.status=n;return this;},json(value){out.body=value;return this;}};
  try{
    await companyScale({method:'GET',query:{action:'history',symbol:'FICTCHART',range:'1y'}},res);
    assert.equal(out.status,200);assert.equal(requests,1);assert.equal(out.headers['Cache-Control'],'no-store');
    assert.equal(out.body.symbol,'FICTCHART');assert.equal(out.body.provider,'yahoo');assert.equal(out.body.currency,'USD');
    assert.equal(out.body.stale,false);assert.deepEqual(out.body.points.map(row=>row.price),[100,102]);
    assert.deepEqual(out.body.points.map(row=>row.adjustedPrice),[80,82]);
  }finally{globalThis.fetch=before;}
});
