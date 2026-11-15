import {councilEnvelope,councilPayload} from '../../shared/portfolioCouncilContract.js';
import {forecastInstant,forecastInstantMicros} from './forecastInputs.js';
import {councilAdmissionPayload} from '../../shared/councilAdmission.js';
import {secCouncilReceipt} from '../../shared/councilSources.js';
import {resolveCatalystRevisions, type CatalystSnapshot} from './catalystCalendar';
export {councilEnvelope,councilPayload};
export type CouncilEvidence = { evidence_id:string;symbol:string;family:string;metric:string;value:number;unit:string;source_id:string;observed_at:string|null;published_at:string|null;retrieved_at:string|null;basis:'reported'|'estimate'|'unknown';period_start:string|null;period_end:string|null;simulated:boolean };
export type CouncilResult = {
  contract_version:string;presentation_version:string;run_id:string;snapshot_id:string;symbol:string;horizon_months:number;assessed_at:string;mode:'fixture'|'nvidia'|'unconfigured';status:string;termination_reason:string;disposition:string;
  quality:{usable_ids:string[];missing_families:string[];conflicting_ids:string[];issues:Array<{evidence_id:string;codes:string[]}>};
  roles:Partial<Record<'bull'|'bear'|'judge',{summary:string;claims?:Array<{claim_id:string;evidence_id:string;stance:string;implication:string}>;limitations?:string[];preference?:string;winning_claim_ids?:string[]}>>;
  evidence:CouncilEvidence[];trace:Array<{role:string;action:string;status:string}>;
  usage:{model_calls:number;tool_calls:number;prompt_chars:number;provider_requests:number|null;jev_calls:number};
  admission?:CouncilAdmission;
};
export type CouncilAdmission={contract_version:string;rule_version:string;run_id:string;request_sha256:string;status:'conditional'|'needs-data';quality:CouncilResult['quality'];records:Array<{evidence_id:string;kind:string;eligible:boolean;reason_codes:string[];publication_window:null|{earliest:string;latest_exclusive:string;precision:string;offset_policy:string}}>};
const stamp=(value:unknown):string|null=>forecastInstant(value)!==null?value as string:null;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

/** Public loaded facts only. No holding amounts, rule/thesis text or raw provider bodies. */
export function buildCouncilPacket(symbol:string,quote:unknown,financial:unknown,runId:string,nowMs:number,horizon:3|6|12,calendar?:CatalystSnapshot) {
  if(!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!Number.isSafeInteger(nowMs))throw Error('Invalid council input');
  const evidence:CouncilEvidence[]=[];
  const q=quote&&typeof quote==='object'&&!Array.isArray(quote)?quote as Record<string,unknown>:null;
  if(q&&q.symbol===symbol&&q.returnedSymbol===symbol) {
    const name=typeof q.provider==='string'?q.provider.toLowerCase():'';
    const source=['yahoo','finnhub','alpha-vantage'].includes(name)?name:/fixture|mock|^qa$/.test(name)?'fixture':'unknown';
    const simulated=q.simulated===true||q.sourceMode==='simulated'||q.status==='simulated'||source==='fixture';
    const admissibleFlags=(q.stale===undefined||q.stale===false)&&(q.simulated===undefined||q.simulated===false)&&(q.status===undefined||['live','ok','success','fresh'].includes(q.status as string));
    for(const [metric,field,unit] of [['price','price','USD'],['daily_change_pct','changePct','percent']]) {
      const value=q[field];if(!finite(value)||(metric==='price'&&(q.currency!=='USD'||value<=0)))continue;
      evidence.push({evidence_id:'loaded:'+metric,symbol,family:'market',metric,value,unit,source_id:source,
        observed_at:stamp(q.marketTime),published_at:stamp(q.publishedAt),retrieved_at:stamp(q.retrievedAt),basis:q.sourceMode==='live'&&admissibleFlags?'reported':'unknown',period_start:null,period_end:null,simulated});
    }
  }
  const f=financial&&typeof financial==='object'&&!Array.isArray(financial)?financial as Record<string,any>:null;
  if(f?.symbol===symbol&&f.councilSource!==undefined) {
    if(secCouncilReceipt(f.councilSource)&&f.councilSource.symbol===symbol)for(const o of f.councilSource.observations)evidence.push({...o.evidence});
  }else if(f?.symbol===symbol&&f.metrics)for(const [key,metric] of [['revenueGrowth','revenue_growth_pct'],['operatingMargin','operating_margin_pct']]) {
    const row=f.metrics[key];if(!row||row.status!=='verified'||row.unit!=='percent'||!finite(row.value))continue;
    evidence.push({evidence_id:'loaded:'+metric,symbol,family:'financial',metric,value:row.value,unit:'percent',source_id:'loaded-financial',observed_at:null,published_at:null,retrieved_at:null,basis:'unknown',period_start:null,period_end:typeof row.periodEnd==='string'?row.periodEnd:null,simulated:false});
  }
  const catalyst=councilCatalyst(calendar,symbol,nowMs);
  if(catalyst.evidence)evidence.push(catalyst.evidence);
  const packet={run_id:runId,symbol,horizon_months:horizon,assessed_at:new Date(nowMs).toISOString(),evidence};
  if(!councilPayload({mode:'loaded',packet}))throw Error('Invalid loaded council evidence');
  return packet;
}

