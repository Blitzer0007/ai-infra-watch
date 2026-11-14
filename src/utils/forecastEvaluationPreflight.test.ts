import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluateForecastWindow, planForecastSessions, FORECAST_EVALUATION_PROTOCOL } from '../../server/utils/forecastEvaluationPreflight.js';

// Explicitly fictional calendar declarations. They do not establish exchange/source truth.
function calendar(start = '2026-07-01', end = '2026-08-31', closures = ['2026-07-03'], early: Record<string,string> = {}) {
  const days = [];
  for (let date = start; date <= end; date = new Date(Date.parse(date) + 86400000).toISOString().slice(0,10)) {
    const weekday = new Date(date).getUTCDay();
    if (weekday === 0 || weekday === 6 || closures.includes(date)) days.push({date, status:'closed'});
    else {
      const dst = date >= '2026-03-08' && date < '2026-11-01';
      days.push({date, status:'open', openAt:date+(dst?'T13:30:00Z':'T14:30:00Z'), closeAt:date+'T'+(early[date] || (dst?'20:00:00':'21:00:00'))+'Z'});
    }
  }
  return {schemaVersion:'forecast-session-calendar-v1', venue:'XNYS', timeZone:'America/New_York', sourceId:'fictional-calendar', revisionId:'fixture-v1', availableAt:'2025-12-01T00:00:00Z', coverageStart:start, coverageEnd:end, days};
}
const plusMinute = (time:string) => new Date(Date.parse(time) + 60000).toISOString();
function history(input:any, start:string, end:string, vintageId:string) {
  const points = input.calendar.days.filter((day:any)=>day.status==='open' && day.date>=start && day.date<=end).map((day:any)=>({date:day.date, rawClose:100, adjustedClose:100, availableAt:plusMinute(day.closeAt), recordId:'fixture:'+day.date}));
  return {schemaVersion:'forecast-history-v1', symbol:input.symbol, venue:input.venue, currency:'USD', priceBasis:'split_dividend_adjusted_close', sourceId:'fictional-prices', vintageId, snapshotAvailableAt:points.at(-1)?.availableAt, stale:false, coverageStart:start, coverageEnd:end, points};
}
function fixture(changes:Record<string,unknown> = {}):any {
  const input:any = {protocolVersion:FORECAST_EVALUATION_PROTOCOL, symbol:'FICT', venue:'XNYS', currency:'USD', horizonSessions:5, decisionAt:'2026-07-02T20:10:00Z', assessedAt:'2026-08-10T22:00:00Z', calendar:calendar(), ...changes};
  const planned = planForecastSessions(input);
  assert.equal(planned.status,'planned');
  input.featureHistory = history(input,input.calendar.coverageStart,planned.plan.featureThrough,'features-as-of-decision');
  input.outcomeHistory = history(input,planned.plan.entryDate,planned.plan.targetDate,'labels-as-of-assessment');
  return input;
}
function blocked(input:any, code?:string) {
  const result = evaluateForecastWindow(input);
  assert.equal(result.status,'needs-data'); assert.equal(result.outcome,null);
  if (code) assert.equal(result.code,code);
  assert.equal(result.productionEligible,false); assert.equal(result.sourceVerified,false);
  return result;
}

