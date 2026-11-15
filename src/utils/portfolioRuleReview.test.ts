import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reviewHoldingRules } from '../../shared/portfolioRuleReview.js';
import { reviewStoredHoldingRules } from './portfolioRuleEvaluation';

const NOW=Date.parse('2026-11-14T12:00:00Z');
const quote={price:100};
const history={points:[{date:'2026-11-01',price:100},{date:'2026-11-02',price:140}],
  coverage:{status:'complete',startDate:'2026-11-01',endDate:'2026-11-14'}};
const review=(holding:any,q:any=quote,h:any={},at:any=NOW)=>reviewHoldingRules(holding,q,h,at);
const camel=(h:any)=>({averageCost:h.average_cost,purchaseDate:h.purchase_date,lossLimitPct:h.loss_limit_pct,
  exitRuleType:h.exit_rule_type,exitRuleValue:h.exit_rule_value,brokerAlertPrices:h.broker_alert_prices,
  brokerAlerts:h.broker_alerts,brokerAlertsReviewRequired:h.broker_alerts_review_required,ruleStages:h.rule_stages});

test('valid retained numerical outputs survive strict admission without stage persistence',()=>{
  const fixture=JSON.parse(readFileSync('scripts/fixtures/portfolio-rule-parity.fictional.json','utf8'));
  for(const c of fixture.cases.filter((c:any)=>!['invalid-price','invalid-staged-stop-fallback','future-history-excluded'].includes(c.id))){
    const h={...c.history,coverage:history.coverage};
    const result=review(c.holding,c.quote,h,c.nowMs);
    assert.deepEqual(result,{...c.expected,issues:[],stageStateDirty:false},c.id);
    assert.deepEqual(reviewStoredHoldingRules(camel(c.holding),c.quote,h,c.nowMs),result,c.id+' client parity');
  }
});
for(const holding of [null,[],{loss_limit_pct:0},{loss_limit_pct:100},{loss_limit_pct:true},
  {exit_rule_type:'future_trailing_fake',exit_rule_value:10},{exit_rule_value:10},
  {exit_rule_type:[]},{exit_rule_type:'trailing_stop',exit_rule_value:0},
  {exit_rule_type:'time_limit',exit_rule_value:1.5},
  {rule_stages:{}},{rule_stages:[{type:'stop',pct:100}]},
  {rule_stages:[{type:'take_profit',pct:10,fraction:0}]},
  {rule_stages:[{type:'take_profit',pct:10,fraction:1.1}]},
  {rule_stages:[{type:'take_profit',pct:10},{type:'take_profit',pct:20}]},
  {rule_stages:[{type:'trailing',pct:10,activates_after:'stop'}]},
  {rule_stages:[{type:'not_trailing',pct:10}]},
  {broker_alerts:[{price:100,direction:'up'}]}, {broker_alerts:[{price:0,direction:'above'}]},
  {broker_alert_prices:[-1]},{broker_alerts_review_required:'false'},
  {broker_alerts:[],broker_alert_prices:[100]},
  {broker_alerts:[{price:110,direction:'above'}],broker_alert_prices:[100]}]) {
  test('malformed configuration cannot look clear or unconfigured: '+JSON.stringify(holding),()=>{
    const result=review(holding);
    assert.equal(result.state,'invalid-config');assert(result.issues.length>0);
    assert.deepEqual(result.rules,[]);assert.equal(result.stageStateDirty,false);
    if(holding&&!Array.isArray(holding)) assert.deepEqual(reviewStoredHoldingRules(camel(holding),quote,{},NOW),result);
  });
}
for(const [holding, q] of [
  [{loss_limit_pct:10},quote],
  [{average_cost:100,broker_alerts_review_required:true,broker_alerts:[{price:80,direction:'below'}]},quote],
  [{exit_rule_type:'time_limit',exit_rule_value:5,purchase_date:'2026-02-31'},quote],
  [{exit_rule_type:'time_limit',exit_rule_value:5,purchase_date:'2026-11-15'},quote],
  [{average_cost:100,loss_limit_pct:10},{price:null}],
  [{exit_rule_type:'custom'},quote],[{exit_rule_type:'price_stop',exit_rule_value:10},quote],
  [{average_cost:1e-300,loss_limit_pct:10},{price:1e308}],
]) test('missing inputs or unimplemented monitoring remains incomplete: '+JSON.stringify(holding),()=>{
  assert.equal(review(holding,q).state,'incomplete');
});
test('missing and zero are distinct; empty configuration is unconfigured, not disabled or clear',()=>{
  assert.equal(review({}).state,'no-rule');assert.equal(review({loss_limit_pct:null}).state,'no-rule');
  assert.equal(review({loss_limit_pct:0}).state,'invalid-config');
  for(const value of [undefined,null,NaN,Infinity,-1,0.5]) assert.equal(reviewHoldingRules({},quote,{},value).state,'incomplete');
});
test('partial, duplicate, future and malformed history cannot admit trailing review',()=>{
  const holding={purchase_date:'2026-11-01',exit_rule_type:'trailing_stop',exit_rule_value:10};
  for(const h of [{points:history.points},{...history,coverage:{...history.coverage,status:'partial'}},
    {...history,coverage:{...history.coverage,startDate:'2026-11-02'}},
    {...history,coverage:{...history.coverage,endDate:'2026-11-13'}},
    {...history,points:[]},{...history,points:[...history.points,history.points[0]]},
    {...history,points:[...history.points,{date:'2026-11-15',price:200}]},
    {...history,points:[{date:'2026-02-31',price:100}]},
    {...history,points:[{date:'2026-11-01',price:true}]}]) assert.equal(review(holding,quote,h).state,'incomplete');
  const result=review(holding,quote,history);
  assert.equal(result.state,'breached');assert.equal(result.nearest.target,126);
});
test('full history recomputes staged activation; stored state cannot keep an unobserved trigger active',()=>{
  const holding={average_cost:100,purchase_date:'2026-11-01',rule_stages:[
    {type:'take_profit',pct:20},{type:'trailing',pct:10,activates_after:'take_profit'}],
    rule_stage_state:{stage_0:{hitDate:'2026-11-01'},stage_1:{activatedDate:'2026-11-01',peak:999}}};
  const before=JSON.stringify(holding);
  const result=review(holding,quote,{...history,points:[{date:'2026-11-01',price:100}]});
  assert.equal(result.state,'clear');assert.equal(result.rules.length,1);
  assert.deepEqual(result.stageState,{});assert.equal(result.stageStateDirty,false);
  assert.equal(JSON.stringify(holding),before);
});
test('strict review never inspects unrelated private properties or mutates inputs',()=>{
  const h={average_cost:100,loss_limit_pct:10};
  Object.defineProperty(h,'private_notes',{enumerable:true,get(){throw Error('private property accessed');}});
  Object.freeze(h);Object.freeze(quote);
  const result=review(h);assert.equal(result.state,'clear');
  assert(!JSON.stringify(result).includes('private_notes'));
});

test('an absent stage fraction remains unknown rather than turning into zero',()=>{
  const result=review({average_cost:100,purchase_date:'2026-11-01',rule_stages:[{type:'take_profit',pct:20,fraction:null}]},quote,history);
  assert.equal(result.rules[0].fraction,null);assert.equal(result.state,'clear');
});