/** Date-only schedules cannot yield a precise countdown. No fetching or inferred issuer confirmation. */
export function councilCatalyst(snapshot:CatalystSnapshot|undefined,symbol:string,nowMs:number) {
  const issues:string[]=[];
  const receipt={status:snapshot?.status||'unavailable',issues,evidence:null as CouncilEvidence|null,event:null as null|{date:string;confirmation:string;publishedAt:string|null;retrievedAt:string|null;method:string},proof:null as null|{evidence_id:string;event_at:string;confirmation:string;confirmation_basis:'issuer'|'regulator'|null;published_at:string|null;retrieved_at:string|null}};
  if(!snapshot||snapshot.status==='unavailable') {issues.push('CALENDAR_UNAVAILABLE');return receipt;}
  if(!['available','partial'].includes(snapshot.status)){issues.push('CALENDAR_INVALID');return receipt;}
  if(!Array.isArray(snapshot.events)||snapshot.events.length>500||!Number.isSafeInteger(nowMs)){issues.push('CALENDAR_INVALID');return receipt;}
  const revisions=resolveCatalystRevisions(snapshot.events);
  if(revisions.some(r=>r.event.symbol===symbol&&r.lineageIssue)){issues.push('CALENDAR_REVISION_UNRESOLVED');return receipt;}
  const candidates=revisions.filter(r=>!r.supersededBy&&r.event.symbol===symbol&&r.event.confirmation!=='cancelled');
  if(candidates.some(r=>r.event.precision==='date-only'))issues.push('EVENT_TIME_PRECISION_MISSING');
  const exact=candidates.map(r=>r.event).filter(e=>e.precision==='exact-time'&&stamp(e.date)!==null&&Date.parse(e.date)>=nowMs).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
  if(!exact.length){issues.push('NO_EXACT_UPCOMING_EVENT');return receipt;}
  const event=exact[0];
  receipt.event={date:event.date,confirmation:event.confirmation,publishedAt:stamp(event.publishedAt),retrievedAt:stamp(event.retrievedAt),method:'elapsed-UTC-days-until-event'};
  // Countdown is calculated, not a directly reported value; the v1 council cannot admit this basis.
  const micros=forecastInstantMicros(event.date)-BigInt(nowMs)*1000n;
  if(!Number.isSafeInteger(Number(micros))){issues.push('EVENT_INTERVAL_UNSUPPORTED');return receipt;}
  receipt.evidence={evidence_id:'calendar:event-days',symbol,family:'catalyst',metric:'event_days_until',value:Number(micros)/86400000000,unit:'days',source_id:'loaded-calendar',observed_at:null,published_at:stamp(event.publishedAt),retrieved_at:stamp(event.retrievedAt),basis:event.confirmation==='estimated'?'estimate':'unknown',period_start:null,period_end:null,simulated:false};
  receipt.proof={evidence_id:receipt.evidence.evidence_id,event_at:event.date,confirmation:event.confirmation,confirmation_basis:event.confirmationEvidence,published_at:receipt.evidence.published_at,retrieved_at:receipt.evidence.retrieved_at};
  issues.push('DERIVED_COUNTDOWN_NOT_REPORTED');
  return receipt;
}

export function inspectCouncilSources(symbol:string,quote:unknown,financial:unknown,runId:string,nowMs:number,horizon:3|6|12,calendar?:CatalystSnapshot) {
  const packet=buildCouncilPacket(symbol,quote,financial,runId,nowMs,horizon,calendar);
  const raw=financial&&typeof financial==='object'?financial as Record<string,any>:null;
  const sec=raw?.symbol===symbol&&secCouncilReceipt(raw.councilSource)&&raw.councilSource.symbol===symbol?structuredClone(raw.councilSource):null;
  const financialStatus=sec?sec.status:raw?.councilSource!==undefined?'invalid-source-receipt':'legacy-or-unavailable';
  const catalyst=councilCatalyst(calendar,symbol,nowMs);
  const request={mode:'loaded-v2',packet,sources:{sec,catalyst:catalyst.proof}};
  if(!councilAdmissionPayload(request))throw Error('Invalid conditional source packet');
  return {packet,financialStatus,sec,calendar:catalyst,request};
}

export function councilCoverageState(result:CouncilResult) {
  return {contract_version:'council-coverage-v1',mode:result.mode,observed_count:result.evidence.length,usable_count:result.quality.usable_ids.length,
    missing_families:result.quality.missing_families,conflict_count:result.quality.conflicting_ids.length,bull_claim_count:result.roles.bull?.claims?.length||0,bear_claim_count:result.roles.bear?.claims?.length||0,
    role_count:Object.keys(result.roles).length,judge_abstained:result.roles.judge?.preference==='insufficient'};
}
