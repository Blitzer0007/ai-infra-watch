import {validateSecStatementReceipt} from '../../shared/secStatementAdmission.js';
import type {FinancialObservationRequest} from './companyFinancialObservations';
export type DossierStatementPacket={contractVersion:'company-dossier-statements-v2';symbol:string;expectedCik:string;assessedAt:string;retrievedAt:string|null;source:unknown;entries:{period:{start:string|null;end:string};receipt:unknown}[]};
export type AdmittedStatementSnapshot=NonNullable<ReturnType<typeof validateSecStatementReceipt>['snapshot']>;
export type AdmittedStatement=AdmittedStatementSnapshot['observations'][number];
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:string[])=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function admitDossierStatements(symbol:string,reference:FinancialObservationRequest|null,packet:unknown){
  const base={contractVersion:'company-dossier-statements-admission-v2' as const,status:'invalid' as 'invalid'|'not-connected'|'conditional'|'needs-data',snapshots:[] as AdmittedStatementSnapshot[],reason:'Statement receipt is not bound to its supplied original inputs.',verifiesSourceRecords:false as const,issuerMappingVerified:false as const,grantsDecisionEligibility:false as const,grantsValuationEligibility:false as const,aggregationEligibility:false as const};
  if(packet===null||packet===undefined)return {...base,status:'not-connected' as const,reason:'Statement inputs are not connected.'};
  if(!exact(packet,['contractVersion','symbol','expectedCik','assessedAt','retrievedAt','source','entries'])||!object(packet)||packet.contractVersion!=='company-dossier-statements-v2'||packet.symbol!==symbol
    ||typeof symbol!=='string'||!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)||!Array.isArray(packet.entries)||!packet.entries.length||packet.entries.length>3)return base;
  if(reference&&(reference.symbol!==symbol||reference.cik!==packet.expectedCik||reference.assessedAt!==packet.assessedAt))return base;
  const snapshots:AdmittedStatementSnapshot[]=[],periods=new Set<string>(),filings=new Map<string,string>();
  for(const entry of packet.entries){
    if(!exact(entry,['period','receipt'])||!object(entry)||!exact(entry.period,['start','end'])||!object(entry.period))return base;
    if(!(entry.period.start===null||typeof entry.period.start==='string'&&entry.period.start.length===10)||typeof entry.period.end!=='string'||entry.period.end.length!==10)return base;
    const key=(entry.period.start??'instant')+'>'+entry.period.end;if(periods.has(key))return base;periods.add(key);
    const result=validateSecStatementReceipt({symbol,expectedCik:packet.expectedCik,assessedAt:packet.assessedAt,retrievedAt:packet.retrievedAt,period:entry.period,source:packet.source},entry.receipt);
    if(result.status==='invalid'||!result.snapshot)return base;
    for(const observation of result.snapshot.observations){
      const f=observation.filing,metadata=JSON.stringify([f.form,f.filedOn,f.filingFiscalYear,f.filingFiscalPeriod]);
      if(filings.has(f.accession)&&filings.get(f.accession)!==metadata)return {...base,reason:'Filing metadata conflicts across the supplied periods.'};
      filings.set(f.accession,metadata);
    }
    snapshots.push(result.snapshot);
  }
  return {...base,status:snapshots.some(s=>s.observations.length)?'conditional':'needs-data',snapshots,reason:'Bound to supplied original declarations only; publisher and issuer verification remain unestablished.'};
}
export function statementRows(admission:ReturnType<typeof admitDossierStatements>,section:'Financial health'|'Valuation'){
  const money=section==='Financial health';
  return admission.snapshots.flatMap(s=>s.observations).filter(row=>money?row.unit==='USD':row.unit==='shares'||row.unit==='USD/shares');
}
export function formatStatementValue(value:number,unit:string){
  if(typeof value!=='number'||!Number.isFinite(value)||!['USD','shares','USD/shares'].includes(unit))return 'Unavailable';
  const display=Object.is(value,-0)?0:value;
  const amount=display!==0&&Math.abs(display)<.0001?display.toExponential(4):display.toLocaleString('en-US',{maximumFractionDigits:8});
  return amount+(unit==='USD/shares'?' USD per share':' '+unit);
}
