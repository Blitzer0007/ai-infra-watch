// Deterministic reference-model replay. No IO, ambient clock, provider or writer.
import { createHash } from 'node:crypto';
import { evaluateArchivedForecastWindow } from './forecastArchiveAdapter.js';
import { FORECAST_WALK_FORWARD_PROTOCOL, validateForecastWalkForwardInput, forecastPartitionAt,
  forecastInstrument, selectForecastTraining, evaluateWalkForwardForecasts } from './forecastWalkForward.js';
import { forecastInstantMicros, forecastHorizon } from '../../src/utils/forecastInputs.js';

export const FORECAST_RUNNER_PROTOCOL='forecast-model-run-v1-experimental';
export const FORECAST_REFERENCE_MODEL='empirical-return-quantiles-v1';
const MAX_BYTES=32*1024*1024, MAX_BUNDLE=3*2*1024*1024+32768, MAX_CALLS=256, MAX_RUN_BYTES=1024*1024;
const authority=()=>({sourceVerified:false,predictionProvenanceVerified:false,modelFitVerified:false,productionEligible:false,predictiveValidityEstablished:false});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sorted=v=>Array.isArray(v)?v.map(sorted):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const bytes=v=>Buffer.from(JSON.stringify(sorted(v))+'\n');
class RunnerError extends Error {}
const stop=code=>{throw new RunnerError(code);};
const failed=code=>({protocolVersion:FORECAST_RUNNER_PROTOCOL,status:'needs-data',code,...authority()});

function inputs(input) {
  if(!exact(input,['protocolVersion','assessedAt','config','windows'])||input.protocolVersion!==FORECAST_RUNNER_PROTOCOL||!Array.isArray(input.windows))stop('RUN_INPUT_INVALID');
  if(input.windows.some(w=>!exact(w,['id','archive'])))stop('RUN_WINDOW_INVALID');
  const walked={...input,protocolVersion:FORECAST_WALK_FORWARD_PROTOCOL,windows:input.windows.map(w=>({...w,prediction:null}))};
  const checked=validateForecastWalkForwardInput(walked);
  if(input.config.modelId!==FORECAST_REFERENCE_MODEL)stop('RUN_MODEL_UNSUPPORTED');
  return {...checked,walked};
}

function quantiles(values) {
  const ordered=[...values].sort((a,b)=>a-b);
  const result=[.1,.25,.5,.75,.9].map(q=>{
    const at=(ordered.length-1)*q,lo=Math.floor(at),hi=Math.ceil(at),weight=at-lo;
    return ordered[lo]*(1-weight)+ordered[hi]*weight;
  });
  if(result.some(v=>!Number.isFinite(v)||v< -100)||!Number.isFinite(result[4]-result[0]))stop('RUN_MODEL_NUMERICS_INVALID');
  return result;
}
const modelImplementationSha256=hash(Buffer.from(Function.prototype.toString.call(quantiles)));
const trainingPolicySha256=hash(Buffer.from(Function.prototype.toString.call(selectForecastTraining)));

/**
 * Actually fits a bounded empirical reference distribution and generates forecasts.
 * All cutoffs are retrospective declarations; hashes/replay do not attest issuance.
 * Forecast-origin reads never inspect that origin's outcome bytes. Training reads
 * use their fit cutoff, so future/purged/held-out labels cannot enter the model.
 */
