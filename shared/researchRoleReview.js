/** Controlled deterministic role views. No source, model, storage or delivery tools. */
import {councilAdmissionPayload,councilAdmissionEnvelope} from './councilAdmission.js';

export const RESEARCH_REVIEW_CODES = Object.freeze({
  VERIFY_ORIGINAL_FILINGS:'Verify the original filings and issuer identity.',
  FINANCIAL_INPUTS_MISSING:'Financial inputs need declared lineage and publication checks.',
  RISK_INPUTS_MISSING:'Risk inputs need declared lineage and publication checks.',
  REVIEW_NEGATIVE_CASH_FLOW:'Review the negative cash-flow observation and its original inputs.',
  REVIEW_ZERO_CASH_FLOW:'Review the zero cash-flow observation; zero is a value, not missing data.',
  REVIEW_CASH_FLOW_CONTEXT:'Review cash flow in its reported period and calculation context.',
  REVIEW_GROWTH_CONTEXT:'Review growth alongside its comparison period and cash-flow context.',
  REVIEW_LEVERAGE_CONTEXT:'Review the liability or debt ratio and its original denominator.',
  VERIFY_EVENT_SOURCE:'Verify the event source and confirmation independently.',
  REVIEW_EVENT_TIMING:'Review the declared event time; elapsed calendar days are not trading sessions.',
  EVENT_CONFIRMATION_REQUIRED:'Confirm event timing before treating the catalyst as usable.',
  CHECK_SOURCE_AUTHENTICITY:'Verify source authenticity; conditional metadata checks do not establish it.',
  RECORD_REVIEW_QUESTIONS:'Record unresolved questions for this company; this view does not save them.',
  REFRESH_MARKET_EVIDENCE:'Obtain a timestamped market observation for review.',
  FILL_FINANCIAL_COVERAGE:'Review the missing financial-source coverage.',
  FILL_CATALYST_COVERAGE:'Review the missing catalyst-source coverage.',
  FILL_RISK_COVERAGE:'Review the missing risk-source coverage.',
  RECONCILE_CONFLICTING_INPUTS:'Reconcile conflicting observations before drawing conclusions.',
});

export function researchRoleReview(payload,admission,digest) {
  if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest)||!councilAdmissionPayload(payload)||!councilAdmissionEnvelope(admission,payload,digest))return null;
  const p=payload.packet, q=admission.quality;
  const rows=p.evidence.filter(row=>q.usable_ids.includes(row.evidence_id));
  const company=rows.filter(row=>['financial','risk'].includes(row.family)).map(row=>row.evidence_id);
  const catalyst=rows.filter(row=>row.family==='catalyst').map(row=>row.evidence_id);
  const codes=['VERIFY_ORIGINAL_FILINGS'];
  if(q.missing_families.includes('financial'))codes.push('FINANCIAL_INPUTS_MISSING');
  if(q.missing_families.includes('risk'))codes.push('RISK_INPUTS_MISSING');
  for(const row of rows)if(row.metric==='free_cash_flow_usd'){
    const code=row.value<0?'REVIEW_NEGATIVE_CASH_FLOW':row.value===0?'REVIEW_ZERO_CASH_FLOW':'REVIEW_CASH_FLOW_CONTEXT';
    if(!codes.includes(code))codes.push(code);
  }
  if(rows.some(row=>row.metric==='revenue_growth_pct'))codes.push('REVIEW_GROWTH_CONTEXT');
  if(rows.some(row=>row.family==='risk'))codes.push('REVIEW_LEVERAGE_CONTEXT');
  const daily=['CHECK_SOURCE_AUTHENTICITY','RECORD_REVIEW_QUESTIONS'];
  const gaps={market:'REFRESH_MARKET_EVIDENCE',financial:'FILL_FINANCIAL_COVERAGE',catalyst:'FILL_CATALYST_COVERAGE',risk:'FILL_RISK_COVERAGE'};
  daily.push(...q.missing_families.map(f=>gaps[f]));
  if(q.conflicting_ids.length)daily.push('RECONCILE_CONFLICTING_INPUTS');
  return {contract_version:'research-role-review-v1',rules_version:'loaded-review-roles-v1',mode:'deterministic',
    run_id:p.run_id,request_sha256:digest,symbol:p.symbol,assessed_at:p.assessed_at,horizon_months:p.horizon_months,status:admission.status,
    roles:{company:{status:q.missing_families.some(f=>['financial','risk'].includes(f))?'needs-data':'conditional',evidence_ids:company,review_codes:codes},
      catalyst:{status:catalyst.length?'conditional':'needs-data',evidence_ids:catalyst,review_codes:['VERIFY_EVENT_SOURCE',catalyst.length?'REVIEW_EVENT_TIMING':'EVENT_CONFIRMATION_REQUIRED']},
      daily:{status:admission.status,evidence_ids:rows.map(row=>row.evidence_id),review_codes:daily}},
    policy:{read_only:true,max_evidence:8,max_review_codes:7,model_calls:0,provider_requests:0,tool_calls:0},
    source_authenticity_verified:false,forecast_validity_established:false,grants_decision_eligibility:false,changes_allocation:false,sends_messages:false};
}

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const equal=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>equal(v,b[i])):
  object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k])));
export function researchRoleReviewEnvelope(value,payload,admission,digest) {
  const expected=researchRoleReview(payload,admission,digest);
  return expected!==null&&equal(value,expected);
}
