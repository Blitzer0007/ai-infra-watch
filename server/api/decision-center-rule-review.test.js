import test from 'node:test';
import assert from 'node:assert/strict';

test('authenticated Decision Center GET exposes blocked rule reviews and never persists stage state', async t => {
  // Only fictional credentials, deterministic time and a fully replaced transport.
  process.env.SUPABASE_URL='https://fictional-db.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY='fictional-test-key';
  const testAccess='fictional-test-access';
  process.env.AIW_ACCESS_TOKEN=testAccess;
  delete process.env.FINNHUB_API_KEY;
  delete process.env.ALPHA_VANTAGE_API_KEY;
  const now=Date.parse('2026-11-13T18:00:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  const holdings=[
    {id:'fictional-1',symbol:'FICT',quantity:1,average_cost:100,loss_limit_pct:100},
    {id:'fictional-2',symbol:'DEMO',quantity:1,average_cost:100,purchase_date:'2026-11-01',rule_stages:[
      {type:'take_profit',pct:20},{type:'trailing',pct:10,activates_after:'take_profit'}]},
    {id:'fictional-3',symbol:'TEST',quantity:1,average_cost:100,loss_limit_pct:10},
  ];
  const requests=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(String(input));
    requests.push({url:url.href,method:options.method||'GET'});
    assert.equal(options.method||'GET','GET','read must not issue a database mutation');
    const reply=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
    if(url.origin==='https://fictional-db.invalid'){
      if(url.pathname.endsWith('/portfolio_holdings'))return reply(holdings);
      if(['/portfolio_transactions','/forecast_snapshots','/portfolio_signal_family_scorecard'].some(path=>url.pathname.endsWith(path)))return reply([]);
    }
    if(url.origin==='https://query1.finance.yahoo.com' && url.pathname.startsWith('/v8/finance/chart/')){
      const symbol=decodeURIComponent(url.pathname.split('/').at(-1));
      return reply({chart:{result:[{meta:{symbol,regularMarketPrice:100,regularMarketTime:now/1000,currency:'USD',exchangeTimezoneName:'America/New_York',chartPreviousClose:100,
        currentTradingPeriod:{regular:{start:now/1000-3600,end:now/1000+3600}}},
        timestamp:[Date.parse('2026-11-01T12:00:00Z')/1000,Date.parse('2026-11-02T12:00:00Z')/1000],
        indicators:{quote:[{close:[100,140]}],adjclose:[{adjclose:[100,140]}]}}]}});
    }
    throw Error('Unexpected offline destination');
  });
  const {default:handler}=await import('./decision-center.js?offline-rule-review');
  let status,body;
  const response={setHeader(){},status(value){status=value;return this;},json(value){body=value;return this;}};
  await handler({method:'GET',headers:{authorization:'Bearer ' + testAccess}},response);
  assert.equal(status,200);assert.equal(body.ok,true);
  assert.deepEqual(body.rules.states.map(row=>row.state),['invalid-config','incomplete','clear']);
  assert.equal(body.rules.evaluated,1);assert.equal(body.rules.invalidConfig,1);assert.equal(body.rules.incomplete,1);
  assert.equal(body.rules.configurationIssues.length,2);
  assert.equal(body.portfolio.totalTradingPnl,null);
  assert.equal(body.portfolio.openCostBasis,null);
  assert.equal(body.portfolio.cashFlowPnl,null);
  assert.equal(body.portfolio.accountingReconciled,false);
  assert.equal(body.benchmark.SPY.pnl,null);
  assert(body.rules.states[1].issues.some(reason=>reason.includes('coverage')));
  assert(requests.length>0);assert(requests.every(row=>row.method==='GET'));
});
