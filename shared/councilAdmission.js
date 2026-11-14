/** V2 transport contracts. Python independently owns conditional source admission. */
import {councilPayload,councilEnvelope} from './portfolioCouncilContract.js';
import {secCouncilReceipt} from './councilSources.js';
import {forecastDay,forecastInstant,forecastInstantMicros} from '../src/utils/forecastInputs.js';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const equal=(a,b)=>a===b||(Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>equal(v,b[i])):object(a)&&object(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k])));
const REASONS=['SIMULATED','SOURCE_UNKNOWN','BASIS_NOT_REPORTED','PERIOD_MISMATCH','TIME_MISSING','TIME_ORDER_INVALID','SOURCE_STALE_OR_FUTURE','LINEAGE_MISSING','PUBLICATION_PRECISION_UNSUPPORTED','PUBLICATION_WINDOW_UNCLOSED','PERIOD_STALE_OR_FUTURE','EVENT_UNCONFIRMED','EVENT_OUTSIDE_WINDOW','CONFLICTING_EVIDENCE'];
const QUALITY=['SIMULATED_OR_UNKNOWN_SOURCE','REPORTED_BASIS_MISSING','TIME_PROVENANCE_MISSING','TIME_ORDER_INVALID','SOURCE_STALE_OR_FUTURE','PERIOD_PROVENANCE_MISSING'];
const FAMILIES=['market','financial','catalyst','risk'];
const AUTHORITY=['source_authenticity_verified','forecast_validity_established','grants_decision_eligibility','changes_allocation','sends_messages'];
export function councilAdmissionPayload(v) {
  if(!exact(v,['mode','packet','sources'])||!['admission-v2','loaded-v2'].includes(v.mode)||!councilPayload({mode:'loaded',packet:v.packet})||!exact(v.sources,['sec','catalyst']))return null;
  const sec=v.sources.sec;
  if(sec!==null&&(!secCouncilReceipt(sec)||sec.symbol!==v.packet.symbol||sec.observations.some(o=>!v.packet.evidence.some(e=>equal(e,o.evidence)))||(sec.issues.some(c=>['ISSUER_MISMATCH','INVALID_SOURCE','SOURCE_LIMIT'].includes(c))&&(sec.status!=='unavailable'||sec.observations.length))))return null;
  const c=v.sources.catalyst;
  if(c!==null) {
    if(!exact(c,['evidence_id','event_at','confirmation','confirmation_basis','published_at','retrieved_at'])||c.evidence_id!=='calendar:event-days'||forecastInstant(c.event_at)===null||!['confirmed','estimated','cancelled'].includes(c.confirmation)||!['issuer','regulator',null].includes(c.confirmation_basis)||['published_at','retrieved_at'].some(k=>c[k]!==null&&forecastInstant(c[k])===null))return null;
    const e=v.packet.evidence.find(e=>e.evidence_id===c.evidence_id);
    const micros=forecastInstantMicros(c.event_at)-forecastInstantMicros(v.packet.assessed_at);
    if(!Number.isSafeInteger(Number(micros))||!e||e.source_id!=='loaded-calendar'||e.metric!=='event_days_until'||e.observed_at!==null||e.published_at!==c.published_at||e.retrieved_at!==c.retrieved_at||e.basis!==(c.confirmation==='estimated'?'estimate':'unknown')||e.value!==Number(micros)/86400000000)return null;
  }
  return v;
}
export function councilPublicationWindow(filed) {
  if(!forecastDay(filed)||+filed.slice(0,4)<2000||+filed.slice(0,4)>2099)return null;
  const base=Date.parse(filed+'T00:00:00Z');
  return {earliest:new Date(base-14*3600000).toISOString(),latest_exclusive:new Date(base+36*3600000).toISOString(),precision:'date-only',offset_policy:'utc-minus12-plus14'};
}
export async function councilRequestDigest(payload) {
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export function councilAdmissionEnvelope(v,payload,digest) {
  if(!exact(v,['contract_version','rule_version','run_id','request_sha256','status','records','quality',...AUTHORITY])||v.contract_version!=='council-admission-v1'||v.rule_version!=='family-provenance-v1'||v.run_id!==payload.packet.run_id||v.request_sha256!==digest||!['conditional','needs-data'].includes(v.status)||AUTHORITY.some(k=>v[k]!==false)||!Array.isArray(v.records)||v.records.length!==payload.packet.evidence.length)return false;
  for(const [i,r] of v.records.entries()) {
    const e=payload.packet.evidence[i];
    const kind={market:'quote',financial:'sec-duration',risk:'sec-instant',catalyst:'catalyst-countdown'}[e.family];
    if(!exact(r,['evidence_id','kind','eligible','reason_codes','publication_window'])||r.evidence_id!==e.evidence_id||r.kind!==kind||typeof r.eligible!=='boolean'||!Array.isArray(r.reason_codes)||r.reason_codes.length>8||!r.reason_codes.every(c=>REASONS.includes(c))||new Set(r.reason_codes).size!==r.reason_codes.length||r.eligible!==(r.reason_codes.length===0))return false;
    const proof=payload.sources.sec?.observations.find(o=>o.evidence.evidence_id===e.evidence_id);
    const expected=proof?councilPublicationWindow(proof.inputs[0].filed_on):null,w=r.publication_window;
    if(expected===null){if(w!==null)return false;}
    else if(!exact(w,['earliest','latest_exclusive','precision','offset_policy'])||w.precision!=='date-only'||w.offset_policy!==expected.offset_policy||forecastInstantMicros(w.earliest)!==forecastInstantMicros(expected.earliest)||forecastInstantMicros(w.latest_exclusive)!==forecastInstantMicros(expected.latest_exclusive))return false;
  }
  const q=v.quality,known=id=>payload.packet.evidence.some(e=>e.evidence_id===id);
  if(!exact(q,['usable_ids','issues','missing_families','conflicting_ids'])||!Array.isArray(q.usable_ids)||!Array.isArray(q.conflicting_ids)||q.conflicting_ids.length>8||!q.conflicting_ids.every(known)||!Array.isArray(q.issues)||q.issues.length>8||!q.issues.every(i=>exact(i,['evidence_id','codes'])&&known(i.evidence_id)&&Array.isArray(i.codes)&&i.codes.length<=6&&i.codes.every(c=>QUALITY.includes(c))))return false;
  const usable=v.records.filter(r=>r.eligible).map(r=>r.evidence_id);
  const missing=FAMILIES.filter(f=>!payload.packet.evidence.some(e=>e.family===f&&usable.includes(e.evidence_id)));
  return equal(q.usable_ids,usable)&&q.conflicting_ids.every(id=>!usable.includes(id))&&equal(q.missing_families,missing)&&v.status===(missing.length||q.conflicting_ids.length?'needs-data':'conditional');
}
export function councilV2Envelope(v,payload,digest) {
  if(!object(v)||!Object.hasOwn(v,'admission')||v.contract_version!=='portfolio-council-v2'||v.snapshot_id!==digest||!councilAdmissionEnvelope(v.admission,payload,digest)||!equal(v.quality,v.admission.quality))return false;
  const {admission,...base}=v;
  return councilEnvelope({...base,contract_version:'portfolio-council-v1'},{mode:'loaded',packet:payload.packet});
}
