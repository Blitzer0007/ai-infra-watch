/** Strict development wire contract: no raw prose, invented facts or action authority. */
import {councilAdmissionPayload,councilAdmissionEnvelope} from './councilAdmission.js';
import {researchRoleReview} from './researchRoleReview.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const equal=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>equal(v,b[i])):object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k])));
const list=(v,max,allowed,min=0)=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(x=>typeof x==='string'&&allowed.includes(x))&&new Set(v).size===v.length;
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const ROLES=['company','catalyst','daily'];
const FAMILIES={company:['financial','risk'],catalyst:['catalyst'],daily:['market','financial','catalyst','risk']};
const AUTHORITY=['source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages'];
const REQUIRES={REVIEW_NEGATIVE_CASH_FLOW:'free_cash_flow_usd',REVIEW_ZERO_CASH_FLOW:'free_cash_flow_usd',REVIEW_CASH_FLOW_CONTEXT:'free_cash_flow_usd',REVIEW_GROWTH_CONTEXT:'revenue_growth_pct',REVIEW_LEVERAGE_CONTEXT:'risk',REVIEW_EVENT_TIMING:'catalyst'};
const POLICY={max_model_calls:6,max_tool_calls:3,max_seconds:40,max_prompt_chars:60000,output_token_limit_per_call:600,max_review_codes_per_role:3,max_citations_per_role:4};

export function researchRoleResponseEnvelope(value,payload,digest) {
  if(!councilAdmissionPayload(payload)||payload.mode!=='research-v2'||typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest)||
    !exact(value,['contract_version','admission','result'])||value.contract_version!=='research-role-response-v1'||!councilAdmissionEnvelope(value.admission,payload,digest))return false;
  const baseline=researchRoleReview(payload,value.admission,digest),r=value.result;
  if(!baseline||!exact(r,['contract_version','run_id','request_sha256','symbol','assessed_at','horizon_months','scope','mode','status','termination_reason','input_status','selection_is_exhaustive','roles','trace','usage','policy',...AUTHORITY])||
    r.contract_version!=='research-role-agent-v1'||r.run_id!==payload.packet.run_id||r.request_sha256!==digest||r.symbol!==payload.packet.symbol||r.assessed_at!==payload.packet.assessed_at||r.horizon_months!==payload.packet.horizon_months||
    r.scope!=='single-symbol-frozen-snapshot'||!['fixture','multi-model','unconfigured'].includes(r.mode)||!['complete','partial','failed','unavailable'].includes(r.status)||r.input_status!==value.admission.status||
    r.selection_is_exhaustive!==false||AUTHORITY.some(k=>r[k]!==false)||!equal(r.policy,POLICY)||!object(r.roles)||!Array.isArray(r.trace)||r.trace.length>6)return false;
  const inspected={company:[],catalyst:[],daily:[]},completed=[];
  let tools=0;
  for(const [index,t] of r.trace.entries()){
    const role=ROLES[Math.floor(index/2)],isTool=index%2===0;
    if(!exact(t,['role','action','status','evidence_ids','families'])||t.role!==role||t.status!=='ok')return false;
    const scoped=payload.packet.evidence.filter(row=>FAMILIES[role].includes(row.family)).map(row=>row.evidence_id);
    if(isTool){
      tools++;
      if(t.action==='inspect'){
        if(!list(t.evidence_ids,8,scoped,1)||!equal(t.families,[]))return false;
        inspected[role]=t.evidence_ids;
      }else if(t.action==='coverage'){
        if(!list(t.families,4,FAMILIES[role],1)||!equal(t.evidence_ids,[]))return false;
      }else return false;
    }else{
      if(t.action!=='review'||!equal(t.evidence_ids,[])||!equal(t.families,[]))return false;
      completed.push(role);
    }
  }
  if(Object.keys(r.roles).length!==completed.length||Object.keys(r.roles).some(role=>!completed.includes(role)))return false;
  for(const role of completed){
    const row=r.roles[role],allowed=baseline.roles[role];
    if(!exact(row,['input_status','review_codes','evidence_ids'])||row.input_status!==allowed.status||!list(row.review_codes,3,allowed.review_codes,1)||
      !list(row.evidence_ids,4,allowed.evidence_ids)||row.evidence_ids.some(id=>!inspected[role].includes(id)))return false;
    for(const code of row.review_codes){
      const required=REQUIRES[code];
      if(required&&!row.evidence_ids.some(id=>{const e=payload.packet.evidence.find(row=>row.evidence_id===id);return e.metric===required||e.family===required;}))return false;
    }
  }
  const u=r.usage;
  if(!exact(u,['model_calls','tool_calls','prompt_chars','provider_requests'])||!integer(u.model_calls,6)||!integer(u.tool_calls,3)||u.tool_calls!==tools||!integer(u.prompt_chars,60000)||
    ![r.trace.length,r.trace.length+1].includes(u.model_calls)||(u.provider_requests!==null&&(!integer(u.provider_requests,6)||u.provider_requests>u.model_calls))||
    (u.model_calls===0?u.prompt_chars!==0:u.prompt_chars===0)||(r.mode==='fixture'&&u.provider_requests!==0))return false;
  if(r.status==='complete')return r.mode!=='unconfigured'&&r.termination_reason==='completed'&&completed.length===3&&r.trace.length===6&&u.model_calls===6&&u.tool_calls===3&&(r.mode!=='multi-model'||u.provider_requests===6);
  if(r.status==='unavailable')return r.mode==='unconfigured'&&r.termination_reason==='model-not-configured'&&r.trace.length===0&&equal(u,{model_calls:0,tool_calls:0,prompt_chars:0,provider_requests:0});
  return r.mode!=='unconfigured'&&r.trace.length<6&&(r.status==='partial'?['budget','tool-budget'].includes(r.termination_reason):r.termination_reason==='model-or-contract-error');
}