export function generateForecastRun(input) {
  try {
    const {config,times,assessed}=inputs(input), configSha256=hash(bytes(config));
    const runnerImplementationSha256=hash(Buffer.from(Function.prototype.toString.call(generateForecastRun)));
    const rows=input.windows.map(window=>{
      const request=window.archive.request,decision=forecastInstantMicros(request?.decisionAt),identity=forecastInstrument(request);
      const horizon=forecastHorizon(request?.horizonSessions),partition=decision===null?'unassigned':forecastPartitionAt(decision,times);
      return {window,decision,horizon,partition,...identity,
        valid:decision!==null&&identity.symbol!==null&&identity.venue!==null&&identity.currency!==null&&[5,20].includes(horizon)&&forecastInstantMicros(request.assessedAt)===assessed};
    }).sort((a,b)=>a.decision===null?(b.decision===null?a.window.id.localeCompare(b.window.id):1):b.decision===null?-1:a.decision<b.decision?-1:a.decision>b.decision?1:a.window.id.localeCompare(b.window.id));
    let inspectedBytes=0,archiveCalls=0;
    const cache=new Map(),fits=new Map();
    const inspect=(row,cutoffAt)=>{
      const key=JSON.stringify([row.window.id,cutoffAt]);
      if(cache.has(key))return cache.get(key);
      if(archiveCalls>=MAX_CALLS||MAX_BYTES-inspectedBytes<MAX_BUNDLE)stop('RUN_RESOURCE_LIMIT');
      archiveCalls+=1;
      const archive=evaluateArchivedForecastWindow({...row.window.archive,request:{...row.window.archive.request,assessedAt:cutoffAt}});
      inspectedBytes+=archive.receipt.inspectedBytes;
      cache.set(key,archive);
      return archive;
    };
    const windows=rows.map(row=>{
      const base={id:row.window.id,partition:row.partition,status:'needs-data',code:'RUN_WINDOW_INVALID',prediction:null,fitSha256:null,features:null,training:null};
      if(!row.valid)return base;
      if(row.partition==='outside')return {...base,status:'excluded',code:'OUTSIDE_PROTOCOL'};
      if(row.decision>assessed)return {...base,status:'pending',code:'FUTURE_ORIGIN'};
      if(row.partition==='train')return {...base,status:'training-context',code:'TRAINING_ONLY'};
      try {
        const origin=inspect(row,row.window.archive.request.decisionAt);
        if(origin.status!=='pending')return {...base,code:origin.code};
        if(origin.assessment.featureCount<config.minimumFeatureSessions)return {...base,code:'MODEL_LOOKBACK_INSUFFICIENT'};
        base.features={calendarSha256:origin.receipt.artifactSha256.calendar,featuresSha256:origin.receipt.artifactSha256.features,
          featureCount:origin.assessment.featureCount,featureVintageId:origin.assessment.featureVintageId};
        const cutoffAt=row.partition==='holdout'?config.modelFrozenAt:row.window.archive.request.decisionAt;
        const cutoff=forecastInstantMicros(cutoffAt),scope={symbol:row.symbol,venue:row.venue,currency:row.currency,horizonSessions:row.horizon};
        const fitKey=JSON.stringify([scope.symbol,scope.venue,scope.currency,scope.horizonSessions,cutoff.toString()]);
        let fitted=fits.get(fitKey);
        if(!fitted){
          const candidates=rows.filter(other=>other.horizon===row.horizon&&other.symbol===row.symbol&&other.venue===row.venue&&other.currency===row.currency&&
            (other.partition==='train'||(row.partition==='holdout'&&other.partition==='validation'))&&other.decision!==null&&other.decision<cutoff);
          const loaded=candidates.map(other=>{
            if(!other.valid)return {...other,status:'needs-data'};
            // Plan/validate features at the training origin first. A label whose
            // close+gap touches the fit cutoff is purged without reading it.
            const first=inspect(other,other.window.archive.request.decisionAt),planned=first.assessment;
            if(first.status!=='pending'||planned.featureCount<config.minimumFeatureSessions)return {...other,status:'needs-data'};
            const target=forecastInstantMicros(planned.plan.targetCloseAt);
            if(target+BigInt(config.gapMs)*1000n>=cutoff)return {...other,status:other.partition==='train'?'training-context':'candidate',target,labelAvailable:null,actual:null,archive:first};
            const archive=inspect(other,cutoffAt),a=archive.assessment;
            const valid=archive.status==='conditional-outcome'||archive.status==='pending';
            return {...other,status:valid&&a.featureCount>=config.minimumFeatureSessions?(other.partition==='train'?'training-context':'candidate'):'needs-data',
              target:a?.plan?forecastInstantMicros(a.plan.targetCloseAt):null,
              labelAvailable:forecastInstantMicros(archive.receipt.snapshotAvailableAt.outcomes),actual:a?.outcome?.grossReturnPct??null,archive};
          });
          const selection=selectForecastTraining(row,loaded,config,times);
          base.training=selection.receipt;
          if(selection.eligible.length<config.minimumTrainingRows)return {...base,code:'TRAINING_SAMPLE_INSUFFICIENT'};
          const training=selection.eligible.map(other=>({id:other.window.id,decisionAt:other.window.archive.request.decisionAt,
            targetCloseAt:other.archive.assessment.plan.targetCloseAt,labelAvailableAt:other.archive.receipt.snapshotAvailableAt.outcomes,
            actualReturnPct:other.actual,artifactSha256:{...other.archive.receipt.artifactSha256}}));
          const artifact={schemaVersion:'forecast-model-fit-v1',modelId:FORECAST_REFERENCE_MODEL,modelImplementationSha256,runnerImplementationSha256,trainingPolicySha256,configSha256,scope,
            fitCutoffAt:cutoffAt,training,quantiles:quantiles(training.map(r=>r.actualReturnPct))};
          fitted={sha256:hash(bytes(artifact)),artifact,selection:selection.receipt};
          fits.set(fitKey,fitted);
        }
        const [p10,p25,median,p75,p90]=fitted.artifact.quantiles;
        return {...base,status:'generated',code:'DETERMINISTIC_REFERENCE_PREDICTION',training:fitted.selection,fitSha256:fitted.sha256,
          prediction:{modelId:FORECAST_REFERENCE_MODEL,issuedAt:row.window.archive.request.decisionAt,trainingWindowIds:fitted.artifact.training.map(t=>t.id),p10,p25,median,p75,p90}};
      }catch(error){return {...base,code:error instanceof RunnerError?error.message:'RUN_WINDOW_INVALID'};}
    });
    const artifact={schemaVersion:'forecast-generated-run-v1',protocolVersion:FORECAST_RUNNER_PROTOCOL,modelId:FORECAST_REFERENCE_MODEL,modelImplementationSha256,runnerImplementationSha256,trainingPolicySha256,
      assessedAt:input.assessedAt,config:{...config},configSha256,clockScope:'retrospective-declared-origins-not-issuance-attestation',
      fits:[...fits.values()].map(({sha256,artifact})=>({sha256,artifact})),windows,
      coverage:{supplied:windows.length,generated:windows.filter(w=>w.status==='generated').length,trainingContext:windows.filter(w=>w.status==='training-context').length,
        pending:windows.filter(w=>w.status==='pending').length,needsData:windows.filter(w=>w.status==='needs-data').length,excluded:windows.filter(w=>w.status==='excluded').length},
      usage:{archiveCalls,inspectedBytes,maximumArchiveCalls:MAX_CALLS,maximumInspectedBytes:MAX_BYTES},...authority()};
    const runBytes=bytes(artifact);
    if(runBytes.length>MAX_RUN_BYTES)stop('RUN_ARTIFACT_TOO_LARGE');
    return {protocolVersion:FORECAST_RUNNER_PROTOCOL,status:'generated-artifact',runBytes,sha256:hash(runBytes),artifact,...authority()};
  }catch(error){return failed(error instanceof RunnerError?error.message:'RUN_INPUT_INVALID');}
}

