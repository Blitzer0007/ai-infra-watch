import {lazy,Suspense,useState} from 'react';
const CompanyDossier=lazy(()=>import('./CompanyDossier'));
/** Load view code only on opening; no financial/provider request is made. */
export default function HoldingCompanyDossier({symbol,configuredName}:{symbol:string;configuredName?:string;key?:string}){
  const [open,setOpen]=useState(false);
  return <details className="rounded-xl border border-white/20 p-4" data-testid="holding-company-dossier" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Company dossier</summary>
    {open&&<div className="mt-3"><Suspense fallback={<p role="status">Loading dossier view…</p>}><CompanyDossier key={symbol} symbol={symbol} configuredName={configuredName} request={null}/></Suspense></div>}
  </details>;
}
