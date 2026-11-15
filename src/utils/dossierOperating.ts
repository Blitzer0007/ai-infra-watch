/** Scoped annual presentation. Supplied-source consistency is not source authentication. */
import {validateSecOperatingReceipt} from '../../shared/secStatementAdmission.js';
import {dossierFinancials,dossierObservations} from './companyDossier';
import {reviewDossierValuation,withholdDossierValuationStatements} from './dossierValuation';
import type {FinancialObservationRequest} from './companyFinancialObservations';
export type DossierOperatingPacket={contractVersion:'company-dossier-operating-v1';symbol:string;expectedCik:string;assessedAt:string;retrievedAt:string|null;source:unknown;entries:{period:{start:string;end:string};receipt:unknown}[]};
type Snapshot=NonNullable<ReturnType<typeof validateSecOperatingReceipt>['snapshot']>;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:string[])=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function admitDossierOperating(symbol:string,reference:FinancialObservationRequest|null,packet:unknown){
  const base={status:'invalid' as 'invalid'|'not-connected'|'conditional'|'needs-data',snapshots:[] as Snapshot[],reason:'Annual receipts are not bound to the supplied original inputs.'};
  if(packet===null||packet===undefined)return {...base,status:'not-connected' as const,reason:'Annual inputs are not connected.'};
  if(!exact(packet,['contractVersion','symbol','expectedCik','assessedAt','retrievedAt','source','entries'])||!object(packet)||packet.contractVersion!=='company-dossier-operating-v1'||packet.symbol!==symbol||typeof symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!Array.isArray(packet.entries)||!packet.entries.length||packet.entries.length>3)return base;
  if(reference&&(reference.symbol!==symbol||reference.cik!==packet.expectedCik||reference.assessedAt!==packet.assessedAt))return base;
  const snapshots:Snapshot[]=[],periods=new Set<string>(),filings=new Map<string,string>();
  for(const e of packet.entries){
    if(!exact(e,['period','receipt'])||!object(e)||!exact(e.period,['start','end'])||!object(e.period)||typeof e.period.start!=='string'||e.period.start.length!==10||typeof e.period.end!=='string'||e.period.end.length!==10)return base;
    const key=e.period.start+'>'+e.period.end;if(periods.has(key))return base;periods.add(key);
    const a=validateSecOperatingReceipt({symbol,expectedCik:packet.expectedCik,assessedAt:packet.assessedAt,retrievedAt:packet.retrievedAt,period:e.period,source:packet.source},e.receipt);
    if(a.status==='invalid'||!a.snapshot||a.snapshot.status==='invalid-payload')return base;
    for(const row of a.snapshot.observations){const f=row.filing,meta=JSON.stringify([f.form,f.filedOn,f.filingFiscalYear,f.filingFiscalPeriod]);if(filings.has(f.accession)&&filings.get(f.accession)!==meta)return base;filings.set(f.accession,meta);}
    snapshots.push(a.snapshot);
  }
  return {...base,status:snapshots.some(s=>s.observations.length)?'conditional':'needs-data',snapshots,reason:'Bound to supplied annual declarations only; source, issuer and statement context remain unverified.'};
}
const fieldKey=(tag:string,unit:string,start:string|null,end:string)=>JSON.stringify([tag,unit,start,end]);
const periodKey=(start:string|null,end:string)=>(start??'instant')+'>'+end;
type Filing={accession:string;form:string;filedOn:string;fy:number|null;fp:string|null};
type Conflict={kind:'field'|'filing'|'scope';label:string};
const revenueTags=new Set(['RevenueFromContractWithCustomerExcludingAssessedTax','Revenues','SalesRevenueNet']);
export function reviewDossierOperating(symbol:string,reference:FinancialObservationRequest|null,statements:unknown,packet:unknown){
  let financials=dossierFinancials(symbol,reference),valuation=reviewDossierValuation(symbol,reference,statements);
  const admitted=admitDossierOperating(symbol,reference,packet),raw=admitted.snapshots.flatMap(s=>s.observations);
  const legacy=financials.snapshot?.observations??[],facts=legacy.flatMap(o=>o.inputs);
  const core=valuation.statementAdmission.snapshots.flatMap(s=>s.observations);
  const rawKey=(r:Snapshot['observations'][number])=>fieldKey(r.sourceLocator.tag,r.unit,r.period.start,r.period.end);
  const oldKey=(f:typeof facts[number])=>fieldKey(f.tag,f.unit,f.period_start,f.period_end);
  const rawFiling=(r:Snapshot['observations'][number]):Filing=>({accession:r.filing.accession,form:r.filing.form,filedOn:r.filing.filedOn,fy:r.filing.filingFiscalYear,fp:r.filing.filingFiscalPeriod});
  const referenceFilings:Filing[]=[...facts.map(f=>({accession:f.accession,form:f.form,filedOn:f.filed_on,fy:null,fp:null})),...core.map(rawFiling)];
  const badFiles=new Set<string>(),badFields=new Set<string>(),conflicts=new Map<string,Conflict>();
  const declaredScope=admitted.snapshots[0];
  const scopeMismatch=!!declaredScope&&valuation.statementAdmission.snapshots.some(s=>s.cik!==declaredScope.cik||s.assessedAt!==declaredScope.assessedAt);
  if(scopeMismatch)conflicts.set('scope',{kind:'scope',label:'Annual and core statement issuer or assessment scopes disagree.'});
  for(const row of raw){
    const f=rawFiling(row);
    if(referenceFilings.some(old=>old.accession===f.accession&&(old.form!==f.form||old.filedOn!==f.filedOn||(old.fy!==null&&old.fy!==f.fy)||(old.fp!==null&&old.fp!==f.fp)))){
      badFiles.add(f.accession);conflicts.set('filing:'+f.accession,{kind:'filing',label:f.accession+' · incompatible filing declarations'});
    }
    const key=rawKey(row);
    if(facts.some(old=>oldKey(old)===key&&(old.value!==row.value||old.accession!==f.accession||old.form!==f.form||old.filed_on!==f.filedOn))){
      badFields.add(key);conflicts.set('field:'+key,{kind:'field',label:row.sourceLocator.tag+' · '+row.period.start+' to '+row.period.end+' · unreconciled value or filing vintage'});
    }
  }
  const keptLegacy=legacy.filter(o=>!scopeMismatch&&o.inputs.every(f=>!badFiles.has(f.accession)&&!badFields.has(oldKey(f))));
  if(financials.snapshot&&keptLegacy.length!==legacy.length){
    const status=keptLegacy.length?'partial' as const:'invalid-payload' as const;
    financials={status,snapshot:{...financials.snapshot,status,observations:keptLegacy,issues:[...financials.snapshot.issues,'DOSSIER_SOURCE_CONFLICT']}};
  }
  if(scopeMismatch||core.some(row=>badFiles.has(row.filing.accession)))valuation=withholdDossierValuationStatements(valuation);
  const sourceRows=raw.filter(row=>!scopeMismatch&&!badFiles.has(row.filing.accession)&&!badFields.has(rawKey(row)));
  // Fold only matching source cards that are actually visible elsewhere, not a
  // matching input hidden inside an existing calculation's advanced explanation.
  const visibleFacts=[...dossierObservations(financials.snapshot,'Growth'),...dossierObservations(financials.snapshot,'Financial health')].filter(o=>o.kind==='source-field-declaration').flatMap(o=>o.inputs);
  const folded=new Set(sourceRows.filter(row=>visibleFacts.some(old=>oldKey(old)===rawKey(row)&&old.value===row.value&&old.accession===row.filing.accession&&old.form===row.filing.form&&old.filed_on===row.filing.filedOn)).map(row=>row.id));
  const rows=sourceRows.filter(row=>!folded.has(row.id)),definitions=new Map<string,Set<string>>();
  for(const f of [...facts.map(f=>({tag:f.tag,unit:f.unit,start:f.period_start,end:f.period_end})),...raw.map(r=>({tag:r.sourceLocator.tag,unit:r.unit,start:r.period.start,end:r.period.end}))]){
    if(!revenueTags.has(f.tag))continue;const key=JSON.stringify([f.unit,f.start,f.end]);if(!definitions.has(key))definitions.set(key,new Set());definitions.get(key)!.add(f.tag);
  }
  const periods=admitted.snapshots.map(s=>{const p=s.requestedPeriod,key=periodKey(p.start,p.end),same=(r:Snapshot['observations'][number])=>periodKey(r.period.start,r.period.end)===key;return {key,cik:s.cik,start:p.start,end:p.end,boundCount:s.observations.length,visibleCount:rows.filter(same).length,foldedCount:sourceRows.filter(r=>same(r)&&folded.has(r.id)).length,withheldCount:s.observations.length-sourceRows.filter(same).length,sourceStatus:s.status,retrievedAt:s.retrievedAt,assessedAt:s.assessedAt,missingMetrics:[...s.missingMetrics]};});
  const status=conflicts.size?'conflicting' as const:admitted.status;
  return {financials,valuation,operating:{status,scope:admitted.snapshots.length?[symbol,admitted.snapshots[0].cik,admitted.snapshots[0].assessedAt].join('|'):'',reason:status==='conflicting'?'Conflicting declarations and dependent figures are withheld; no source or vintage is preferred.':admitted.reason,rows,sourceRows,periods,boundCount:raw.length,foldedCount:folded.size,withheldCount:raw.length-sourceRows.length,definitionOverlapCount:[...definitions.values()].filter(v=>v.size>1).length,conflicts:[...conflicts.values()],sourceAuthenticityVerified:false as const,issuerMappingVerified:false as const,grantsDecisionEligibility:false as const,grantsValuationEligibility:false as const,aggregationEligibility:false as const}};
}
export type DossierOperatingReview=ReturnType<typeof reviewDossierOperating>['operating'];
export function operatingRows(view:DossierOperatingReview,section:'Growth'|'Financial health',period:string){
  const growth=new Set(['revenue_contract_excluding_tax','revenues_declared','net_sales_declared','operating_income_loss','net_income_loss']);
  return view.rows.filter(r=>periodKey(r.period.start,r.period.end)===period&&(section==='Growth'?growth.has(r.metric):!growth.has(r.metric)));
}
