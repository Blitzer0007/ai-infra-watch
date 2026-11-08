import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntelligence, buildMoneyRotation, percentileRank, type PricePoint } from './intelligence';
import { buildPositionAnalyses, type PortfolioPosition } from './portfolioPositions';
import { calculateStressScore, calculatePortfolioStressScore, applyStressHysteresis } from './measurement';

const now = Date.parse('2026-11-08T12:00:00Z');
const point = (changePct = 0): PricePoint => ({ price: 100, changePct });
const history = (growth = 1, length = 21) => Array.from({length},(_,index)=>({date:new Date(Date.UTC(2026,0,index+1)).toISOString().slice(0,10),price:100+index*growth}));
const row = (symbol: string, value: number | null, move: number | null) => ({symbol, investedValue:100,currentValue:value,pnl:0,pnlPct:0,dailyChangePct:move,group:'Test'});

test('empty intelligence has no group score, zero breadth, portfolio aggregate or strongest group claim', () => {
  const result = buildIntelligence({});
  assert.equal(result.universeAverage,null); assert.equal(result.portfolioAverage,null); assert.equal(result.portfolioBreadth,null);
  assert.equal(result.topGroup,null); assert.equal(result.bottomGroup,null);
  for(const group of result.groups){
    assert.equal(group.score,null);assert.equal(group.avgChange,null);assert.equal(group.breadth,null);
    assert.equal(group.relativeToUniverse,null);assert.equal(group.coverage.status,'unavailable');
  }
  assert.ok(result.pairSignals.every(pair=>pair.spread===null));
});

test('observed flat price moves stay zero while unobserved groups stay unavailable', () => {
  const result=buildIntelligence({NVDA:point()});
  const observed=result.groups.find(group=>group.members.includes('NVDA'))!;
  assert.equal(observed.avgChange,0);assert.equal(observed.breadth,1);assert.equal(observed.score,65);
  assert.equal(observed.coverage.observed,1);assert.equal(observed.coverage.status,'partial');
  assert.equal(result.topGroup,observed.name);
  assert.ok(result.groups.filter(group=>group!==observed).every(group=>group.score===null));
});

test('stale, malformed price and non-finite move observations never manufacture group or pair evidence', () => {
  for(const bad of [{...point(),stale:true},{...point(),price:NaN},{...point(),price:0},{...point(),changePct:Infinity},{price:100}]){
    const result=buildIntelligence({NVDA:bad as PricePoint});
    assert.equal(result.universeAverage,null);assert.equal(result.topGroup,null);
    assert.equal(result.pairSignals.find(pair=>pair.left==='NVDA')!.spread,null);
  }
});

test('position review needs complete group and peer observations while price-only value stays observable', () => {
  const group=buildIntelligence({}).groups.find(group=>group.members.includes('NVDA'))!;
  const prices=Object.fromEntries(group.members.map(symbol=>[symbol,point(1)]));prices.NVDA=point(2);prices.AMD=point(1);
  const position:PortfolioPosition={symbol:'NVDA',name:'Example',group:group.name,theme:'Test',peers:['AMD'],geo:'US',quantity:1,averageCost:100,investedValue:100,snapshotCurrentValue:100};
  const complete=buildPositionAnalyses(prices,buildIntelligence(prices),[position])[0];
  assert.equal(complete.state,'ADD REVIEW');
  const missing={...prices};delete missing[group.members.find(symbol=>!['NVDA','AMD'].includes(symbol))!];
  const partial=buildPositionAnalyses(missing,buildIntelligence(missing),[position])[0];
  assert.equal(partial.state,'INSUFFICIENT DATA');assert.equal(partial.currentValue,100);
  const noMove={...prices,NVDA:{price:100,changePct:NaN}};
  const absent=buildPositionAnalyses(noMove,buildIntelligence(noMove),[position])[0];
  assert.equal(absent.dailyChangePct,null);assert.equal(absent.currentValue,100);assert.equal(absent.state,'INSUFFICIENT DATA');
});

test('percentile ties use midpoint ranks and finite out-of-sample queries stay bounded', () => {
  assert.equal(percentileRank([2,2,2,2],2),50);assert.equal(percentileRank([1,2,2,4],2),50);
  assert.equal(percentileRank([1,2,3,4],2.5),50);assert.equal(percentileRank([1,2,3],0),0);
  assert.equal(percentileRank([1,2,3],4),100);assert.equal(percentileRank([5],5),50);
  assert.equal(percentileRank([NaN,Infinity],2),null);
});

test('rotation without history has unavailable rankings and pair spreads instead of neutral 50 or zero', () => {
  const result=buildMoneyRotation({}, {}, '20D',now);
  assert.ok(result.groups.every(group=>group.score===null&&group.direction==='insufficient'));
  assert.ok(result.groups.every(group=>group.horizonCoverage['20D'].observed===0));
  assert.ok(result.pairs.every(pair=>pair.spread===null&&pair.horizonSpreads.every(item=>item.spread===null)));
  assert.match(result.freshness,/History unavailable/);
});

test('one observed group can show its return but cannot establish a relative group ranking', () => {
  const result=buildMoneyRotation({NVDA:history()}, {}, '20D',now);
  const group=result.groups.find(group=>group.members.includes('NVDA'))!;
  assert.ok(Math.abs(group.horizons['20D']!-20)<1e-10);assert.equal(group.direction,'positive');
  assert.equal(group.score,null);assert.equal(group.scoreMethod,'insufficient');
});

