/** Minimized, frozen app-metadata adapter. No network, storage or eligibility mutation. */
export type SourceObservation = {
  evidence_id:string; symbol:string; returned_symbol:string|null;
  provider:'yahoo'|'finnhub'|'alpha-vantage'|'fixture'|'unknown'; source_mode:'live'|'simulated'|'unknown';
  price:number|null; change_pct:number|null; currency:string|null; market_time:string|null; market_date:string|null;
  time_precision:'instant'|'date-only'|'unknown'; retrieved_at:string|null;
  adjusted_basis:'raw'|'split_adjusted'|'total_return'|'unknown'; is_market_session_open:boolean|null; stale:boolean;
};
export type SourceQualitySnapshot={id:string;capturedAt:string;entries:readonly {symbol:string;observations:readonly SourceObservation[];issue:string|null}[]};
export type SourceQualityRequest={run_id:string;assessed_at:string;symbols:string[];observations:SourceObservation[]};
export const sourceQualityFindingLabels={
  PRICE_UNAVAILABLE:'A positive current price is unavailable.',DAILY_MOVE_UNAVAILABLE:'The daily move is unavailable.',
  SIMULATED_OR_UNKNOWN_SOURCE_MODE:'The source is simulated or its mode is unknown.',PROVIDER_UNKNOWN:'The provider is unknown.',
  RETURNED_SYMBOL_UNKNOWN:'The provider-returned symbol is unavailable.',RETURNED_SYMBOL_MISMATCH:'The returned symbol does not match.',
  CURRENCY_UNKNOWN:'Quote currency is unknown.',UNSUPPORTED_CURRENCY:'The currency does not match the review policy.',
  ADJUSTMENT_BASIS_UNKNOWN:'The adjustment basis is unknown.',SESSION_UNKNOWN:'The source session flag is unavailable.',
  STALE_SOURCE_HINT:'The source marked this observation stale.',DATE_ONLY_TIME:'A trading date does not establish an observation instant.',
  OBSERVATION_TIME_UNKNOWN:'The observation time is unavailable.',FUTURE_OBSERVATION:'The observation is after the assessment time.',
  OBSERVATION_EXCEEDS_AGE_POLICY:'The observation exceeds this diagnostic age policy.',RETRIEVAL_TIME_UNKNOWN:'Retrieval time is unavailable.',
  FUTURE_RETRIEVAL:'Retrieval time is after the assessment time.',OBSERVATION_AFTER_RETRIEVAL:'Observation and retrieval times are inconsistent.',
  NO_OBSERVATION:'No quote observation was loaded.',NO_DISTINCT_PROVIDER_COMPARISON:'No distinct-provider comparison is available.',
  CURRENCY_MISMATCH:'The observations use different currencies.',BASIS_MISMATCH:'The observations use different adjustment bases.',
  SESSION_MISMATCH:'The observations have different session flags.',UNALIGNED_OBSERVATIONS:'Observation times are too far apart to compare.',
  NUMERIC_RANGE_UNSUPPORTED:'The numeric scale cannot be compared reliably.',PRICE_DISCREPANCY:'Comparable prices exceed the discrepancy threshold.',
} as const;
export type SourceFindingCode=keyof typeof sourceQualityFindingLabels;
type Finding={code:SourceFindingCode;severity:'blocker'|'attention';evidence_ids:string[]};
type Inspection={symbol:string;status:'metadata-covered'|'needs-data'|'review';observed_count:number;comparable_evidence_ids:string[];findings:Finding[];comparisons:{evidence_ids:[string,string];discrepancy_pct:number;exceeds_threshold:boolean}[];comparison_status:'not-assessed'|'no-comparable-pairs'|'compared'};
export type SourceQualityResult={
  contract_version:'source-quality-v1';run_id:string;assessed_at:string;policy:typeof sourceQualityPolicy;
  status:'complete'|'partial'|'needs-data';inspection_complete:boolean;termination_reason:'completed'|'call-budget'|'time-budget';
  expected_symbols:string[];inspected_symbols:string[];uninspected_symbols:string[];pending_comparison_symbols:string[];
  inspections:Inspection[];trace:{tool:string;symbol:string;status:string}[];tool_attempts:number;tool_calls:number;
  provided_observation_count:number;inspected_observation_count:number;metadata_covered_observation_count:number;
  provider_requests:0;model_calls:0;jev_calls:0;grants_decision_eligibility:false;verifies_provider_identity:false;
};
export const sourceQualityPolicy={max_quote_age_seconds:900,max_time_difference_seconds:60,discrepancy_pct:2,expected_currency:null,max_tool_calls:20,time_budget_ms:1000} as const;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const symbol=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z0-9.^=-]{1,20}$/.test(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const integer=(v:unknown,max=100)=>finite(v)&&Number.isInteger(v)&&v>=0&&v<=max;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>same(Object.keys(v).sort(),[...keys].sort());
function day(v:unknown):v is string{return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
function instant(v:unknown):v is string {
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!day(v.slice(0,10)))return false;
  return Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60&&Number.isFinite(Date.parse(v));
}
function nullableNumber(v:unknown):number|null {if(v==null)return null;if(!finite(v))throw new Error();return v;}
function nullableInstant(v:unknown):string|null {if(v==null)return null;if(!instant(v))throw new Error();return v;}
function provider(v:unknown):SourceObservation['provider'] {
  if(typeof v!=='string')return 'unknown';
  const name=v.trim().toLowerCase();
  if(name==='yahoo'||name==='yahoo finance')return 'yahoo';if(name==='finnhub')return 'finnhub';
  if(name==='alpha-vantage'||name==='alpha vantage')return 'alpha-vantage';
  if(/mock|simulat|fixture|^qa$/.test(name))return 'fixture';return 'unknown';
}
function mapObservation(selected:string,raw:unknown,index:number):SourceObservation {
  if(!object(raw))throw new Error();
  if(raw.status==='invalid'||raw.status==='conflicting'||(raw.status!=null&&!['valid','delayed','last_close','stale','missing','simulated'].includes(String(raw.status))))throw new Error('source-status');
  if(raw.symbol!=null&&(typeof raw.symbol!=='string'||raw.symbol.trim().toUpperCase()!==selected))throw new Error();
  const returned=raw.returnedSymbol==null?null:typeof raw.returnedSymbol==='string'?raw.returnedSymbol.trim().toUpperCase():'';
  if(returned!==null&&!symbol(returned))throw new Error();
  const vendor=provider(raw.provider);
  if(raw.simulated!=null&&typeof raw.simulated!=='boolean')throw new Error();
  const simulated=raw.simulated===true||raw.sourceMode==='simulated'||raw.status==='simulated'||vendor==='fixture';
  const mode=simulated?'simulated':raw.sourceMode==='live'?'live':'unknown';
  const marketTime=nullableInstant(raw.marketTime); // Never substitute asOf/retrievedAt or the capture clock.
  const precision=raw.marketTimePrecision;
  if(precision!=null&&!['instant','date-only','unknown'].includes(String(precision)))throw new Error();
  if(marketTime&&(precision==='date-only'||precision==='unknown'))throw new Error();
  if(!marketTime&&precision==='instant')throw new Error();
  const marketDate=raw.marketDate==null?null:raw.marketDate;
  if(marketDate!==null&&!day(marketDate))throw new Error();
  if(marketTime&&marketDate!==null)throw new Error();
  if(precision==='date-only'&&marketDate===null)throw new Error();
  const currency=raw.currency==null?null:raw.currency;
  if(currency!==null&&(typeof currency!=='string'||!/^[A-Za-z]{3}$/.test(currency)))throw new Error();
  if(raw.isMarketSessionOpen!=null&&typeof raw.isMarketSessionOpen!=='boolean')throw new Error();
  if(raw.stale!=null&&typeof raw.stale!=='boolean')throw new Error();
  const basis=raw.adjustedBasis==null?'unknown':raw.adjustedBasis;
  if(!['raw','split_adjusted','total_return','unknown'].includes(String(basis)))throw new Error();
  return {evidence_id:`loaded:${selected}:${index}`,symbol:selected,returned_symbol:returned,provider:vendor,source_mode:mode,
    price:nullableNumber(raw.price),change_pct:nullableNumber(raw.changePct),currency:currency as string|null,
    market_time:marketTime,market_date:marketDate as string|null,time_precision:marketTime?'instant':marketDate?'date-only':'unknown',
    retrieved_at:nullableInstant(raw.retrievedAt),adjusted_basis:basis as SourceObservation['adjusted_basis'],
    is_market_session_open:typeof raw.isMarketSessionOpen==='boolean'?raw.isMarketSessionOpen:null,stale:raw.stale===true||raw.status==='stale'};
}
export function captureSourceQualitySnapshot(symbols:readonly string[],quotes:Record<string,unknown>,id:string,nowMs:number):SourceQualitySnapshot {
  if(symbols.length>150||new Set(symbols).size!==symbols.length||symbols.some(s=>!symbol(s))||!Number.isFinite(nowMs))throw new Error();
  const entries=symbols.map(selected=>{
    try{
      const raw=quotes[selected];if(raw==null)return {symbol:selected,observations:Object.freeze([]),issue:null};
      if(!object(raw))throw new Error();
      const other=raw.independentObservations;
      if(other!=null&&(!Array.isArray(other)||other.length>2))throw new Error();
      const observations=[raw,...(Array.isArray(other)?other:[])].map((q,i)=>Object.freeze(mapObservation(selected,q,i)));
      return {symbol:selected,observations:Object.freeze(observations),issue:null};
    }catch(error){return {symbol:selected,observations:Object.freeze([]),issue:error instanceof Error&&error.message==='source-status'?'The loaded quote has an invalid, conflicting or unrecognized quality status. Resolve that source issue before requesting this metadata review.':'Loaded metadata could not be mapped safely. Capture a new snapshot after correcting malformed or oversized quote inputs.'};}
  });
  return Object.freeze({id,capturedAt:new Date(nowMs).toISOString(),entries:Object.freeze(entries.map(row=>Object.freeze(row)))});
}
export function sourceQualityRequest(snapshot:SourceQualitySnapshot,selected:string,nowMs:number,attempt:number):SourceQualityRequest {
  const entry=snapshot.entries.find(e=>e.symbol===selected);
  if(!entry||entry.issue||!Number.isFinite(nowMs)||!Number.isInteger(attempt)||attempt<1||attempt>5)throw new Error();
  return {run_id:`source-review:${nowMs}:${attempt}`,assessed_at:new Date(nowMs).toISOString(),symbols:[selected],observations:entry.observations.map(row=>({...row}))};
}

/** Refuse wrong-run, widened, malformed or authority-changing responses before rendering. */
export function normalizeSourceQualityResult(value:unknown,request:SourceQualityRequest):SourceQualityResult {
  const fail=()=>{throw new Error('Invalid source-quality result');};
  if(!object(value))return fail();
  const root=['contract_version','run_id','assessed_at','policy','status','inspection_complete','termination_reason','expected_symbols','inspected_symbols','uninspected_symbols','pending_comparison_symbols','inspections','trace','tool_attempts','tool_calls','provided_observation_count','inspected_observation_count','metadata_covered_observation_count','provider_requests','model_calls','jev_calls','grants_decision_eligibility','verifies_provider_identity'];
  if(!exact(value,root)||value.contract_version!=='source-quality-v1'||value.run_id!==request.run_id||!instant(value.assessed_at)||Date.parse(value.assessed_at)!==Date.parse(request.assessed_at)||!same(value.expected_symbols,request.symbols))return fail();
  const policy=value.policy;
  if(!object(policy)||!exact(policy,Object.keys(sourceQualityPolicy))||Object.entries(sourceQualityPolicy).some(([key,v])=>policy[key]!==v))return fail();
  if(value.provider_requests!==0||value.model_calls!==0||value.jev_calls!==0||value.grants_decision_eligibility!==false||value.verifies_provider_identity!==false)return fail();
  if(!['complete','partial','needs-data'].includes(String(value.status))||!['completed','call-budget','time-budget'].includes(String(value.termination_reason))||typeof value.inspection_complete!=='boolean')return fail();
  const arrays=['inspected_symbols','uninspected_symbols','pending_comparison_symbols'] as const;
  for(const key of arrays){const a=value[key];if(!Array.isArray(a)||a.length>request.symbols.length||new Set(a).size!==a.length||a.some(s=>!request.symbols.includes(s)))return fail();}
  const inspected=value.inspected_symbols as string[],uninspected=value.uninspected_symbols as string[],pending=value.pending_comparison_symbols as string[];
  if(!same(uninspected,request.symbols.filter(s=>!inspected.includes(s)))||pending.some(s=>!inspected.includes(s)))return fail();
  if(value.inspection_complete!==(value.termination_reason==='completed')||(value.inspection_complete&&(uninspected.length>0||pending.length>0)))return fail();
  if(!Array.isArray(value.inspections)||value.inspections.length!==inspected.length)return fail();
  let observed=0,covered=0,coveredSymbols=0;
  for(let index=0;index<value.inspections.length;index++){
    const item=value.inspections[index];
    if(!object(item)||!exact(item,['symbol','status','observed_count','comparable_evidence_ids','findings','comparisons','comparison_status'])||item.symbol!==inspected[index]||!['metadata-covered','needs-data','review'].includes(String(item.status)))return fail();
    const rows=request.observations.filter(row=>row.symbol===item.symbol),ids=rows.map(row=>row.evidence_id);
    if(item.observed_count!==rows.length||!Array.isArray(item.comparable_evidence_ids)||new Set(item.comparable_evidence_ids).size!==item.comparable_evidence_ids.length||item.comparable_evidence_ids.some(id=>!ids.includes(id)))return fail();
    observed+=rows.length;covered+=item.comparable_evidence_ids.length;coveredSymbols+=Number(item.status==='metadata-covered');
    if(!Array.isArray(item.findings)||item.findings.length>100||!Array.isArray(item.comparisons)||item.comparisons.length>3)return fail();
    for(const f of item.findings){if(!object(f)||!exact(f,['code','severity','evidence_ids'])||!Object.hasOwn(sourceQualityFindingLabels,String(f.code))||!['blocker','attention'].includes(String(f.severity))||!Array.isArray(f.evidence_ids)||f.evidence_ids.length>3||f.evidence_ids.some(id=>!ids.includes(id)))return fail();}
    const pairs=new Set<string>();
    for(const pair of item.comparisons){
      if(!object(pair)||!exact(pair,['evidence_ids','discrepancy_pct','exceeds_threshold'])||!Array.isArray(pair.evidence_ids)||pair.evidence_ids.length!==2||pair.evidence_ids[0]===pair.evidence_ids[1]||pair.evidence_ids.some(id=>!(item.comparable_evidence_ids as unknown[]).includes(id))||!finite(pair.discrepancy_pct)||pair.discrepancy_pct<0||typeof pair.exceeds_threshold!=='boolean')return fail();
      const key=[...pair.evidence_ids].sort().join('|');if(pairs.has(key))return fail();pairs.add(key);
    }
    if(!['not-assessed','no-comparable-pairs','compared'].includes(String(item.comparison_status))||((item.comparisons.length>0)!==(item.comparison_status==='compared'))||((item.status==='review')!==item.comparisons.some(pair=>object(pair)&&pair.exceeds_threshold===true)))return fail();
  }
  const status=value.inspection_complete&&coveredSymbols===request.symbols.length?'complete':inspected.length&&(!value.inspection_complete||coveredSymbols>0)?'partial':'needs-data';
  if(value.status!==status||value.provided_observation_count!==request.observations.length||value.inspected_observation_count!==observed||value.metadata_covered_observation_count!==covered)return fail();
  if(!integer(value.tool_calls,20)||!integer(value.tool_attempts,11)||value.tool_calls>value.tool_attempts||!Array.isArray(value.trace)||value.trace.length!==value.tool_attempts)return fail();
  for(const trace of value.trace){if(!object(trace)||!exact(trace,['tool','symbol','status'])||!['source_quality.inspect_quote','source_quality.compare_quotes'].includes(String(trace.tool))||!request.symbols.includes(String(trace.symbol))||!['ok','budget'].includes(String(trace.status)))return fail();}
  return value as unknown as SourceQualityResult;
}
