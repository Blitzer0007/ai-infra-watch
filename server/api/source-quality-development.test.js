import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

for(const mode of ['success','parsed','auth','disabled','method','type','large','malformed','next'])test('development source transport: '+mode,()=>{
  const script=`
    import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
    import {developmentSourceQualityMiddleware} from './server/developmentSourceQuality.js';
    const mode=${JSON.stringify(mode)},fixture=JSON.parse(readFileSync('aitracker-upload/data/research/source-quality-ui-cases.json','utf8'))[0];
    let fetched=0,read=0,next=0,body='';const headers={};
    globalThis.fetch=async()=>{fetched++;return new Response(JSON.stringify(fixture.result));};
    if(mode==='disabled')delete process.env.SOURCE_QUALITY_DEV_ENABLED;
    const req={url:mode==='next'?'/api/live-data':'/api/agent-ask?task=source-quality',method:mode==='method'?'GET':'POST',headers:{'content-type':mode==='type'?'text/plain':'application/json',authorization:'Bearer fictional-session'},async *[Symbol.asyncIterator](){read++;yield Buffer.from(mode==='large'?'x'.repeat(65537):mode==='malformed'?'fictional-private-body':JSON.stringify(fixture.request));}};
    if(mode==='auth')delete req.headers.authorization;if(mode==='parsed')req.body=fixture.request;
    const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(value){body=value;}};
    await developmentSourceQualityMiddleware()(req,res,()=>next++);
    if(mode==='next'){assert.equal(next,1);assert.equal(read,0);assert.equal(fetched,0);}
    else{
      const expected={success:200,parsed:200,auth:401,disabled:404,method:405,type:415,large:413,malformed:400}[mode];
      assert.equal(res.statusCode,expected);assert.equal(headers['Cache-Control'],'no-store');
      assert.ok(!body.includes('fictional-private-body'));
      assert.equal(fetched,['success','parsed'].includes(mode)?1:0);
      assert.equal(read,['success','large','malformed'].includes(mode)?1:0);
    }
    console.log('ok');
  `;
  const output=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,SOURCE_QUALITY_DEV_ENABLED:'true',AIW_ACCESS_TOKEN:'fictional-session',AI_INFRA_AGENT_TOKEN:'fictional-backend',AI_INFRA_AGENT_URL:'http://127.0.0.1:8001'},encoding:'utf8',timeout:10000});
  assert.equal(output.trim(),'ok');
});
