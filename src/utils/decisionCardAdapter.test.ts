import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPositionAnalyses, type PortfolioPosition } from './portfolioPositions';
import { adaptDecisionCard, summarizeDecisionCards, decisionLabels } from './decisionCardAdapter';
import type { IntelligenceSnapshot } from './intelligence';
import type { ValidatedQuote } from './decisionEligibility';
const now = Date.parse('2026-11-06T18:00:00Z');
const base: PortfolioPosition = { symbol:'NVDA',name:'Nvidia',group:'Chips',theme:'AI',peers:['AMD'],geo:'US',quantity:2,averageCost:90,investedValue:180,snapshotCurrentValue:180 };
const prices = { NVDA:{price:100,changePct:2}, AMD:{price:100,changePct:1}, SOXL:{price:100,changePct:2} };
const intelligence = {groups:[{name:'Chips',score:65,breadth:0.6,relativeToUniverse:1,members:['NVDA','AMD'],avgChange:1}],portfolioBreadth:1,portfolioAverage:1,universeAverage:1,topGroup:'Chips',bottomGroup:'Chips',pairSignals:[]} satisfies IntelligenceSnapshot;
const quote: ValidatedQuote = {symbol:'NVDA',price:100,currency:'USD',provider:'fixture-authority',marketTime:'2026-11-06T17:59:00Z',retrievedAt:'2026-11-06T18:00:00Z',isMarketSessionOpen:true,status:'valid',fallbackUsed:false};
const position = buildPositionAnalyses(prices,intelligence,[base])[0];
test('adapter preserves engine states and friendly labels', () => {
  for (const state of Object.keys(decisionLabels) as Array<keyof typeof decisionLabels>) assert.equal(adaptDecisionCard({...position,state},quote,true,now,true).state,state);
});
test('a cached ADD classification is suppressed after a failed quality gate', () => {
  const card = adaptDecisionCard(position,{...quote,status:'stale'},true,now,true);
  assert.equal(position.state,'ADD REVIEW'); assert.equal(card.state,'INSUFFICIENT DATA'); assert.equal(card.priceUsd,null); assert.equal(card.positionReturnPct,null);
});
test('unverified supporting metrics cannot enable a decision', () => assert.equal(adaptDecisionCard(position,quote,true,now).state,'INSUFFICIENT DATA'));
test('partial quote coverage never fabricates a total or concentration', () => {
  const valid = adaptDecisionCard(position,quote,true,now,true);
  const missing = adaptDecisionCard({...position,symbol:'AMD'},{...quote,price:null},true,now,true);
  const summary = summarizeDecisionCards([valid,missing]);
  assert.equal(summary.valueCoverage,'partial'); assert.equal(summary.portfolioValueUsd,null); assert.equal(summary.topConcentrationPct,null);
  assert.equal(summarizeDecisionCards([valid]).portfolioValueUsd,200);
});
test('leveraged thresholds are supplied by the existing engine without relaxing them', () => {
  const leveraged = buildPositionAnalyses(prices,intelligence,[{...base,symbol:'SOXL'}])[0];
  assert.equal(leveraged.state,'HOLD / WATCH');
  const card = adaptDecisionCard(leveraged,{...quote,symbol:'SOXL'},true,now,true);
  assert.equal(card.state,'HOLD / WATCH'); assert.equal(card.riskLeverage,3); assert.match(card.reasons[2].explanation,/68/);
});
test('missing evidence is explicit and accounting failure withholds return', () => {
  const card = adaptDecisionCard(position,quote,false,now,true);
  assert.equal(card.state,'INSUFFICIENT DATA'); assert.equal(card.positionReturnPct,null); assert.ok(card.reasons.some(r => !r.evidenceIds.length));
});
test('supporting metrics include source-specific, timestamped citations', () => {
  const peer = {...quote,symbol:'AMD',provider:'independent'};
  const card = adaptDecisionCard(position,quote,true,now,true,[peer]);
  const citation = card.evidence.find(e => e.id === 'support:AMD:independent');
  assert.equal(citation?.source,'independent'); assert.equal(citation?.observedAt,peer.marketTime);
  assert.ok(card.reasons[0].evidenceIds.includes(citation!.id));
});
test('summary uses chronological timestamps across offsets and withholds overflow', () => {
  const a = adaptDecisionCard(position,quote,true,now,true);
  const b = {...a,symbol:'AMD',dataQuality:{...a.dataQuality,marketTime:'2026-11-06T19:00:00+02:00'}};
  assert.equal(summarizeDecisionCards([a,b]).asOf,'2026-11-06T17:00:00.000Z');
  const overflow = {...a,priceUsd:Number.MAX_VALUE,quantity:2};
  assert.equal(summarizeDecisionCards([overflow]).portfolioValueUsd,null);
  assert.equal(summarizeDecisionCards([overflow]).topConcentrationPct,null);
});
test('a decision from a different symbol or price snapshot cannot display a current return', () => {
  for (const patch of [{symbol:'AMD'},{price:150}]) {
    const card = adaptDecisionCard(position,{...quote,...patch},true,now,true);
    assert.equal(card.state,'INSUFFICIENT DATA');
    assert.equal(card.positionReturnPct,null);
    assert.equal(card.dataQuality.status,'conflicting');
    assert.equal(card.historicalAssessment.asOf,null);
  }
});
