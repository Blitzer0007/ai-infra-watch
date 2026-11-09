import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
function run(mode){
const script=`
 import assert from 'node:assert/strict';
 const {default:handler}=await import('./server/api/forecast-validation.js');
 const mode=${JSON.stringify(mode)};const calls=[];
 const row=(ticker,horizon)=>({ticker,horizon,status:'verified',created_at:'2026-01-01T00:00:00Z',target_date:horizon===5?'2026-01-08':'2026-01-29',median:1,actual_return:1,verified_at:'2026-01-30T00:00:00Z',p10:-1,p25:0,p75:2,p90:3});
 const globalRows=Array.from({length:50},(_,i)=>row('F'+i,i<25?5:20));
 global.fetch=async(url,options)=>{calls.push(url);assert.equal(options.method||'GET','GET');assert.equal(new URL(url).origin,'https://fixture.invalid');
  if(mode==='transport')throw Error('private-upstream-detail');
  if(mode==='http')return {ok:false,json:async()=>({message:'private-upstream-detail'})};
  if(mode==='json')return {ok:true,json:async()=>{throw Error('private-upstream-detail')}};
  if(mode==='shape')return {ok:true,json:async()=>({error:'private-upstream-detail'})};
  return {ok:true,json:async()=>new URL(url).searchParams.get('horizon')==='in.(5,20)'?globalRows:[row('FICT',20)]};
 };
 let status=200,body;const headers={};const res={setHeader:(k,v)=>headers[k]=v,status(n){status=n;return this;},json(v){body=v;return this;}};
 const query={ticker:'FICT',horizon:'20'};
 if(mode==='horizon')query.horizon='0x14';if(mode==='array')query.horizon=['20'];if(mode==='ticker')query.ticker=['FICT'];
 await handler({method:mode==='method'?'POST':'GET',query,headers:{authorization:mode==='auth'?'Bearer wrong':'Bearer fictional-session'}},res);
 const expected={success:200,auth:401,method:405,horizon:400,array:400,ticker:400,transport:500,http:500,json:500,shape:500}[mode];assert.equal(status,expected);assert(!JSON.stringify(body).includes('private-upstream'));
 if(['auth','method','horizon','array','ticker'].includes(mode))assert.equal(calls.length,0);
 if(mode==='success'){assert.equal(calls.length,2);assert.equal(new URL(calls[0]).searchParams.get('horizon'),'eq.20');assert.equal(new URL(calls[1]).searchParams.get('horizon'),'in.(5,20)');assert.equal(new URL(calls[1]).searchParams.has('ticker'),false);assert.equal(body.globalValidationGate.ready,true);assert.equal(body.globalValidationGate.independent5D,25);assert.equal(body.globalValidationGate.independent20D,25);assert.equal(body.overall.count,1);assert.deepEqual(body.globalScope.horizons,[5,20]);assert.equal(body.contractVersion,'forecast-summary-v2');}
 console.log('ok');
`;
return execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{PATH:process.env.PATH,AIW_ACCESS_TOKEN:'fictional-session',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fictional-database-key'},encoding:'utf8',timeout:10000}).trim();
}
for(const mode of ['success','auth','method','horizon','array','ticker','transport','http','json','shape'])test('read-only forecast summary endpoint: '+mode,()=>assert.equal(run(mode),'ok'));
