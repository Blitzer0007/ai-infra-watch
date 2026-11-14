/** Development-only demonstration; never relabel these facts as a held issuer. */
import {useState} from 'react';
import CompanyDossier from './CompanyDossier';
import fictionalReceipt from '../../data/companyDossier.fictional.json';
import type {FinancialObservationRequest} from '../../utils/companyFinancialObservations';
export const fictionalDossierRequest:FinancialObservationRequest={symbol:'FICT',cik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',source:{status:'loaded',receipt:fictionalReceipt}};
export default function CompanyDossierPreview(){
  const [open,setOpen]=useState(false);
  return <section className="space-y-3 rounded-xl border border-cyan-200/25 p-4" aria-label="Fictional company dossier preview" data-testid="company-dossier-preview">
    <h2 className="text-lg font-semibold">Company dossier · fictional preview</h2>
    <p className="text-sm text-white/75">Inspect an invented FICT issuer with annual financial declarations. This preview uses bundled fixtures; it reads no holdings, source API or model.</p>
    <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)} className="min-h-11 rounded-lg border border-cyan-200/40 px-3 py-2 text-sm font-semibold text-cyan-100">{open?'Close fictional dossier':'Open fictional dossier'}</button>
    {open&&<CompanyDossier symbol="FICT" configuredName="Fictional Components Ltd" request={fictionalDossierRequest} fictional/>}
  </section>;
}
