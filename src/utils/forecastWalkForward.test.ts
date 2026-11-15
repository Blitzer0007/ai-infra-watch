import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { evaluateWalkForwardForecasts } from '../../server/utils/forecastWalkForward.js';
import { fictionalWalkForwardInput, fictionalForecastWindow } from '../../scripts/fixtures/forecast-walk-forward.fictional.mjs';

const hash = (b:Buffer) => createHash('sha256').update(b).digest('hex');
const encode = (v:unknown) => Buffer.from(JSON.stringify(v)+'\n');
const close = (actual:number,expected:number,tolerance=1e-10) => assert(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const input = () => fictionalWalkForwardInput();
function evaluated(value:any) { const result=evaluateWalkForwardForecasts(value);assert('coverage' in result);return result; }
const row = (result:any,id:string) => result.windows.find((w:any)=>w.id===id);
const summary = (result:any,partition='holdout',horizon=5) => result.summaries.find((s:any)=>s.partition===partition&&s.horizonSessions===horizon);
function changedArchive(window:any,role:string,change:(a:any)=>void) {
  const a=JSON.parse(window.archive.artifacts.get(role).toString());change(a);const bytes=encode(a);
  window.archive.artifacts.set(role,bytes);const m=JSON.parse(window.archive.manifestBytes.toString());
  m[role].sha256=hash(bytes);m[role].byteLength=bytes.length;window.archive.manifestBytes=encode(m);window.archive.expectedManifestSha256=hash(window.archive.manifestBytes);
}
function invalid(value:any,code:string) {const result=evaluateWalkForwardForecasts(value);assert.equal(result.status,'needs-data');assert('code' in result);assert.equal(result.code,code);assert.deepEqual(result.summaries,[]);assert.equal(result.productionEligible,false);}

test('real archives → purge/fit receipts → paired metrics match independent numerical goldens',()=>{
  const result=evaluated(input());assert.equal(result.status,'descriptive-results');
  assert.deepEqual(result.coverage,{supplied:9,scored:4,trainingContext:3,pending:1,needsData:1,excluded:0,unassessed:0});
  const first=row(result,'validation-a');assert.deepEqual(first.training.eligibleIds,['train-a','train-b']);assert.deepEqual(first.training.purgedOverlapIds,['train-overlap']);assert.deepEqual(first.training.unavailableIds,[]);
  assert.deepEqual(row(result,'validation-b').training.eligibleIds,['train-a','train-b','train-overlap']);
  const v=summary(result,'validation');assert.equal(v.pairedCount,2);close(v.model.maePP,7.5);close(v.model.rmsePP,Math.sqrt(62.5));
  close(v.model.meanSignedErrorPP,-7.5);close(v.model.meanPinballLossPP,2.45);close(v.noChange.maePP,10);close(v.noChange.meanPinballLossPP,5);
  close(v.trainingDistribution.maePP,12.5);close(v.modelMinusNoChangeMaePP,-2.5);
  const h=summary(result);assert.equal(h.suppliedWindowCount,4);assert.equal(h.pairedCount,2);close(h.model.maePP,2.5);close(h.model.rmsePP,Math.sqrt(12.5));
  close(h.model.meanPinballLossPP,.525);close(h.noChange.meanPinballLossPP,1.25);close(h.trainingDistribution.maePP,7.5);
  assert.equal(h.model.centralCoveragePct,100);assert.equal(h.noChange.centralCoveragePct,50);assert.equal(h.model.count,h.noChange.count);assert.equal(h.model.count,h.trainingDistribution.count);
  assert.equal(result.sourceVerified,false);assert.equal(result.predictionProvenanceVerified,false);assert.equal(result.predictiveValidityEstablished,false);
});
test('input ordering, receipt mutation and repeated runs cannot change chronological cohorts',()=>{
  const source=input(),before=source.windows.map(w=>w.id);const first=evaluated(source);
  assert.deepEqual(source.windows.map(w=>w.id),before);const reversed=input();reversed.windows.reverse();assert.deepEqual(evaluated(reversed),first);
  row(first,'holdout-a').training.eligibleIds.push('mutated');assert(!row(evaluated(source),'holdout-a').training.eligibleIds.includes('mutated'));
});
test('genuine zero outcomes and predictions stay in all paired denominators',()=>{
  const result=evaluated(input());assert.equal(row(result,'holdout-a').actualReturnPct,0);assert.equal(row(result,'holdout-a').status,'scored');
  assert.equal(summary(result).pairedCount,2);assert.equal(summary(result).model.centralMeanWidthPP,2.5);
});
test('held-out labels never enter the frozen fit even after they mature',()=>{
  const source=fictionalWalkForwardInput('2026-08-10T22:00:00Z');const r=evaluated(source);
  assert.equal(row(r,'holdout-pending').status,'scored');assert.deepEqual(row(r,'holdout-pending').training.eligibleIds,row(r,'holdout-a').training.eligibleIds);
  assert(!row(r,'holdout-pending').training.eligibleIds.some((id:string)=>id.startsWith('holdout')||id==='missing-prediction'));
});
test('pending labels never inspect malformed future outcome artifacts or leak actual returns',()=>{
  const source=input();source.windows.find(w=>w.id==='holdout-pending').archive.artifacts.set('outcomes',Buffer.from('private future bytes'));
  const r=evaluated(source);assert.equal(row(r,'holdout-pending').status,'pending');assert.equal(row(r,'holdout-pending').actualReturnPct,null);assert(!JSON.stringify(r).includes('private future bytes'));
});
test('known archive publication one microsecond after fit cutoff is unavailable at that origin',()=>{
  const source=input();const validation=source.windows.find(w=>w.id==='validation-a');validation.archive.request.decisionAt='2026-06-18T20:10:00.000001Z';validation.prediction.issuedAt=validation.archive.request.decisionAt;
  changedArchive(source.windows.find(w=>w.id==='train-b'),'outcomes',a=>a.publishedAt='2026-06-18T20:10:00.000002Z');
  const r=evaluated(source);assert.equal(row(r,'validation-a').code,'TRAINING_SAMPLE_INSUFFICIENT');assert.deepEqual(row(r,'validation-a').training.unavailableIds,['train-b']);
  assert.equal(row(r,'validation-b').status,'scored');
});
test('a training label touching the fit cutoff is purged, not treated as earlier',()=>{
  const source=input();source.config.modelFrozenAt='2026-07-06T20:00:00Z';
  for(const w of source.windows.filter(w=>w.id.startsWith('holdout')&&w.prediction))w.prediction.trainingWindowIds=w.prediction.trainingWindowIds.filter(id=>id!=='validation-b');
  const r=evaluated(source);assert.equal(row(r,'holdout-a').status,'scored');assert.deepEqual(row(r,'holdout-a').training.purgedOverlapIds,['validation-b']);
});
test('explicit calendar-time gap excludes boundary-near labels without pretending it is a session count',()=>{
  const source=input();source.config.gapMs=2*86400000;const r=evaluated(source);
  assert.deepEqual(row(r,'validation-a').training.purgedOverlapIds,['train-b','train-overlap']);assert.equal(row(r,'validation-a').code,'TRAINING_SAMPLE_INSUFFICIENT');
});
test('training rows from another instrument cannot enter the empirical baseline or fit receipt',()=>{
  const source=input();source.windows.push(fictionalForecastWindow({id:'other-context',symbol:'OTHER',decisionAt:'2026-06-02T20:10:00Z',entryDate:'2026-06-03',targetDate:'2026-06-10',actualReturnPct:90,assessedAt:source.assessedAt}));
  const r=evaluated(source);assert.deepEqual(row(r,'validation-a').training.eligibleIds,['train-a','train-b']);close(summary(r,'validation').trainingDistribution.maePP,12.5);
});
test('20-session contexts stay separate from 5-session cohorts and empty metrics remain null',()=>{
  const source=fictionalWalkForwardInput('2026-08-10T22:00:00Z');source.windows.push(fictionalForecastWindow({id:'twenty',horizonSessions:20,decisionAt:'2026-07-08T20:10:00Z',entryDate:'2026-07-09',targetDate:'2026-08-06',actualReturnPct:5,assessedAt:source.assessedAt}));
  const r=evaluated(source);assert.equal(row(r,'twenty').code,'TRAINING_SAMPLE_INSUFFICIENT');assert.equal(summary(r,'holdout',20).suppliedWindowCount,1);assert.equal(summary(r,'holdout',20).model.maePP,null);
});
for(const [name,change,code] of [
  ['wrong model',(p:any)=>p.modelId='other-model','PREDICTION_METADATA_INVALID'],
  ['late issuance',(p:any)=>p.issuedAt='2026-07-08T20:10:00.000001Z','PREDICTION_CUTOFF_INVALID'],
  ['issuance before frozen fit',(p:any)=>p.issuedAt='2026-07-07T20:09:59Z','PREDICTION_CUTOFF_INVALID'],
  ['future held-out training',(p:any)=>p.trainingWindowIds.push('holdout-a'),'PREDICTION_TRAINING_SET_MISMATCH'],
  ['missing training row',(p:any)=>p.trainingWindowIds.pop(),'PREDICTION_TRAINING_SET_MISMATCH'],
  ['duplicate training row',(p:any)=>p.trainingWindowIds[1]=p.trainingWindowIds[0],'PREDICTION_TRAINING_SET_MISMATCH'],
  ['crossed quantiles',(p:any)=>p.p25=1,'PREDICTION_QUANTILES_INVALID'],
  ['boolean median',(p:any)=>p.median=true,'PREDICTION_QUANTILES_INVALID'],
  ['nonfinite median',(p:any)=>p.median=Infinity,'PREDICTION_QUANTILES_INVALID'],
  ['impossible long return',(p:any)=>p.p10=-101,'PREDICTION_QUANTILES_INVALID'],
  ['private field',(p:any)=>p.notes='private-fixture-note','PREDICTION_METADATA_INVALID'],
] as const)test('precomputed prediction rejects '+name,()=>{
  const source=input();change(source.windows.find(w=>w.id==='holdout-a').prediction);const r=evaluated(source);assert.equal(row(r,'holdout-a').code,code);
  assert.equal(summary(r).pairedCount,1);assert.equal(summary(r).model.count,summary(r).noChange.count);assert(!JSON.stringify(r).includes('private-fixture-note'));
});
test('a supplied training receipt cannot include a purged but eventually observed label',()=>{
  const source=input();source.windows.find(w=>w.id==='validation-a').prediction.trainingWindowIds.push('train-overlap');
  assert.equal(row(evaluated(source),'validation-a').code,'PREDICTION_TRAINING_SET_MISMATCH');
});
test('missing prediction, missing labels and tampered archive remain in coverage instead of scoring a convenient subset',()=>{
  const source=input();source.windows.find(w=>w.id==='holdout-b').archive.artifacts.delete('outcomes');const r=evaluated(source);
  assert.equal(row(r,'holdout-b').code,'ARTIFACT_BYTES_MISSING');assert.equal(r.coverage.needsData,2);assert.equal(summary(r).suppliedWindowCount,4);assert.equal(summary(r).pairedCount,1);
  source.windows.find(w=>w.id==='train-a').archive.manifestBytes=Buffer.from('tampered');const changed=evaluated(source);
  assert.equal(row(changed,'train-a').code,'MANIFEST_PIN_MISMATCH');assert.equal(row(changed,'validation-a').code,'TRAINING_SAMPLE_INSUFFICIENT');
});
test('minimum feature lookback is enforced for contexts and predictions',()=>{
  const source=input();source.config.minimumFeatureSessions=3;const r=evaluated(source);assert.equal(r.coverage.scored,0);assert.equal(r.status,'insufficient');assert.equal(row(r,'train-a').code,'MODEL_LOOKBACK_INSUFFICIENT');
});
test('future origins and outside-protocol rows do not inspect their archive bytes',()=>{
  const source=input();const extra=structuredClone(source.windows[0]);extra.id='future';extra.archive.request.decisionAt='2026-08-10T20:10:00Z';extra.archive.manifestBytes=Buffer.from('private-fixture-note');source.windows.push(extra);
  const outside=structuredClone(extra);outside.id='outside';outside.archive.request.decisionAt='2026-08-15T00:00:00Z';source.windows.push(outside);
  const r=evaluated(source);assert.equal(row(r,'future').code,'FUTURE_ORIGIN');assert.equal(row(r,'outside').code,'OUTSIDE_PROTOCOL');assert.equal(r.coverage.pending,2);assert.equal(r.coverage.excluded,1);assert(!JSON.stringify(r).includes('private-fixture-note'));
});
test('equivalent offset assessment and prediction times are accepted without losing microseconds',()=>{
  const source=input();source.windows[0].archive.request.assessedAt='2026-08-04T03:30:00+05:30';
  source.windows.find(w=>w.id==='holdout-a').prediction.issuedAt='2026-07-09T01:40:00+05:30';assert.equal(evaluated(source).coverage.scored,4);
});
test('different assessment clocks cannot mix future labels into the same report',()=>{
  const source=input();source.windows.find(w=>w.id==='holdout-a').archive.request.assessedAt='2026-08-03T22:00:00.000001Z';assert.equal(row(evaluated(source),'holdout-a').code,'ASSESSMENT_CUTOFF_MISMATCH');
});
for(const [key,value,code] of [
  ['minimumTrainingRows',0,'EVALUATION_CONFIG_INVALID'],['minimumTrainingRows',true,'EVALUATION_CONFIG_INVALID'],['minimumFeatureSessions',4001,'EVALUATION_CONFIG_INVALID'],
  ['gapMs',-1,'EVALUATION_CONFIG_INVALID'],['gapMs',Infinity,'EVALUATION_CONFIG_INVALID'],['modelFrozenAt','2026-07-08T00:00:00Z','EVALUATION_CUTOFF_INVALID'],
  ['validationStartAt','2026-05-31T00:00:00Z','EVALUATION_CUTOFF_INVALID'],['holdoutEndAt','2026-07-07T00:00:00Z','EVALUATION_CUTOFF_INVALID'],
] as const)test('protocol rejects invalid configuration '+key+'='+value,()=>{const source=input();source.config[key]=value as never;invalid(source,code);});
test('duplicate IDs and duplicate semantic origins cannot inflate the evaluation',()=>{
  const source=input();source.windows.push(source.windows[0]);invalid(source,'EVALUATION_DUPLICATE_ID');
  const other=input();const duplicate=structuredClone(other.windows[0]);duplicate.id='duplicate';duplicate.archive.request.decisionAt='2026-06-03T01:40:00+05:30';other.windows.push(duplicate);invalid(other,'EVALUATION_DUPLICATE_ORIGIN');
});
test('empty/oversized/unknown batches and exceptional access fail with fixed errors',()=>{
  const source=input();source.windows=[];invalid(source,'EVALUATION_WINDOW_LIMIT');source.windows=Array(33).fill(input().windows[0]);invalid(source,'EVALUATION_WINDOW_LIMIT');
  for(const value of [null,{},undefined,[]])invalid(value,'EVALUATION_PROTOCOL_INVALID');
  const privateInput=input();Object.defineProperty(privateInput,'config',{get(){throw Error('private-fixture-note');}});invalid(privateInput,'EVALUATION_INPUT_INVALID');
});
test('bounded total byte work leaves unassessed windows visible',()=>{
  const source=input(),window=source.windows[0];const bytes=encode({padding:'x'.repeat(2*1024*1024-100)});
  const manifest=JSON.parse(window.archive.manifestBytes.toString());manifest.calendar.sha256=hash(bytes);manifest.calendar.byteLength=bytes.length;
  const manifestBytes=encode(manifest);source.windows=Array.from({length:32},(_,i)=>{
    const w=structuredClone(window);w.id='budget-'+i;w.archive.request.decisionAt=new Date(Date.parse(window.archive.request.decisionAt)+i*1000).toISOString();
    w.archive.manifestBytes=manifestBytes;w.archive.expectedManifestSha256=hash(manifestBytes);w.archive.artifacts.set('calendar',bytes);return w;
  });
  const r=evaluated(source);assert(r.coverage.unassessed>0);assert.equal(r.coverage.supplied,32);assert(r.usage.inspectedBytes<=r.usage.maximumInspectedBytes);
  assert.equal(r.coverage.scored,0);assert.equal(r.coverage.unassessed+r.coverage.needsData,32);
});
test('large finite forecast errors produce finite scale-safe RMSE and means',()=>{
  const source=input();for(const id of ['holdout-a','holdout-b']){const p=source.windows.find(w=>w.id===id).prediction;for(const key of ['p10','p25','median','p75','p90'])p[key]=Number.MAX_VALUE;}
  const r=evaluated(source);assert.equal(row(r,'holdout-a').status,'scored');assert(Number.isFinite(summary(r).model.maePP));assert(Number.isFinite(summary(r).model.rmsePP));assert.doesNotThrow(()=>JSON.stringify(r));
});
test('small close-to-close returns avoid cancellation before interval comparison and scoring',()=>{
  const source=input();changedArchive(source.windows.find(w=>w.id==='holdout-a'),'outcomes',a=>a.records.forEach((p:any,i:number)=>{p.rawClose=1e16+(i===a.records.length-1?2:0);p.adjustedClose=p.rawClose;}));
  const r=evaluated(source);close(row(r,'holdout-a').actualReturnPct,2e-14,1e-29);
});
test('the engine has no ambient clock/network/model capability and the fixed CLI uses its actual path',()=>{
  const source=input(),now=Date.now,fetch=globalThis.fetch;Date.now=()=>{throw Error('Clock forbidden');};globalThis.fetch=()=>{throw Error('Network forbidden');};
  try{assert.equal(evaluated(source).coverage.scored,4);}finally{Date.now=now;globalThis.fetch=fetch;}
  const raw=execFileSync(process.execPath,['scripts/forecast-walk-forward-demo.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});const receipt=JSON.parse(raw);assert.equal(receipt.fictional,true);assert.equal(receipt.result.coverage.scored,4);assert.equal(receipt.result.predictionProvenanceVerified,false);
  const rejected=spawnSync(process.execPath,['scripts/forecast-walk-forward-demo.mjs','--input','private-file'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});assert.equal(rejected.status,2);assert.equal(rejected.stdout,'');assert(!rejected.stderr.includes('private-file'));
});
