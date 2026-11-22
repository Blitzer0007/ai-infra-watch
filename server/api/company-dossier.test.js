import test from 'node:test';
import assert from 'node:assert/strict';
import companyScale from './company-scale.js';
test('dossier action requires private access and a GET before any external acquisition',async()=>{
  const original=process.env.AIW_ACCESS_TOKEN,before=globalThis.fetch;process.env.AIW_ACCESS_TOKEN='fictional-dossier-session';let calls=0;
  globalThis.fetch=async()=>{calls++;throw Error('No transport permitted');};
  try{
    for(const [method,authorization,status] of [['GET','',401],['POST','Bearer '+process.env.AIW_ACCESS_TOKEN,405],['GET','Bearer '+process.env.AIW_ACCESS_TOKEN,400]]){
      const output={};const res={setHeader(k,v){output[k]=v;},status(v){output.status=v;return this;},json(v){output.body=v;return this;}};
      await companyScale({method,query:{action:'dossier',symbol:'../invalid'},headers:{authorization}},res);
      assert.equal(output.status,status);assert.equal(output['Cache-Control'],'private, no-store');
    }
    assert.equal(calls,0);
  }finally{globalThis.fetch=before;if(original===undefined)delete process.env.AIW_ACCESS_TOKEN;else process.env.AIW_ACCESS_TOKEN=original;}
});