test('declared holiday, exact entry convention and five subsequent intervals have independent expected dates',()=>{
  const input = fixture(); const before = JSON.stringify(input); const result = evaluateForecastWindow(input);
  assert.equal(result.status,'conditional-outcome'); assert.equal(result.plan.entryDate,'2026-07-06');
  assert.equal(result.plan.targetDate,'2026-07-13'); assert.equal(result.plan.featureThrough,'2026-07-02');
  assert.equal(result.outcomeCount,6); assert.equal(result.featureCount,2); assert.equal(result.outcome.grossReturnPct,0);
  assert.equal(result.sourceVerified,false); assert.equal(result.productionEligible,false); assert.equal(result.predictiveValidityEstablished,false);
  assert.equal(JSON.stringify(input),before);
});
test('5D and 20D remain separate supported session horizons without rewriting legacy labels',()=>{
  const result = evaluateForecastWindow(fixture({horizonSessions:20}));
  assert.equal(result.plan.entryDate,'2026-07-06'); assert.equal(result.plan.targetDate,'2026-08-03'); assert.equal(result.outcomeCount,21);
});
test('before-market and intraday decisions use the first later close, not the last known quote',()=>{
  for (const decisionAt of ['2026-07-02T12:00:00Z','2026-07-02T19:59:59Z']) {
    const r = evaluateForecastWindow(fixture({decisionAt}));
    assert.equal(r.plan.entryDate,'2026-07-02'); assert.equal(r.plan.targetDate,'2026-07-10'); assert.equal(r.plan.featureThrough,'2026-07-01');
  }
});
test('exact close is excluded from entry and cannot become an available feature before publication',()=>{
  const input = fixture({decisionAt:'2026-07-02T20:00:00Z'});
  assert.equal(planForecastSessions(input).plan.entryDate,'2026-07-06');
  blocked(input,'HISTORY_UNAVAILABLE_AT_CUTOFF');
});
test('weekend decisions use explicit next session and latest completed session',()=>{
  const result = evaluateForecastWindow(fixture({decisionAt:'2026-07-04T16:00:00Z'}));
  assert.equal(result.plan.entryDate,'2026-07-06'); assert.equal(result.plan.featureThrough,'2026-07-02');
});
test('venue-local day supports explicit offset timestamps across UTC midnight',()=>{
  const result = evaluateForecastWindow(fixture({decisionAt:'2026-07-03T01:00:00+05:30'}));
  assert.equal(result.plan.entryDate,'2026-07-02'); assert.equal(result.plan.featureThrough,'2026-07-01');
});
test('DST uses supplied session instants instead of assuming a fixed UTC close',()=>{
  const input = fixture({calendar:calendar('2026-03-02','2026-04-10',[]),decisionAt:'2026-03-06T21:05:00Z', assessedAt:'2026-03-30T22:00:00Z'});
  const result = evaluateForecastWindow(input);
  assert.equal(result.plan.entryDate,'2026-03-09'); assert.equal(result.plan.entryCloseAt,'2026-03-09T20:00:00Z');
  assert.equal(result.plan.targetDate,'2026-03-16');
});
test('early closure is a completed session; it does not wait for an assumed regular close',()=>{
  const result = evaluateForecastWindow(fixture({calendar:calendar('2026-11-23','2026-12-15',['2026-11-26'],{'2026-11-27':'18:00:00'}),decisionAt:'2026-11-27T18:05:00Z', assessedAt:'2026-12-10T22:00:00Z'}));
  assert.equal(result.plan.entryDate,'2026-11-30'); assert.equal(result.plan.featureThrough,'2026-11-27'); assert.equal(result.plan.targetDate,'2026-12-07');
});
test('pending outcomes ignore future labels and never expose a return before target close',()=>{
  const input = fixture({assessedAt:'2026-07-13T19:59:59Z'});
  input.outcomeHistory = {private:'must-not-be-exposed'};
  const result = evaluateForecastWindow(input);
  assert.equal(result.status,'pending'); assert.equal(result.code,'TARGET_SESSION_NOT_CLOSED'); assert.equal(result.outcome,null);
  assert.equal(JSON.stringify(result).includes('must-not-be-exposed'),false);
});
test('closed target with unpublished labels is unavailable, not a zero-return outcome',()=>{
  blocked(fixture({assessedAt:'2026-07-13T20:00:00Z'}),'HISTORY_UNAVAILABLE_AT_CUTOFF');
});
test('adjustment vintages remain separate; split-adjusted return does not use raw-price collapse',()=>{
  const input = fixture();
  input.outcomeHistory.points.forEach((point:any,i:number)=>{ point.rawClose=i===0?100:27; point.adjustedClose=i===0?25:27; });
  const r = evaluateForecastWindow(input);
  assert(Math.abs(r.outcome.grossReturnPct-8)<1e-10);
  assert.equal(r.featureVintageId,'features-as-of-decision'); assert.equal(r.outcomeVintageId,'labels-as-of-assessment');
  assert.equal(input.featureHistory.points[0].adjustedClose,100);
});
test('dividend-adjusted endpoint ratio is explicit and cannot silently use raw closes',()=>{
  const input = fixture();
  input.outcomeHistory.points[0].rawClose=100; input.outcomeHistory.points[0].adjustedClose=98;
  input.outcomeHistory.points.at(-1).rawClose=99; input.outcomeHistory.points.at(-1).adjustedClose=99;
  const result = evaluateForecastWindow(input);
  assert(Math.abs(result.outcome.grossReturnPct-(99/98-1)*100)<1e-10);
  assert(result.outcome.grossReturnPct>0);
});

