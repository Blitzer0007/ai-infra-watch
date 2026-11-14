/** Development-only demonstration; never relabel these facts as a held issuer. */
import {useState} from 'react';
import CompanyDossier from './CompanyDossier';
import fictionalReceipt from '../../data/companyDossier.fictional.json';
import type {FinancialObservationRequest} from '../../utils/companyFinancialObservations';
import statementFixture from '../../data/companyStatements.fictional.json';
import {buildSecStatementObservations} from '../../../shared/secStatementObservations.js';
import type {DossierStatementPacket} from '../../utils/dossierStatements';
export const fictionalDossierRequest:FinancialObservationRequest={symbol:'FICT',cik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',source:{status:'loaded',receipt:fictionalReceipt}};
export function fictionalDossierStatements():DossierStatementPacket {
  const base={symbol:'FICT',expectedCik:'0000000001',assessedAt:fictionalDossierRequest.assessedAt,retrievedAt:'2026-11-09T12:00:00Z',source:{status:'loaded',facts:structuredClone(statementFixture.facts)}};
  return {contractVersion:'company-dossier-statements-v2',...base,entries:[{start:null,end:'2025-12-31'},{start:'2025-01-01',end:'2025-12-31'},{start:null,end:'2026-02-10'}].map(period=>({period,receipt:buildSecStatementObservations({...base,period})}))};
}
export default function CompanyDossierPreview(){
  const [open,setOpen]=useState(false);
  const [statements,setStatements]=useState<DossierStatementPacket|null>(null);
  return <section className="space-y-3 rounded-xl border border-cyan-200/25 p-4" aria-label="Fictional company dossier preview" data-testid="company-dossier-preview">
    <h2 className="text-lg font-semibold">Company dossier · fictional preview</h2>
    <p className="text-sm text-white/75">Inspect an invented FICT issuer with annual financial declarations. This preview uses bundled fixtures; it reads no holdings, source API or model.</p>
    <button type="button" aria-expanded={open} onClick={()=>{setOpen(value=>!value);setStatements(null);}} className="min-h-11 rounded-lg border border-cyan-200/40 px-3 py-2 text-sm font-semibold text-cyan-100">{open?'Close fictional dossier':'Open fictional dossier'}</button>
    {open&&<><button type="button" disabled={!!statements} onClick={()=>setStatements(fictionalDossierStatements())} className="ml-2 min-h-11 rounded-lg border border-cyan-200/40 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:opacity-60">{statements?'Fictional statement inputs loaded':'Add fictional statement inputs'}</button><CompanyDossier symbol="FICT" configuredName="Fictional Components Ltd" request={fictionalDossierRequest} statements={statements} fictional/></>}
  </section>;
}
