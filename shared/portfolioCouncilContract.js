// Wire minimization/validation only. Python owns orchestration and quality checks.
import { forecastInstant, forecastDay } from '../src/utils/forecastInputs.js';
import {COUNCIL_PRESENTATION_VERSION,COUNCIL_LIMITATIONS,councilSummary} from './councilPresentation.js';
export const COUNCIL_MAX_BYTES = 32768;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const token = v => typeof v === 'string' && /^[A-Za-z0-9_.:-]{1,64}$/.test(v);
const symbol = v => typeof v === 'string' && /^[A-Z0-9.^=-]{1,20}$/.test(v);
const integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const array = (v, max, check) => Array.isArray(v) && v.length <= max && v.every(check);
const families = ['market', 'financial', 'catalyst', 'risk'];
const roles = ['bull', 'bear', 'judge'];
const implications = ['market-move', 'growth', 'cash-flow', 'margin', 'event-timing', 'leverage-risk'];
const metricImplication={price:'market-move',daily_change_pct:'market-move',revenue_growth_pct:'growth',free_cash_flow_usd:'cash-flow',operating_margin_pct:'margin',event_days_until:'event-timing',debt_equity:'leverage-risk',liabilities_equity:'leverage-risk'};
const rowKeys = ['evidence_id','symbol','family','metric','value','unit','source_id','observed_at','published_at','retrieved_at','basis','period_start','period_end','simulated'];
const metric = {price:['market','USD'],daily_change_pct:['market','percent'],revenue_growth_pct:['financial','percent'],free_cash_flow_usd:['financial','USD'],operating_margin_pct:['financial','percent'],event_days_until:['catalyst','days'],debt_equity:['risk','ratio'],liabilities_equity:['risk','ratio']};
const instant = v => forecastInstant(v) !== null;
const interpretation = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 400 && !/\d|[$%<>]|https?:\/\/|bearer|api.?key|password/i.test(v);
const equal = (a,b) => {
  if(a===b)return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  return object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
};
export function councilDevelopmentEnabled(env=process.env) {
  return env.COUNCIL_DEV_ENABLED==='true'&&!env.VERCEL&&env.NODE_ENV!=='production'&&env.VERCEL_ENV!=='production';
}
export function councilEvidence(v) {
  return exact(v,rowKeys)&&token(v.evidence_id)&&symbol(v.symbol)&&Object.hasOwn(metric,v.metric)&&metric[v.metric][0]===v.family&&metric[v.metric][1]===v.unit&&
    typeof v.value==='number'&&Number.isFinite(v.value)&&(v.metric!=='price'||v.value>0)&&token(v.source_id)&&
    ['observed_at','published_at','retrieved_at'].every(k=>v[k]===null||instant(v[k]))&&
    ['period_start','period_end'].every(k=>v[k]===null||forecastDay(v[k]))&&['reported','estimate','unknown'].includes(v.basis)&&typeof v.simulated==='boolean';
}
export function councilPayload(v) {
  if(exact(v,['mode','run_id','state'])&&v.mode==='jev'&&token(v.run_id)&&councilCoverageSummary(v.state))return v;
  if(exact(v,['mode','run_id','assessed_at'])&&v.mode==='demo'&&token(v.run_id)&&instant(v.assessed_at))return v;
  if(!exact(v,['mode','packet'])||v.mode!=='loaded')return null;
  const p=v.packet;
  if(!exact(p,['run_id','symbol','horizon_months','assessed_at','evidence'])||!token(p.run_id)||!symbol(p.symbol)||![3,6,12].includes(p.horizon_months)||!instant(p.assessed_at)||
    !array(p.evidence,8,e=>councilEvidence(e)&&e.symbol===p.symbol)||new Set(p.evidence.map(e=>e.evidence_id)).size!==p.evidence.length)return null;
  return v;
}
export function councilCoverageSummary(s) {
  return exact(s,['contract_version','mode','observed_count','usable_count','missing_families','conflict_count','bull_claim_count','bear_claim_count','role_count','judge_abstained'])&&
    s.contract_version==='council-coverage-v1'&&s.mode==='nvidia'&&integer(s.observed_count,8)&&integer(s.usable_count,s.observed_count)&&integer(s.conflict_count,8)&&integer(s.bull_claim_count,4)&&integer(s.bear_claim_count,4)&&s.role_count===3&&typeof s.judge_abstained==='boolean'&&array(s.missing_families,4,f=>families.includes(f))&&new Set(s.missing_families).size===s.missing_families.length;
}
export function councilJevEnvelope(v,payload) {
  return exact(v,['contract_version','run_id','available','coverage','next_check','input_tokens','error_code','grants_decision_eligibility'])&&
    v.contract_version==='council-jev-v1'&&v.run_id===payload.run_id&&typeof v.available==='boolean'&&v.grants_decision_eligibility===false&&
    (v.input_tokens===null||integer(v.input_tokens,1000000))&&
    (v.available?(['needs_data','reviewable'].includes(v.coverage)&&['verify_sources','inspect_disagreement','wait_for_outcome'].includes(v.next_check)&&v.error_code===null):(v.coverage===null&&v.next_check===null&&['not-enabled','invalid-summary','assessment-unavailable'].includes(v.error_code)));
}
const resultKeys=['contract_version','presentation_version','run_id','snapshot_id','symbol','horizon_months','assessed_at','mode','status','termination_reason','disposition','quality','roles','trace','evidence','usage','policy','source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages'];
export function councilEnvelope(v, payload) {
  if(!exact(v,resultKeys)||v.contract_version!=='portfolio-council-v1'||v.presentation_version!==COUNCIL_PRESENTATION_VERSION||v.run_id!==(payload.mode==='demo'?payload.run_id:payload.packet.run_id)||
    !/^[a-f0-9]{64}$/.test(v.snapshot_id)||!['fixture','nvidia','unconfigured'].includes(v.mode)||
    !['complete','partial','failed','unavailable'].includes(v.status)||!['completed','budget','tool-budget','step-budget','model-or-contract-error','model-not-configured'].includes(v.termination_reason)||
    !['insufficient-evidence','provisional-bull','provisional-bear','balanced'].includes(v.disposition)||
    ['source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages'].some(k=>v[k]!==false))return false;
  if(payload.mode==='demo') {if(v.symbol!=='FICT'||v.mode!=='fixture'||v.horizon_months!==3||v.assessed_at!==payload.assessed_at)return false;}
  else if(v.symbol!==payload.packet.symbol||v.horizon_months!==payload.packet.horizon_months||v.assessed_at!==payload.packet.assessed_at||!equal(v.evidence,payload.packet.evidence))return false;
  if(!array(v.evidence,8,e=>councilEvidence(e)&&e.symbol===v.symbol)||!exact(v.quality,['usable_ids','issues','missing_families','conflicting_ids']))return false;
  const ids=v.evidence.map(e=>e.evidence_id),known=id=>ids.includes(id);
  if(!array(v.quality.usable_ids,8,known)||!array(v.quality.conflicting_ids,8,known)||!array(v.quality.missing_families,4,f=>families.includes(f))||
    !array(v.quality.issues,8,i=>exact(i,['evidence_id','codes'])&&known(i.evidence_id)&&array(i.codes,6,c=>['SIMULATED_OR_UNKNOWN_SOURCE','REPORTED_BASIS_MISSING','TIME_PROVENANCE_MISSING','TIME_ORDER_INVALID','SOURCE_STALE_OR_FUTURE','PERIOD_PROVENANCE_MISSING'].includes(c))))return false;
  if(!object(v.roles)||Object.keys(v.roles).some(r=>!roles.includes(r)))return false;
  for(const [role,r] of Object.entries(v.roles)) {
    if(role==='judge') {if(!exact(r,['summary','preference','winning_claim_ids'])||!interpretation(r.summary)||!['bull','bear','balanced','insufficient'].includes(r.preference)||!array(r.winning_claim_ids,4,id=>/^(bull|bear):[0-3]$/.test(id)))return false;}
    else if(!exact(r,['summary','claims','limitations'])||!interpretation(r.summary)||!array(r.limitations,4,interpretation)||!array(r.claims,4,c=>exact(c,['claim_id','evidence_id','stance','implication'])&&new RegExp('^'+role+':[0-3]$').test(c.claim_id)&&known(c.evidence_id)&&['support','challenge'].includes(c.stance)&&implications.includes(c.implication)))return false;
    if(r.summary!==councilSummary(role,r)||(role!=='judge'&&!equal(r.limitations,COUNCIL_LIMITATIONS)))return false;
    if(role!=='judge'&&(new Set(r.claims.map(c=>c.evidence_id)).size!==r.claims.length||r.claims.some((c,i)=>c.claim_id!==role+':'+i||c.implication!==metricImplication[v.evidence.find(e=>e.evidence_id===c.evidence_id).metric])))return false;
  }
  const claims=['bull','bear'].flatMap(role=>v.roles[role]?.claims||[]);
  if(v.roles.judge?.winning_claim_ids.some(id=>!claims.some(c=>c.claim_id===id)))return false;
  if(v.roles.judge){const j=v.roles.judge;if(new Set(j.winning_claim_ids).size!==j.winning_claim_ids.length||(['bull','bear'].includes(j.preference)&&!j.winning_claim_ids.some(id=>id.startsWith(j.preference+':'))))return false;}
  if((v.mode==='fixture'||v.status!=='complete'||v.quality.missing_families.length||v.quality.conflicting_ids.length||!v.roles.bull?.claims.length||!v.roles.bear?.claims.length||claims.some(c=>!v.quality.usable_ids.includes(c.evidence_id)))&&v.disposition!=='insufficient-evidence')return false;
  if(!array(v.trace,6,t=>exact(t,['role','action','status'])&&roles.includes(t.role)&&['inspect','coverage','conclude','judge'].includes(t.action)&&t.status==='ok')||
    !exact(v.usage,['model_calls','tool_calls','prompt_chars','output_token_limit_per_call','provider_requests','jev_calls'])||!integer(v.usage.model_calls,6)||!integer(v.usage.tool_calls,3)||!integer(v.usage.prompt_chars,60000)||v.usage.output_token_limit_per_call!==600||v.usage.jev_calls!==0||(v.usage.provider_requests!==null&&!integer(v.usage.provider_requests,6))||
    !equal(v.policy,{max_model_calls:6,max_tool_calls:3,max_seconds:40,max_prompt_chars:60000}))return false;
  return v.status!=='complete'||roles.every(role=>Object.hasOwn(v.roles,role));
}