for (const [name,mutate,code] of [
  ['missing declared closure',(i:any)=>i.calendar.days.splice(2,1),'CALENDAR_DAY_GAP_OR_DUPLICATE'],
  ['duplicate calendar date',(i:any)=>i.calendar.days.splice(1,0,i.calendar.days[0]),'CALENDAR_DAY_GAP_OR_DUPLICATE'],
  ['unsorted calendar',(i:any)=>i.calendar.days.reverse(),'CALENDAR_DAY_GAP_OR_DUPLICATE'],
  ['calendar revision after decision',(i:any)=>i.calendar.availableAt='2026-07-03T00:00:00Z','CALENDAR_UNAVAILABLE_AT_DECISION'],
  ['unknown closure',(i:any)=>i.calendar.days[2].status='unknown','CALENDAR_DAY_STATUS_UNKNOWN'],
  ['closed day with price session',(i:any)=>i.calendar.days[2].closeAt='2026-07-03T20:00:00Z','CALENDAR_CLOSED_DAY_INVALID'],
  ['wrong timezone',(i:any)=>i.calendar.timeZone='UTC','CALENDAR_METADATA_INVALID'],
  ['wrong venue',(i:any)=>i.calendar.venue='XNAS','CALENDAR_METADATA_INVALID'],
  ['invalid session instant',(i:any)=>i.calendar.days[0].closeAt='2026-02-30T20:00:00Z','CALENDAR_SESSION_INVALID'],
  ['reversed session',(i:any)=>i.calendar.days[0].closeAt=i.calendar.days[0].openAt,'CALENDAR_SESSION_INVALID'],
  ['missing final calendar day',(i:any)=>i.calendar.days.pop(),'CALENDAR_COVERAGE_INVALID'],
  ['insufficient future calendar',(i:any)=>{i.calendar.days=i.calendar.days.slice(0,3); i.calendar.coverageEnd='2026-07-03';},'TARGET_OUTSIDE_CALENDAR'],
] as const) test('calendar fails closed: '+name,()=>{const input=fixture();mutate(input);blocked(input,code);});

