import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {evaluateExistingRules} from '../../shared/portfolioRuleEvaluation.js';
import {ruleDistance} from '../../server/api/decision-center.js';
import {evaluateStoredHoldingRules} from './portfolioRuleEvaluation';
import * as sharedMath from '../../shared/portfolioRuleMath.js';
import * as serverMath from '../../server/utils/portfolioRuleMath.js';

const fixture=JSON.parse(readFileSync('scripts/fixtures/portfolio-rule-parity.fictional.json','utf8'));
const NOW=Date.parse('2026-11-14T12:00:00Z');
function camel(h:any){return {averageCost:h.average_cost,purchaseDate:h.purchase_date,lossLimitPct:h.loss_limit_pct,
  exitRuleType:h.exit_rule_type,exitRuleValue:h.exit_rule_value,brokerAlertPrices:h.broker_alert_prices,brokerAlerts:h.broker_alerts,
  ruleStages:h.rule_stages,ruleStageState:h.rule_stage_state};}
function freeze(v:any):any{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}

for(const c of fixture.cases)test('pre-extraction golden / server wrapper / client adapter: '+c.id,()=>{
  assert.equal(fixture.sourceCommit,'6221a7ad967c4ea9f185a763a59e410395baaf87');
  assert.deepEqual(evaluateExistingRules(c.holding,c.quote,c.history,c.nowMs),c.expected);
  assert.deepEqual(ruleDistance(c.holding,c.quote,c.history,new Date(c.nowMs)),c.expected);
  assert.deepEqual(evaluateStoredHoldingRules(camel(c.holding),c.quote,c.history,c.nowMs),c.expected);
});

