import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL='https://fictional-alert-db.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='fictional-test-key';
const testAccess='fictional-test-access';
process.env.AIW_ACCESS_TOKEN=testAccess;
process.env.TELEGRAM_BOT_TOKEN='fictional-never-send';
process.env.TELEGRAM_CHAT_ID='fictional-never-send';
const {default:handler}=await import('./server-alerts.js?offline-quote-admission');
const response=()=>({code:null,body:null,setHeader(){},status(value){this.code=value;return this;},json(value){this.body=value;return this;}});

test('unauthorized server alert evaluation stops before database, provider or sender access',async t=>{
  const calls=[];
  t.mock.method(globalThis,'fetch',async(...args)=>{calls.push(args);throw Error('transport forbidden');});
  const res=response();
  await handler({method:'GET',headers:{authorization:'Bearer ' + 'fictional-wrong-token'}},res);
  assert.equal(res.code,401);assert.equal(res.body.ok,false);assert.deepEqual(calls,[]);
});

test('stale Yahoo observations cannot trigger delivery or clear an existing active price state',async t=>{
  const now=Date.parse('2026-11-13T16:00:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  const requests=[];
  const fixtureConfig={watchlist:['FICT'],alerts:[
    {symbol:'FICT',type:'above',targetPrice:90,active:true},
    {symbol:'FICT',type:'above',targetPrice:200,active:true}],large_move_enabled:true,large_move_pct:5,catalyst_alerts:false};
  const state={event_key:'price:FICT:above:200',active:true,last_triggered_at:'2026-11-12T16:00:00Z'};
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(String(input));
    requests.push({url:url.href,method:options.method||'GET'});
    assert.equal(options.method||'GET','GET','withheld observations must not write state or send messages');
    const reply=value=>new Response(JSON.stringify(value),{status:200});
    if(url.origin==='https://fictional-alert-db.invalid'){
      if(url.pathname.endsWith('/server_alert_config'))return reply([fixtureConfig]);
      if(url.pathname.endsWith('/portfolio_holdings'))return reply([]);
      if(url.pathname.endsWith('/server_alert_state'))return reply([state]);
    }
    if(url.origin==='https://query1.finance.yahoo.com'){
      const symbol=decodeURIComponent(url.pathname.split('/').at(-1));
      return reply({chart:{result:[{meta:{symbol,currency:'USD',exchangeTimezoneName:'America/New_York',regularMarketPrice:100,
        regularMarketTime:now/1000-3600,chartPreviousClose:80,marketState:'REGULAR',
        currentTradingPeriod:{regular:{start:now/1000-5400,end:now/1000+18000}}}}]}});
    }
    throw Error('Unexpected offline destination');
  });
  const res=response();
  await handler({method:'GET',headers:{authorization:'Bearer ' + testAccess}},res);
  assert.equal(res.code,200);assert.equal(res.body.fresh_quotes,0);assert.equal(res.body.candidate_events,0);assert.equal(res.body.sent,0);
  assert.equal(res.body.unavailable_or_withheld_quotes,res.body.evaluated_symbols);
  assert(requests.length>3);assert(requests.every(request=>request.method==='GET' && !request.url.includes('telegram')));
  assert.equal(state.active,true);
});