for (const field of ['featureHistory','outcomeHistory']) {
  for (const [name,mutate,code] of [
    ['raw basis',(h:any)=>h.priceBasis='raw_close','HISTORY_BASIS_UNSUPPORTED'],
    ['boolean raw price',(h:any)=>h.points[0].rawClose=true,'BAR_PRICE_INVALID'],
    ['nonfinite adjusted price',(h:any)=>h.points[0].adjustedClose=Infinity,'BAR_PRICE_INVALID'],
    ['nonexistent bar date',(h:any)=>h.points[0].date='2026-02-30','BAR_METADATA_INVALID'],
    ['duplicate bar',(h:any)=>h.points.splice(1,0,{...h.points[0]}),'BAR_DUPLICATE'],
    ['duplicate record ID',(h:any)=>h.points[1].recordId=h.points[0].recordId,'BAR_DUPLICATE'],
    ['unsorted bars',(h:any)=>h.points.reverse(),'BAR_ORDER_INVALID'],
    ['missing session bar',(h:any)=>h.points.splice(1,1),'BAR_MISSING_SESSION'],
    ['early availability',(h:any)=>h.points[0].availableAt=h.points[0].date+'T00:00:00Z','BAR_UNAVAILABLE_AT_CUTOFF'],
    ['future snapshot',(h:any)=>h.snapshotAvailableAt='2099-01-01T00:00:00Z','HISTORY_UNAVAILABLE_AT_CUTOFF'],
    ['stale',(h:any)=>h.stale=true,'HISTORY_STALE_OR_UNKNOWN'],
    ['unknown stale state',(h:any)=>delete h.stale,'HISTORY_STALE_OR_UNKNOWN'],
    ['unknown vintage',(h:any)=>delete h.vintageId,'HISTORY_METADATA_INVALID'],
    ['wrong currency',(h:any)=>h.currency='EUR','HISTORY_METADATA_INVALID'],
    ['wrong identity',(h:any)=>h.symbol='OTHER','HISTORY_METADATA_INVALID'],
    ['private field',(h:any)=>h.notes='private-fixture-note','HISTORY_METADATA_INVALID'],
    ['invalid coverage date',(h:any)=>h.coverageStart='2026-02-30','HISTORY_COVERAGE_MISMATCH'],
    ['too many bars',(h:any)=>h.points=Array(4001).fill(h.points[0]),'HISTORY_SIZE_INVALID'],
  ] as const) test(field+' fails closed: '+name,()=>{const input=fixture();mutate(input[field]);const r=blocked(input,code);assert(!JSON.stringify(r).includes('private-fixture-note'));});
}
test('future-adjusted history cannot masquerade as decision-time features',()=>{
  const input=fixture();input.featureHistory.snapshotAvailableAt=input.outcomeHistory.snapshotAvailableAt;
  blocked(input,'HISTORY_UNAVAILABLE_AT_CUTOFF');
});
test('a missing target is never replaced by the first later available close',()=>{
  const input=fixture();const last=input.outcomeHistory.points.at(-1);last.date='2026-07-14';last.recordId='later';last.availableAt='2026-07-14T20:01:00Z';
  input.outcomeHistory.snapshotAvailableAt=last.availableAt;
  blocked(input,'BAR_OUTSIDE_REQUESTED_SESSIONS');
});
test('halt or delisting gaps are withheld rather than filled, dropped or assigned zero return',()=>{
  for (const index of [1,5]) {const input=fixture();input.outcomeHistory.points.splice(index,1);blocked(input,'BAR_MISSING_SESSION');}
});
test('fresh retrieval cannot hide an old final feature bar',()=>{
  const input=fixture();input.featureHistory.points.pop();input.featureHistory.snapshotAvailableAt=input.decisionAt;
  blocked(input,'BAR_MISSING_SESSION');
});
test('numeric strings remain supported but extreme ratios cannot produce nonfinite output',()=>{
  const input=fixture();input.outcomeHistory.points[0].adjustedClose='100';
  assert.equal(evaluateForecastWindow(input).outcome.grossReturnPct,0);
  input.outcomeHistory.points[0].adjustedClose=Number.MIN_VALUE;input.outcomeHistory.points.at(-1).adjustedClose=Number.MAX_VALUE;
  blocked(input,'RETURN_NONFINITE');
});
for (const changes of [{horizonSessions:true},{horizonSessions:0},{horizonSessions:5.5},{horizonSessions:60},{protocolVersion:'legacy'},{symbol:true},{currency:'EUR'},{decisionAt:'2026-02-30T20:00:00Z'},{assessedAt:'2020-01-01T00:00:00Z'}]) {
  test('unsupported input never authorizes an outcome: '+JSON.stringify(changes),()=>{blocked({...fixture(),...changes});});
}
test('unknown top-level fields and exceptional access are redacted without IO',()=>{
  blocked({...fixture(),privateNote:'private-fixture-note'},'PROTOCOL_UNSUPPORTED');
  const input=fixture();Object.defineProperty(input,'decisionAt',{get(){throw Error('private-fixture-note');}});
  const result=blocked(input,'PREFLIGHT_INPUT_INVALID');assert(!JSON.stringify(result).includes('private-fixture-note'));
});
test('an undeclared weekend opening cannot become an extra US regular session',()=>{
  const input=fixture();Object.assign(input.calendar.days[3],{status:'open',openAt:'2026-07-04T13:30:00Z',closeAt:'2026-07-04T20:00:00Z'});
  blocked(input,'CALENDAR_SESSION_INVALID');
});
test('calendar size is bounded before walking any supplied days',()=>{
  const input=fixture();input.calendar.days=Array(4001).fill(input.calendar.days[0]);blocked(input,'CALENDAR_COVERAGE_INVALID');
});
test('bar publication cannot be later than its claimed archive vintage',()=>{
  const input=fixture();input.featureHistory.points[1].availableAt='2026-07-02T20:09:00Z';blocked(input,'BAR_UNAVAILABLE_AT_CUTOFF');
});
test('a future or closed-day bar cannot be smuggled into decision features',()=>{
  for (const date of ['2026-07-03','2026-07-06']) {
    const input=fixture();input.featureHistory.points.push({date,rawClose:100,adjustedClose:100,recordId:'future',availableAt:date+'T20:01:00Z'});
    blocked(input,'BAR_OUTSIDE_REQUESTED_SESSIONS');
  }
});
test('old forecast snapshots require explicit migration rather than invented protocol defaults',()=>{
  blocked({ticker:'FICT',horizon:5,entry_price:100,target_date:'2026-07-09',evidence_snapshot:{priceBasis:'split_dividend_adjusted_close'}},'PROTOCOL_UNSUPPORTED');
});
test('evaluation uses no ambient time or network, and never mutates a frozen fixture',()=>{
  const input=fixture();
  const freeze=(value:any)=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}};freeze(input);
  const now=Date.now, fetch=globalThis.fetch;
  Date.now=()=>{throw Error('Ambient clock forbidden');}; globalThis.fetch=()=>{throw Error('Network forbidden');};
  try {assert.equal(evaluateForecastWindow(input).status,'conditional-outcome');}
  finally {Date.now=now;globalThis.fetch=fetch;}
});
test('committed fixture and Cloud CLI exercise the same evaluator without environment credentials',()=>{
  const packet=JSON.parse(readFileSync(new URL('../../scripts/fixtures/forecast-evaluation-window.fictional.json',import.meta.url),'utf8'));
  const expected=evaluateForecastWindow(packet);assert.equal(expected.plan.targetDate,'2026-07-13');
  const child=execFileSync(process.execPath,['scripts/forecast-evaluation-demo.mjs'],{cwd:process.cwd(),env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
  const receipt=JSON.parse(child);assert.equal(receipt.fictional,true);assert.deepEqual(receipt.cases.completeDeclaredWindow,expected);
  assert.equal(receipt.cases.notMatured.status,'pending');assert.equal(receipt.cases.missingTarget.code,'BAR_MISSING_SESSION');
  assert.equal(receipt.cases.futureFeatureVintage.code,'HISTORY_UNAVAILABLE_AT_CUTOFF');
  assert(Object.values(receipt.cases).every((c:any)=>c.protocolVersion===FORECAST_EVALUATION_PROTOCOL&&c.productionEligible===false&&c.sourceVerified===false));
  const denied=spawnSync(process.execPath,['scripts/forecast-evaluation-demo.mjs','--input','private-file'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});
  assert.equal(denied.status,2);assert.equal(denied.stdout,'');assert(!denied.stderr.includes('private-file'));
});
test('calendar availability one microsecond after decision cannot pass a truncated millisecond cutoff',()=>{
  const input=fixture({decisionAt:'2026-07-02T20:10:00.000001Z'});
  input.calendar.availableAt='2026-07-02T20:10:00.000002Z';blocked(input,'CALENDAR_UNAVAILABLE_AT_DECISION');
});
test('feature archive availability preserves microsecond ordering across timezone offsets',()=>{
  const input=fixture({decisionAt:'2026-07-02T20:10:00.000001Z'});
  input.featureHistory.snapshotAvailableAt='2026-07-03T01:40:00.000002+05:30';blocked(input,'HISTORY_UNAVAILABLE_AT_CUTOFF');
});
test('bar publication one microsecond after its archive snapshot is rejected',()=>{
  const input=fixture();input.featureHistory.snapshotAvailableAt='2026-07-02T20:01:00.000001Z';
  input.featureHistory.points[1].availableAt='2026-07-02T20:01:00.000002Z';blocked(input,'BAR_UNAVAILABLE_AT_CUTOFF');
});
test('entry planning preserves a session close strictly after decision by one microsecond',()=>{
  const schedule=calendar();schedule.days[1].closeAt='2026-07-02T20:00:00.000002Z';
  const input=fixture({calendar:schedule,decisionAt:'2026-07-02T20:00:00.000001Z'});
  const result=evaluateForecastWindow(input);assert.equal(result.status,'conditional-outcome');
  assert.equal(result.plan.entryDate,'2026-07-02');assert.equal(result.plan.featureThrough,'2026-07-01');
  assert.doesNotThrow(()=>JSON.stringify(result));
});
