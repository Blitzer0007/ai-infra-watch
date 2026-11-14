/** Transport minimization only. Python remains the authoritative quality evaluator. */
export const SOURCE_QUALITY_MAX_BYTES = 65536;
const rootKeys = new Set(['run_id', 'assessed_at', 'symbols', 'observations']);
const stringLimits = {evidence_id:80,symbol:20,returned_symbol:20,provider:25,source_mode:10,currency:3,market_time:40,market_date:10,time_precision:10,retrieved_at:40,adjusted_basis:15};
const nullable = new Set(['returned_symbol','currency','market_time','market_date','retrieved_at']);
const numeric = new Set(['price','change_pct']);
const boolean = new Set(['is_market_session_open','stale']);
const object = value => value!=null&&typeof value==='object'&&!Array.isArray(value);
export function sourceQualityDevelopmentEnabled(env=process.env) {
  return env.SOURCE_QUALITY_DEV_ENABLED==='true'&&!env.VERCEL&&env.NODE_ENV!=='production'&&env.VERCEL_ENV!=='production';
}
export function sourceQualityPayload(value) {
  if(!object(value)||Object.keys(value).some(key=>!rootKeys.has(key)))return null;
  if(typeof value.run_id!=='string'||!/^[A-Za-z0-9_.:-]{1,80}$/.test(value.run_id)||typeof value.assessed_at!=='string'||value.assessed_at.length>40)return null;
  if(!Array.isArray(value.symbols)||value.symbols.length<1||value.symbols.length>5||new Set(value.symbols).size!==value.symbols.length||value.symbols.some(s=>typeof s!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(s)))return null;
  if(!Array.isArray(value.observations)||value.observations.length>15)return null;
  for(const row of value.observations){
    if(!object(row))return null;
    for(const [key,field] of Object.entries(row)){
      if(Object.hasOwn(stringLimits,key)){if(field===null&&nullable.has(key))continue;if(typeof field!=='string'||field.length>stringLimits[key])return null;}
      else if(numeric.has(key)){if(field!==null&&(typeof field!=='number'||!Number.isFinite(field)))return null;}
      else if(boolean.has(key)){if(field!==null&&typeof field!=='boolean')return null;if(key==='stale'&&field===null)return null;}
      else return null;
    }
  }
  try {return Buffer.byteLength(JSON.stringify(value),'utf8')<=SOURCE_QUALITY_MAX_BYTES?value:null;}catch{return null;}
}
const resultKeys=['contract_version','run_id','assessed_at','policy','status','inspection_complete','termination_reason','expected_symbols','inspected_symbols','uninspected_symbols','pending_comparison_symbols','inspections','trace','tool_attempts','tool_calls','provided_observation_count','inspected_observation_count','metadata_covered_observation_count','provider_requests','model_calls','jev_calls','grants_decision_eligibility','verifies_provider_identity'];
export function sourceQualityEnvelope(value,runId) {
  return object(value)&&Object.keys(value).length===resultKeys.length&&Object.keys(value).every(key=>resultKeys.includes(key))&&value.contract_version==='source-quality-v1'&&value.run_id===runId&&value.provider_requests===0&&value.model_calls===0&&value.jev_calls===0&&value.grants_decision_eligibility===false&&value.verifies_provider_identity===false;
}
export async function sourceQualityResponseText(response) {
  const reader=response.body?.getReader();if(!reader)throw new Error();
  const decoder=new TextDecoder('utf-8',{fatal:true});let size=0,text='';
  try{
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>262144){await reader.cancel();throw new Error();}text+=decoder.decode(chunk.value,{stream:true});}
    return text+decoder.decode();
  }finally{reader.releaseLock();}
}
