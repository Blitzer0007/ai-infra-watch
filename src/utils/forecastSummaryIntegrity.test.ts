import {test} from 'node:test';
import assert from 'node:assert/strict';
import {independentForecastRows,forecastWindow} from './forecastIndependence.js';
import {forecastNumber,forecastCount,forecastHorizon} from './forecastInputs.js';
import {summarizeForecastRows,buildForecastLearningSummary,buildForecastValidationSummary,forecastValidationGate as serverGate} from '../../server/utils/forecastValidation.js';
import {forecastValidationGate as clientGate} from './forecastValidation';
import {coverageInterval,calibrationVerdict} from '../../server/utils/forecastCalibration.js';
const date=(base:string,days:number)=>new Date(Date.parse(base)+days*86400000).toISOString();
const row=(extra:Record<string,unknown>={})=>({ticker:'FICT',horizon:5,status:'verified',created_at:'2026-01-01T12:00:00Z',target_date:'2026-01-06',verified_at:'2026-01-07T12:00:00Z',median:1,actual_return:1,p10:-1,p25:0,p75:2,p90:3,...extra});
function stream(ticker:string,base:string,count:number,correct:boolean){return Array.from({length:count},(_,i)=>row({ticker,created_at:date(base,i*7),target_date:date(base,i*7+5).slice(0,10),verified_at:date(base,i*7+6),actual_return:correct?1:-1}));}
test('last ten reflects target chronology instead of alphabetically last ticker',()=>{
  const recent=stream('AAA','2026-06-01T00:00:00Z',10,true),old=stream('ZZZ','2026-01-01T00:00:00Z',10,false);
  const input=[...recent,...old],before=JSON.stringify(input);
  const r=summarizeForecastRows(input);assert.equal(r.rolling.last10.directionRightPct,100);assert.equal(r.rolling.last10.predictionMatchPct,100);
  assert.equal(r.rolling.last25.directionRightPct,50);assert.equal(JSON.stringify(input),before);
  assert.deepEqual(independentForecastRows(input).map(r=>r.target_date),independentForecastRows([...input].reverse()).map(r=>r.target_date));
});
test('recent/prior drift and backfilled verification timestamps follow market-window chronology',()=>{
  const old=stream('ZZZ','2025-01-01T00:00:00Z',20,false).map(r=>({...r,verified_at:'2026-11-01T00:00:00Z'}));
  const recent=stream('AAA','2026-01-01T00:00:00Z',20,true).map(r=>({...r,verified_at:'2026-08-01T00:00:00Z'}));
  const learning=buildForecastLearningSummary([...recent,...old]);assert.equal(learning.drift.status,'improving');assert.equal(learning.drift.recent.directionRightPct,100);assert.equal(learning.drift.prior.directionRightPct,0);
});
test('valid non-overlap cohort is preserved while output becomes chronological',()=>{
  const a=row(),overlap=row({created_at:'2026-01-02T00:00:00Z',target_date:'2026-01-07'}),b=row({ticker:'AAA',horizon:20,target_date:'2026-01-28'});
  const result=independentForecastRows([b,overlap,a]);assert.deepEqual(new Set(result),new Set([a,b]));assert.equal(result[0],a);
});
for(const value of [true,false,null,undefined,'',' ','0x10','Infinity',NaN,Infinity,[],{}])test('invalid numeric scalar cannot be a metric: '+String(value),()=>{
  assert.equal(forecastNumber(value),null);const rows=[row({actual_return:value}),row({ticker:'OTHER',median:value})];
  const summary=buildForecastValidationSummary(rows);assert.equal(summary.overall.count,0);assert.equal(summary.validationGate.verifiedCount,0);assert.deepEqual(summary.byTickerHorizon,[]);assert.equal(buildForecastLearningSummary(rows).sampleSize,0);
});
test('finite PostgreSQL numeric strings and genuine zero outcomes remain usable',()=>{
  const summary=summarizeForecastRows([row({median:'0',actual_return:'0',p25:'-1',p75:'1'})]);assert.equal(summary.count,1);assert.equal(summary.independentCount,1);assert.equal(summary.medianAbsoluteError,0);assert.equal(summary.p25p75CoveragePct,100);
  assert.equal(summary.directionalAccuracyPct,null);assert.equal(summary.predictionMatchPct,null);assert.equal(summary.directionalSampleCount,0);assert.equal(summary.neutralOrZeroCount,1);
});
test('zero pair exclusions and interval coverage report their denominators',()=>{
  const r=summarizeForecastRows([row(),row({ticker:'OTHER',median:0,actual_return:1}),row({ticker:'THIRD',median:1,actual_return:0})]);assert.equal(r.count,3);assert.equal(r.directionalSampleCount,1);assert.equal(r.scoreSampleCount,1);assert.equal(r.neutralOrZeroCount,2);assert.equal(r.p25p75CoverageCount,3);assert.equal(r.rolling.last10.count,3);
});
for(const extra of [{created_at:'2026-02-30T12:00:00Z'},{created_at:'2026-01-01garbage'},{created_at:true},{target_date:'2026-02-30'},{target_date:'2026-01-01'},{target_date:'2025-12-31'},{target_date:'2026-01-06T00:00:00Z'},{horizon:true},{horizon:0},{horizon:-5},{horizon:5.5},{horizon:'0x14'},{ticker:true},{status:undefined},{status:'pending'}])test('invalid metadata cannot inflate counts: '+JSON.stringify(extra),()=>{
  const r=buildForecastValidationSummary([row(extra)]);assert.equal(r.overall.count,0);assert.equal(r.overall.independentCount,0);assert.equal(r.validationGate.ready,false);assert.equal(buildForecastLearningSummary([row(extra)]).sampleSize,0);
});
test('real leap day, explicit offsets and legacy creation-day precision are accepted',()=>{
  assert(forecastWindow(row({created_at:'2024-02-29T12:00:00+05:30',target_date:'2024-03-07'})));
  assert(forecastWindow(row({created_at:'2026-01-01'})));
  assert.equal(forecastHorizon('20'),20);assert.equal(forecastCount('50'),50);
});
test('contradictory coverage of properly nested intervals is mixed, not well calibrated',()=>{
  const rows=Array.from({length:100},()=>({actual_return:0,p10:-1,p25:1,p75:2,p90:3}));
  const middle=coverageInterval(rows,'p25','p75'),wide=coverageInterval(rows,'p10','p90');assert.equal(middle.coveragePct,0);assert.equal(wide.coveragePct,100);assert.equal(calibrationVerdict(middle,wide,100),'mixed coverage');
});
for(const [middle,wide,expected] of [
  [{count:50,lowerPct:1,upperPct:40},{count:50,lowerPct:70,upperPct:90},'too narrow'],
  [{count:50,lowerPct:40,upperPct:60},{count:50,lowerPct:90,upperPct:99},'too wide'],
  [{count:50,lowerPct:40,upperPct:60},{count:50,lowerPct:70,upperPct:90},'consistent with target coverage'],
  [{count:50,lowerPct:60,upperPct:40},{count:50,lowerPct:70,upperPct:90},'insufficient'],
  [{count:51,lowerPct:40,upperPct:60},{count:50,lowerPct:70,upperPct:90},'insufficient'],
] as const)test('coverage diagnostic: '+expected+JSON.stringify(middle),()=>assert.equal(calibrationVerdict(middle,wide,50),expected));
test('crossed known quantiles and invalid bounds cannot produce coverage',()=>{
  const r=coverageInterval([{actual_return:1,p10:2,p25:0,p75:1,p90:3},{actual_return:true,p25:0,p75:2},{actual_return:1,p25:'0x0',p75:2}],'p25','p75');assert.equal(r.count,0);assert.equal(r.coveragePct,null);
});
test('invalid sample counts cannot open either client or server policy gate',()=>{
  for(const n of [true,null,NaN,Infinity,-1,50.5,'0x32']){assert.equal(serverGate(n).ready,false);assert.equal(clientGate(n as number).ready,false);}
  assert(serverGate(50).ready);assert(clientGate(50).ready);assert.equal(clientGate(49).ready,false);
});
test('selection receipt separates invalid, pending and overlapping rows',()=>{
  const r=summarizeForecastRows([row(),row({created_at:'2026-01-02T00:00:00Z'}),row({median:true}),row({status:'pending'})]);
  assert.deepEqual(r.selection,{inputRowCount:4,verifiedRowCount:3,eligibleRowCount:2,invalidVerifiedRowCount:1,unverifiedRowCount:1,retainedRowCount:1,overlapExcludedRowCount:1,chronology:'target-date',scope:'per-ticker-horizon-non-overlap',statisticalIndependenceEstablished:false});
});