test('frozen holding, history, quote and staged state remain unchanged; output is independently owned',()=>{
  const c=structuredClone(fixture.cases.find((c:any)=>c.id==='staged-active-trailing'));
  c.holding.rule_stage_state={unrelated:{value:1}};
  const before=JSON.stringify(c);freeze(c);
  const result=evaluateExistingRules(c.holding,c.quote,c.history,c.nowMs);
  assert.equal(JSON.stringify(c),before);assert.equal(result.stageStateDirty,true);
  result.stageState.unrelated.value=2;assert.equal(c.holding.rule_stage_state.unrelated.value,1);
});
test('no-stages results no longer alias the caller stored-state object',()=>{
  const holding=freeze({average_cost:100,rule_stage_state:{stage_1:{peak:120}}});
  const a=evaluateExistingRules(holding,{price:100},{points:[]},NOW);
  a.stageState.stage_1.peak=999;
  assert.equal(holding.rule_stage_state.stage_1.peak,120);
  assert.equal(evaluateExistingRules(holding,{price:100},{points:[]},NOW).stageState.stage_1.peak,120);
});
test('clock injection is deterministic across calendar-day and DST boundaries',()=>{
  const h={average_cost:100,purchase_date:'2026-03-07',exit_rule_type:'time-limit',exit_rule_value:5};
  for(const [at,remaining,state] of [['2026-03-08T12:00:00Z',4,'clear'],['2026-03-11T23:59:59Z',1,'near'],['2026-03-12T00:00:00Z',0,'breached']] as const){
    const r=evaluateExistingRules(h,{price:100},{points:[]},Date.parse(at));
    assert.equal(r.nearest.distancePct,remaining);assert.equal(r.state,state);assert.equal(r.nearest.unit,'days');
  }
});
test('the shared boundary cannot silently substitute the host clock',()=>{
  const oldNow=Date.now,oldFetch=globalThis.fetch;
  Date.now=()=>{throw Error('ambient clock forbidden');};globalThis.fetch=()=>{throw Error('network forbidden');};
  try{const c=fixture.cases.find((c:any)=>c.id==='legacy-time');assert.deepEqual(evaluateExistingRules(c.holding,c.quote,c.history,c.nowMs),c.expected);}
  finally{Date.now=oldNow;globalThis.fetch=oldFetch;}
  for(const value of [undefined,null,NaN,Infinity,'2026-11-14',true,1.5,8640000000000001,8640000000000000,-8640000000000000])assert.equal(evaluateExistingRules({average_cost:100},{price:100},{points:[]},value),null);
});
test('compatibility wrapper retains explicit Date, ISO string and timestamp forms',()=>{
  const c=fixture.cases.find((c:any)=>c.id==='legacy-time');
  for(const clock of [new Date(c.nowMs),new Date(c.nowMs).toISOString(),c.nowMs])assert.deepEqual(ruleDistance(c.holding,c.quote,c.history,clock),c.expected);
  assert.equal(ruleDistance(c.holding,c.quote,c.history,new Date('invalid')),null);
});
test('future/invalid history is ignored and input ordering is retained',()=>{
  const history={points:[{date:'2026-11-15',price:1000},{date:'2026-11-01',price:100},{date:'2026-02-31',price:900}]};
  const before=JSON.stringify(history);
  const r=evaluateExistingRules({average_cost:100,purchase_date:'2026-11-01',exit_rule_type:'trailing-stop',exit_rule_value:10},{price:100},history,NOW);
  assert.equal(r.rules[0].target,90);assert.equal(JSON.stringify(history),before);
});
test('legacy loss, stop, time and take-profit precedence and stage-resume values are retained',()=>{
  const c=fixture.cases.find((c:any)=>c.id==='staged-active-trailing'),first=evaluateExistingRules(c.holding,c.quote,c.history,c.nowMs);
  const second=evaluateExistingRules({...c.holding,rule_stage_state:first.stageState},c.quote,c.history,c.nowMs);
  assert.deepEqual(second.stageState,first.stageState);assert.equal(second.stageStateDirty,false);assert.equal(second.state,'breached');
  assert.equal(second.rules.find((r:any)=>r.type==='trailing stop').target,119);
});
test('small math helpers are the same functions through their server compatibility exports',()=>{
  for(const key of ['optionalFiniteNumber','allocationLimits','peakDrawdownPct','scenarioParameters','ruleProximityText'])assert.equal(sharedMath[key],serverMath[key]);
  assert.equal(sharedMath.allocationLimits({max_allocation_pct:null}).maximum,null);
  assert.equal(sharedMath.allocationLimits({max_allocation_pct:0}).maximum,0);
});
test('exact three-percent gaps are near, and immediately outside values are clear without an epsilon',()=>{
  for(const [price,target,direction,state] of [
    [100,103,'above','near'],[100,102.99999999999999,'above','near'],[100,103.00000000000001,'above','clear'],
    [103,100,'below','near'],[102.99999999999999,100,'below','near'],[103.00000000000001,100,'below','clear'],
    [80,82.4,'above','near'],[80,82.39999999999999,'above','near'],[80,82.40000000000002,'above','clear'],
    [82.4,80,'below','near'],[82.39999999999999,80,'below','near'],[82.40000000000002,80,'below','clear'],
  ] as const){
    const holding={average_cost:100,broker_alerts:[{price:target,direction}]};
    const result=evaluateExistingRules(holding,{price},{points:[]},NOW);
    assert.equal(result.state,state);assert.deepEqual(ruleDistance(holding,{price},{points:[]},new Date(NOW)),result);
    assert.deepEqual(evaluateStoredHoldingRules(camel(holding),{price},{points:[]},NOW),result);
  }
});
test('browser bundle imports no request handler, server credentials, storage, or transport',()=>{
  const result=buildSync({entryPoints:['src/utils/portfolioRuleEvaluation.ts'],bundle:true,platform:'browser',format:'iife',globalName:'PortfolioRules',write:false,target:'es2022'});
  const code=result.outputFiles[0].text;
  assert(code.includes('evaluateStoredHoldingRules'));
  for(const marker of ['SUPABASE_SERVICE_ROLE_KEY','process.env','authFetch','/api/','node:','localStorage','sessionStorage'])assert(!code.includes(marker),marker);
  const c=fixture.cases[0],h:any={...camel(c.holding),notes:'fictional-private-notes',decisionThesis:'fictional-private-thesis'};
  Object.defineProperty(h,'apiKey',{get(){throw Error('unrelated input read');}});
  assert(!JSON.stringify(evaluateStoredHoldingRules(h,c.quote,c.history,c.nowMs)).includes('fictional-private'));
});