test('matched groups with equal observed returns receive tied ranks and coverage stays explicit', () => {
  const result=buildMoneyRotation({NVDA:history(),MU:history()}, {}, '20D',now);
  const scored=result.groups.filter(group=>group.score!=null);
  assert.equal(scored.length,2);assert.ok(scored.every(group=>group.score===50));
  assert.ok(scored.every(group=>group.horizonCoverage['20D'].status==='partial'));
  const flat=buildMoneyRotation({NVDA:history(0),MU:history(0)}, {}, '20D',now);
  assert.ok(flat.groups.filter(group=>group.score!=null).every(group=>group.direction==='flat'));
});

test('malformed, duplicated and future history is withheld without compressing the observation horizon', () => {
  const source=history();
  for(const bad of [[...source,source[0]],[...source,{date:'2026-02-31',price:100}], [...source,{date:'2027-01-01',price:100}],
    source.map((row,index)=>index===5?{...row,price:NaN}:row)]){
    const result=buildMoneyRotation({NVDA:bad,MU:history()}, {}, '20D',now);
    const group=result.groups.find(group=>group.members.includes('NVDA'))!;
    assert.equal(group.horizons['20D'],null);assert.equal(group.horizonCoverage['20D'].observed,0);
  }
  const reversed=[...source].reverse();const before=JSON.stringify(reversed);
  const result=buildMoneyRotation({NVDA:reversed,MU:history()}, {}, '20D',now);
  assert.equal(JSON.stringify(reversed),before);assert.equal(result.windows['20D']!.startDate,'2026-01-01');
});

test('rotation ranks exclude source histories with mismatched end or start dates', () => {
  const older=history().map(row=>({...row,date:new Date(Date.parse(row.date)-86400000).toISOString().slice(0,10)}));
  const result=buildMoneyRotation({NVDA:history(),MU:older}, {}, '20D',now);
  assert.equal(result.groups.find(group=>group.members.includes('MU'))!.horizons['20D'],null);
  const shifted=[{date:'2025-12-31',price:100},...history().filter(row=>row.date!=='2026-01-02')];
  const window=buildMoneyRotation({NVDA:history(),AMD:shifted,MU:history()}, {}, '20D',now);
  assert.equal(window.pairs.find(pair=>pair.left==='NVDA')!.horizonSpreads.find(item=>item.horizon==='20D')!.spread,null);
});

test('pair comparisons preserve horizon labels and matching source dates rather than inferring a temporal trend', () => {
  const result=buildMoneyRotation({NVDA:history(1),AMD:history(0.5)}, {NVDA:point(2),AMD:point(1)}, '20D',now);
  const pair=result.pairs.find(pair=>pair.left==='NVDA')!;
  assert.equal(pair.spread,1);assert.equal(pair.horizonSpreads.length,6);
  const twenty=pair.horizonSpreads.find(item=>item.horizon==='20D')!;
  assert.ok(Math.abs(twenty.spread!-10)<1e-10);assert.equal(twenty.startDate,'2026-01-01');assert.equal(twenty.endDate,'2026-01-21');
  assert.equal(pair.horizonSpreads.find(item=>item.horizon==='3M')!.spread,null);
  assert.ok(!('trend' in pair));assert.ok(!('history' in pair));
});

test('empty stress is insufficient, while observed neutral market inputs still have a real zero', () => {
  const absent=calculateStressScore({dailyChanges:[],highMacroCount:0,mediumMacroCount:0});
  assert.equal(absent.score,null);assert.equal(absent.label,'Insufficient data');assert.equal(absent.breadthStress,null);
  const zero=calculateStressScore({dailyChanges:[0,0],highMacroCount:0,mediumMacroCount:0});
  assert.equal(zero.score,0);assert.equal(zero.label,'Contained');
  assert.equal(calculateStressScore({dailyChanges:[0,NaN],highMacroCount:0,mediumMacroCount:0}).score,null);
});

test('portfolio stress never reweights a partial subset or substitutes purchase cost for missing current value', () => {
  const value=calculatePortfolioStressScore([row('A',90,-2),row('B',null,null)]);
  assert.equal(value.score,null);assert.equal(value.weightedAvgMove,null);assert.equal(value.weightedBreadth,null);
  assert.equal(value.concentrationPenalty,null);assert.equal(value.coverage,'partial');assert.equal(value.freshCount,1);assert.equal(value.expectedCount,2);
});

test('complete value-weighted inputs preserve the hand-calculated stress and genuine zero-exposure rows do not change weights', () => {
  const source=[row('A',60,-2),row('B',30,1),row('C',10,3)];
  const value=calculatePortfolioStressScore(source);
  assert.equal(value.score,33);assert.equal(value.weightedBreadth,0.4);assert.ok(Math.abs(value.weightedAvgMove!+0.6)<1e-10);
  assert.equal(calculatePortfolioStressScore([...source,row('EMPTY',0,null)]).score,33);
  assert.equal(calculatePortfolioStressScore([row('EMPTY',0,0)]).score,null);
});

test('unavailable or malformed macro evidence withholds the total without leaking non-finite numbers', () => {
  for(const override of [null,NaN,Infinity,-1]){
    const value=calculatePortfolioStressScore([row('A',100,0)],0,0,override);
    assert.equal(value.score,null);assert.equal(value.macroLoad,null);assert.equal(value.label,'Insufficient data');
    assert.ok(Object.values(value).every(item=>typeof item!=='number'||Number.isFinite(item)));
  }
  assert.equal(calculateStressScore({dailyChanges:[0],highMacroCount:NaN,mediumMacroCount:0}).score,null);
});

test('stress hysteresis resets across loss of evidence instead of retaining an earlier healthy score', () => {
  assert.equal(applyStressHysteresis(20,null),null);assert.equal(applyStressHysteresis(20,NaN),null);
  const reset=applyStressHysteresis(20,null);
  assert.equal(applyStressHysteresis(reset,80),80);assert.equal(applyStressHysteresis(80,82),80);
});
