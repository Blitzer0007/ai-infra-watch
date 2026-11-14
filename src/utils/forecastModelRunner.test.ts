import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {generateForecastRun,evaluateGeneratedForecastRun,FORECAST_RUNNER_PROTOCOL,FORECAST_REFERENCE_MODEL} from '../../server/utils/forecastModelRunner.js';
import {fictionalModelRunInput} from '../../scripts/fixtures/forecast-model-runner.fictional.mjs';
import {fictionalForecastWindow} from '../../scripts/fixtures/forecast-walk-forward.fictional.mjs';
const input=()=>fictionalModelRunInput();
const encode=(v:any)=>Buffer.from(JSON.stringify(v)+'\n');
const hash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
const run=(v:any=input())=>{const r=generateForecastRun(v);assert.equal(r.status,'generated-artifact');assert('artifact' in r);return r;};
const row=(r:any,id:string)=>r.artifact.windows.find((w:any)=>w.id===id);
const fit=(r:any,id:string)=>r.artifact.fits.find((f:any)=>f.sha256===row(r,id).fitSha256).artifact;
const scored=(v:any,r:any=run(v))=>evaluateGeneratedForecastRun({input:v,runBytes:r.runBytes,expectedRunSha256:r.sha256}) as any;
function changeArchive(w:any,role:string,change:(a:any)=>void){
  const document=JSON.parse(w.archive.artifacts.get(role).toString());change(document);const bytes=encode(document);
  w.archive.artifacts.set(role,bytes);const manifest=JSON.parse(w.archive.manifestBytes.toString());
  manifest[role].sha256=hash(bytes);manifest[role].byteLength=bytes.length;w.archive.manifestBytes=encode(manifest);w.archive.expectedManifestSha256=hash(w.archive.manifestBytes);
}
function noAuthority(r:any){for(const k of ['sourceVerified','predictionProvenanceVerified','modelFitVerified','productionEligible','predictiveValidityEstablished'])assert.equal(r[k],false);}