/** Verify a separately selected pin and replay before exposing forecasts to scoring. */
export function evaluateGeneratedForecastRun(args) {
  try {
    if(!exact(args,['input','runBytes','expectedRunSha256'])||typeof args.expectedRunSha256!=='string'||!/^[a-f0-9]{64}$/.test(args.expectedRunSha256))stop('RUN_PIN_REQUIRED');
    if(!(args.runBytes instanceof Uint8Array)||args.runBytes.byteLength<1||args.runBytes.byteLength>MAX_RUN_BYTES||
      (typeof SharedArrayBuffer!=='undefined'&&args.runBytes.buffer instanceof SharedArrayBuffer))stop('RUN_BYTES_INVALID');
    const selected=Buffer.from(args.runBytes);
    if(hash(selected)!==args.expectedRunSha256)stop('RUN_PIN_MISMATCH');
    const generated=generateForecastRun(args.input);
    if(generated.status!=='generated-artifact'||!selected.equals(generated.runBytes))stop('RUN_REPLAY_MISMATCH');
    const predictions=new Map(generated.artifact.windows.map(row=>[row.id,row.prediction]));
    const {walked}=inputs(args.input);
    const evaluation=evaluateWalkForwardForecasts({...walked,windows:walked.windows.map(w=>({...w,prediction:predictions.get(w.id)??null}))});
    return {protocolVersion:FORECAST_RUNNER_PROTOCOL,status:'reproduced-evaluation',runSha256:args.expectedRunSha256,
      computationReproduced:true,generation:generated.artifact,evaluation,
      usage:{replayInspectedBytes:generated.artifact.usage.inspectedBytes,evaluationInspectedBytes:evaluation.usage?.inspectedBytes??0,
        maximumCombinedInspectedBytes:2*MAX_BYTES},...authority()};
  }catch(error){return failed(error instanceof RunnerError?error.message:'RUN_INPUT_INVALID');}
}