test('actually fitted reference forecasts compose with pinned replay and paired evaluation',()=>{
  const v=input(),r=run(v);assert.deepEqual(r.artifact.coverage,{supplied:9,generated:6,trainingContext:3,pending:0,needsData:0,excluded:0});
  assert.equal(r.artifact.fits.length,3);assert.deepEqual(fit(r,'validation-a').quantiles,[11,12.5,15,17.5,19]);
  for(const f of r.artifact.fits){
    for(const key of ['modelImplementationSha256','runnerImplementationSha256','trainingPolicySha256','configSha256'])assert.match(f.artifact[key],/^[a-f0-9]{64}$/);
    for(const t of f.artifact.training)for(const role of ['calendar','features','outcomes'])assert.match(t.artifactSha256[role],/^[a-f0-9]{64}$/);
  }
  assert.deepEqual(fit(r,'validation-b').quantiles,[-6,0,10,15,18]);assert.deepEqual(fit(r,'holdout-a').quantiles,[-10,-10,10,10,16]);
  const e=scored(v,r);assert.equal(e.status,'reproduced-evaluation');assert.equal(e.computationReproduced,true);noAuthority(e);noAuthority(e.evaluation);noAuthority(r.artifact);
  assert.deepEqual(e.evaluation.coverage,{supplied:9,scored:5,trainingContext:3,pending:1,needsData:0,excluded:0,unassessed:0});
  for(const s of e.evaluation.summaries.filter((s:any)=>s.pairedCount))assert.equal(s.modelMinusTrainingMaePP,0);
  assert.equal(e.evaluation.summaries[0].model.maePP,12.5);
  assert(Math.abs(e.evaluation.summaries[2].model.maePP-20/3)<1e-12);
});
test('input order, field order, output mutation and repetition cannot alter pinned computation',()=>{
  const v=input(),before=v.windows.map(w=>w.id),first=run(v);const reversed=input();reversed.windows.reverse();
  reversed.config=Object.fromEntries(Object.entries(reversed.config).reverse()) as any;
  assert.equal(run(reversed).sha256,first.sha256);assert.deepEqual(v.windows.map(w=>w.id),before);
  first.artifact.fits[0].artifact.training[0].actualReturnPct=999;assert.equal(run(v).sha256,first.sha256);
  assert.notEqual(hash(Buffer.from(first.runBytes).fill(0)),first.sha256);
});
test('generation never retrieves holdout outcome bytes, including matured and pending targets',()=>{
  const v=input(),holdout=new Set(v.windows.filter(w=>w.id.startsWith('holdout')||w.id==='missing-prediction').map(w=>w.archive.artifacts));
  const original=Map.prototype.get;let forbiddenReads=0;
  Map.prototype.get=function(key:any){if(holdout.has(this)&&key==='outcomes'){forbiddenReads++;throw Error('future private outcome');}return original.call(this,key);};
  try{assert.equal(run(v).artifact.coverage.generated,6);assert.equal(forbiddenReads,0);}finally{Map.prototype.get=original;}
});
test('changing held-out returns never changes fit parameters or predictions',()=>{
  const original=run(),v=input();
  for(const w of v.windows.filter(w=>w.id.startsWith('holdout')||w.id==='missing-prediction'))changeArchive(w,'outcomes',a=>{a.records.at(-1).adjustedClose=150;a.records.at(-1).rawClose=150;});
  const changed=run(v);assert.deepEqual(changed.artifact.fits,original.artifact.fits);
  assert.deepEqual(changed.artifact.windows.map((w:any)=>w.prediction),original.artifact.windows.map((w:any)=>w.prediction));
});
test('pending targets receive forecasts without fabricating outcomes',()=>{
  const v=input();v.windows.find(w=>w.id==='holdout-pending')!.archive.artifacts.set('outcomes',Buffer.from('private future bytes'));
  const r=run(v);assert.equal(row(r,'holdout-pending').status,'generated');assert.equal(row(r,'holdout-pending').prediction.median,10);
  const e=scored(v,r);const pending=e.evaluation.windows.find((w:any)=>w.id==='holdout-pending');assert.equal(pending.status,'pending');assert.equal(pending.actualReturnPct,null);
  assert(!JSON.stringify(e).includes('private future bytes'));
});
test('validation expands training-only labels and holdout reuses one pre-holdout fit',()=>{
  const r=run(fictionalModelRunInput('2026-08-10T22:00:00Z'));
  assert.deepEqual(row(r,'validation-a').training.eligibleIds,['train-a','train-b']);assert.deepEqual(row(r,'validation-a').training.purgedOverlapIds,['train-overlap']);
  assert.deepEqual(row(r,'validation-b').training.eligibleIds,['train-a','train-b','train-overlap']);
  for(const id of ['holdout-a','holdout-b','missing-prediction','holdout-pending'])assert.equal(row(r,id).fitSha256,row(r,'holdout-a').fitSha256);
  assert.deepEqual(fit(r,'holdout-a').training.map((t:any)=>t.id),['train-a','train-b','train-overlap','validation-a','validation-b']);
});
test('a target touching the fit cutoff is purged before its just-published outcome can enter a fit',()=>{
  const v=input();v.config.modelFrozenAt='2026-07-06T20:00:00Z';const r=run(v);
  assert.deepEqual(row(r,'holdout-a').training.purgedOverlapIds,['validation-b']);
  assert(!fit(r,'holdout-a').training.some((t:any)=>t.id==='validation-b'));
});
test('purged outcome byte retrieval is forbidden even when its target has just closed',()=>{
  const v=input();v.config.modelFrozenAt='2026-07-06T20:00:00Z';const forbidden=v.windows.find(w=>w.id==='validation-b')!.archive.artifacts;
  const original=Map.prototype.get;let reads=0;
  Map.prototype.get=function(key:any){if(this===forbidden&&key==='outcomes'){reads++;throw Error('purged label forbidden');}return original.call(this,key);};
  try{const r=run(v);assert.equal(row(r,'holdout-a').status,'generated');assert.equal(reads,0);}finally{Map.prototype.get=original;}
});
test('calendar-time gap remains strict and does not pretend to count exchange sessions',()=>{
  const v=input();v.config.gapMs=2*86400000;const r=run(v);
  assert.equal(row(r,'validation-a').code,'TRAINING_SAMPLE_INSUFFICIENT');assert.deepEqual(row(r,'validation-a').training.purgedOverlapIds,['train-b','train-overlap']);
});
test('one microsecond of unavailable training vintage changes eligibility without borrowing later data',()=>{
  const v=input();changeArchive(v.windows.find(w=>w.id==='train-b'),'outcomes',a=>{a.publishedAt='2026-06-18T20:10:00.000001Z';});
  const r=run(v);assert.equal(row(r,'validation-a').code,'TRAINING_SAMPLE_INSUFFICIENT');assert(row(r,'validation-a').training.unavailableIds.includes('train-b'));
  assert.equal(row(r,'validation-b').status,'generated');
});
test('another issuer cannot enter a fit and 20-session cohorts remain separate',()=>{
  const v=input();
  for(const [id,symbol,horizonSessions,targetDate] of [['other','OTHER',5,'2026-06-10'],['twenty','FICT',20,'2026-07-02']] as const){
    const w=fictionalForecastWindow({id,symbol,horizonSessions,decisionAt:'2026-06-02T20:10:00Z',entryDate:'2026-06-03',targetDate,actualReturnPct:90,assessedAt:v.assessedAt});v.windows.push({id:w.id,archive:w.archive});
  }
  assert.deepEqual(fit(run(v),'validation-a').training.map((t:any)=>t.id),['train-a','train-b']);
});
test('missing own labels cannot prevent generation but remain missing in scoring coverage',()=>{
  const v=input();v.windows.find(w=>w.id==='holdout-b')!.archive.artifacts.delete('outcomes');const r=run(v);
  assert.equal(row(r,'holdout-b').status,'generated');const e=scored(v,r);assert.equal(e.evaluation.coverage.scored,4);assert.equal(e.evaluation.coverage.needsData,1);
  assert.equal(e.evaluation.coverage.supplied,9);
});
test('bad feature identity blocks an origin even under valid hashes',()=>{
  const v=input();changeArchive(v.windows.find(w=>w.id==='holdout-b'),'features',a=>{a.symbol='OTHER';});
  const r=run(v);assert.equal(row(r,'holdout-b').status,'needs-data');assert.equal(row(r,'holdout-b').prediction,null);
});
test('genuine zero and identical training labels produce valid zero-width quantiles',()=>{
  const v=input();for(const w of v.windows.filter(w=>w.id.startsWith('train')))changeArchive(w,'outcomes',a=>{for(const r of a.records){r.adjustedClose=100;r.rawClose=100;}});
  assert.deepEqual(fit(run(v),'validation-a').quantiles,[0,0,0,0,0]);
});
test('constant fractional labels stay constant and ordered in both model and matched baseline',()=>{
  const v=input(),expected=((100.04-100)/100)*100;
  for(const w of v.windows.filter(w=>w.id.startsWith('train')))changeArchive(w,'outcomes',a=>{a.records.at(-1).adjustedClose=100.04;a.records.at(-1).rawClose=100.04;});
  const r=run(v);assert.deepEqual(fit(r,'validation-a').quantiles,[expected,expected,expected,expected,expected]);
  const e=scored(v,r);assert.equal(e.evaluation.coverage.scored,5);
  const validation=e.evaluation.summaries[0];assert.equal(validation.model.centralMeanWidthPP,0);assert.equal(validation.trainingDistribution.wideMeanWidthPP,0);
  assert.equal(validation.modelMinusTrainingMaePP,0);
});
test('future origins and outside-protocol windows do not inspect their archives',()=>{
  const v=fictionalModelRunInput('2026-07-08T21:00:00Z');for(const w of v.windows.filter(w=>w.archive.request.decisionAt>v.assessedAt))w.archive.manifestBytes=Buffer.from('private future bytes');
  const r=run(v);assert.equal(row(r,'holdout-b').status,'pending');assert.equal(row(r,'holdout-b').prediction,null);assert(!JSON.stringify(r.artifact).includes('private future bytes'));
  const outside=input();outside.config.holdoutEndAt='2026-07-10T00:00:00Z';outside.windows.find(w=>w.id==='holdout-b')!.archive.manifestBytes=Buffer.from('outside');assert.equal(row(run(outside),'holdout-b').status,'excluded');
});
for(const [name,change] of [
  ['wrong protocol',(v:any)=>v.protocolVersion='other'],['unknown model',(v:any)=>v.config.modelId='other'],
  ['caller model callback',(v:any)=>v.model=()=>0],['supplied prediction',(v:any)=>v.windows[3].prediction={median:0}],
  ['duplicate ID',(v:any)=>v.windows.push(v.windows[0])],['duplicate origin',(v:any)=>v.windows.push({...v.windows[0],id:'duplicate'})],
  ['too many windows',(v:any)=>v.windows=Array.from({length:33},(_,i)=>({...v.windows[0],id:'w'+i}))],
  ['bad freeze',(v:any)=>v.config.modelFrozenAt=v.config.holdoutStartAt],['boolean threshold',(v:any)=>v.config.minimumTrainingRows=true],
] as const)test('runner rejects '+name,()=>{const v=input();change(v);const r=generateForecastRun(v);assert.equal(r.status,'needs-data');noAuthority(r);assert(!JSON.stringify(r).includes('private'));});
test('selected artifact pin and exact deterministic replay are both mandatory',()=>{
  const v=input(),r=run(v);
  assert.equal((evaluateGeneratedForecastRun({input:v,runBytes:r.runBytes,expectedRunSha256:null}) as any).code,'RUN_PIN_REQUIRED');
  assert.equal((evaluateGeneratedForecastRun({input:v,runBytes:r.runBytes,expectedRunSha256:'0'.repeat(64)}) as any).code,'RUN_PIN_MISMATCH');
  const forged=JSON.parse(r.runBytes.toString());forged.windows[3].prediction.median=999;const changed=Buffer.from(JSON.stringify(forged)+'\n');
  assert.equal((evaluateGeneratedForecastRun({input:v,runBytes:changed,expectedRunSha256:hash(changed)}) as any).code,'RUN_REPLAY_MISMATCH');
  const altered=input();altered.config.minimumTrainingRows=3;assert.equal((evaluateGeneratedForecastRun({input:altered,runBytes:r.runBytes,expectedRunSha256:r.sha256}) as any).code,'RUN_REPLAY_MISMATCH');
});
test('untrusted or shared run byte storage fails without returning its content',()=>{
  const v=input();for(const b of [Buffer.alloc(1024*1024+1),new Uint8Array(new SharedArrayBuffer(10))]){
    const r=evaluateGeneratedForecastRun({input:v,runBytes:b,expectedRunSha256:'0'.repeat(64)}) as any;assert.equal(r.code,'RUN_BYTES_INVALID');
  }
  const b=Buffer.from('private malformed artifact');assert.equal((evaluateGeneratedForecastRun({input:v,runBytes:b,expectedRunSha256:hash(b)}) as any).code,'RUN_REPLAY_MISMATCH');
});
function manyWindows(){
  const sample=input(),calendar=JSON.parse(sample.windows[0].archive.artifacts.get('calendar')!.toString());const sessions=calendar.days.filter((d:any)=>d.status==='open');
  const specs=[...sessions.slice(1,17),...sessions.filter((s:any)=>s.date>='2026-07-15').slice(0,16)];
  return {...sample,assessedAt:'2026-08-30T22:00:00Z',config:{...sample.config,validationStartAt:'2026-07-15T00:00:00Z',modelFrozenAt:'2026-08-14T20:10:00Z',holdoutStartAt:'2026-08-15T00:00:00Z',holdoutEndAt:'2026-08-31T00:00:00Z',minimumTrainingRows:1},windows:specs.map((s:any,i:number)=>{
    const at=sessions.findIndex((d:any)=>d.date===s.date);const w=fictionalForecastWindow({id:'budget-'+i,decisionAt:s.date+'T20:10:00Z',entryDate:sessions[at+1].date,targetDate:sessions[at+6].date,actualReturnPct:0,assessedAt:'2026-08-30T22:00:00Z'});return {id:w.id,archive:w.archive};
  })};
}
test('archive-attempt work is bounded and ungenerated rows stay in coverage',()=>{
  const r=run(manyWindows());assert(r.artifact.usage.archiveCalls<=256);assert.equal(r.artifact.coverage.supplied,32);assert(r.artifact.windows.some((w:any)=>w.code==='RUN_RESOURCE_LIMIT'));
});
test('byte budget also bounds invalid loaded archives without exposing raw content',()=>{
  const v=manyWindows(),large=Buffer.alloc(2*1024*1024,120);for(const w of v.windows.slice(0,16))w.archive.artifacts.set('features',large);
  const r=run(v);assert(r.artifact.usage.inspectedBytes<=32*1024*1024);assert(r.artifact.windows.some((w:any)=>w.code==='RUN_RESOURCE_LIMIT'));assert.equal(r.artifact.coverage.supplied,32);
});
test('no ambient clock, fetch, overridden Map getter or external CLI path is used',()=>{
  const v=input();const oldNow=Date.now,oldFetch=globalThis.fetch;let invoked=0;
  for(const w of v.windows)(w.archive.artifacts as any).get=()=>{invoked++;throw Error('overridden retrieval');};
  Date.now=()=>{throw Error('clock forbidden');};globalThis.fetch=()=>{throw Error('network forbidden');};
  try{assert.equal(run(v).artifact.coverage.generated,6);assert.equal(invoked,0);}finally{Date.now=oldNow;globalThis.fetch=oldFetch;}
  const result=JSON.parse(execFileSync(process.execPath,['scripts/forecast-model-runner-demo.mjs'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000}));
  assert.equal(result.fictional,true);assert.equal(result.result.status,'reproduced-evaluation');assert.equal(result.result.generation.coverage.generated,6);
  const denied=spawnSync(process.execPath,['scripts/forecast-model-runner-demo.mjs','--input','private-path'],{env:{PATH:process.env.PATH},encoding:'utf8',timeout:5000});assert.equal(denied.status,2);assert.equal(denied.stdout,'');assert(!denied.stderr.includes('private-path'));
});
