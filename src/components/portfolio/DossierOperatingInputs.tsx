import {DossierStatementCards} from './DossierStatementInputs';
import {dossierStatusLabels} from '../../utils/companyDossier';
import {operatingRows,type DossierOperatingReview} from '../../utils/dossierOperating';
import {SEC_OPERATING_CONCEPTS} from '../../../shared/secStatementObservations.js';
const concepts=SEC_OPERATING_CONCEPTS as readonly {metric:string;label:string}[];
export function DossierOperatingStatus({view}:{view:DossierOperatingReview}){
  if(view.status==='not-connected')return null;
  return <p data-testid="dossier-operating-status" role={view.status==='invalid'||view.status==='conflicting'?'alert':'status'}>{view.status==='invalid'?'Annual inputs withheld.':view.status==='conflicting'?'Some dossier figures withheld because sources conflict.':view.status==='needs-data'?'Annual inputs need data.':'Annual declarations available in Growth and Financial health.'} {view.reason}</p>;
}
export function DossierOperatingPanel({view,section,period,onPeriod,fictional}:{view:DossierOperatingReview;section:'Growth'|'Financial health';period:string;onPeriod:(key:string)=>void;fictional:boolean}){
  if(view.status==='not-connected')return null;
  const rows=operatingRows(view,section,period);
  return <details data-testid="dossier-operating-panel" className="min-w-0 rounded-lg border border-cyan-200/25 p-3">
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">Additional annual declarations · {view.periods.length} supplied periods</summary>
    <div className="min-w-0 space-y-3 pt-3">
      <p>Separate, unverified original declarations. These are not a forecast, complete financial statements or an EBITDA calculation.</p>
      {view.conflicts.length>0&&<div role="alert"><p>{view.reason}</p><ul className="list-disc pl-5">{view.conflicts.map(c=><li key={c.kind+c.label}>{c.label}</li>)}</ul></div>}
      <p>{view.boundCount} original-row-bound declarations · {view.foldedCount} matching source cards folded · {view.withheldCount} conflicting declarations withheld. A field match is not independent corroboration.</p>
      {view.definitionOverlapCount>0&&<p>Different revenue definitions are loaded for {view.definitionOverlapCount} periods. Revenues, contract revenue and net sales remain separate; they are not added or interchanged.</p>}
      {view.periods.length>0&&view.boundCount>0&&<label className="block space-y-2">Annual period to inspect<select aria-label="Annual period to inspect" className="block min-h-11 w-full rounded-lg border border-white/25 bg-[#15181e] px-3 py-2" value={period} onChange={e=>onPeriod(e.target.value)}><option value="">Choose a period · none selected</option>{view.periods.map(p=><option key={p.key} value={p.key}>{p.start} to {p.end}</option>)}</select></label>}
      {!view.boundCount?<p>No supported annual declarations are available to inspect. Check Annual input sources for the scoped failure or missing coverage; this is not an empty financial history.</p>:!period?<p>Choose an annual period to inspect its declarations. No latest period is selected automatically.</p>:rows.length?<DossierStatementCards rows={rows} fictional={fictional} testId="dossier-operating-row"/>:<p>No additional displayable declarations for this section and selected period. Matching cards may already appear above; missing or withheld inputs are not zero.</p>}
      <p>DDA and share-based-compensation statement context remain unverified. No growth, margin, cash-flow total or valuation multiple is calculated from these inputs.</p>
    </div>
  </details>;
}
export function DossierOperatingSources({view,fictional}:{view:DossierOperatingReview;fictional:boolean}){
  if(view.status==='not-connected')return null;
  return <section aria-label="Annual input sources" className="min-w-0 space-y-3 border-t border-white/20 pt-3">
    <h4 className="font-semibold">Annual input sources</h4><p>{view.reason}</p>
    <p>Validation makes 0 provider / model / database calls. Acquisition usage, source authenticity and complete statement coverage remain unknown.</p>
    {view.periods.map(p=><details key={p.key} className="min-w-0 rounded-lg border border-white/20 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{p.start} to {p.end} · annual source review</summary>
      <p>{dossierStatusLabels[p.sourceStatus]??'Annual inputs need review'}. Supplied retrieval: {p.retrievedAt??'unavailable'} · assessed {p.assessedAt}.</p>
      <p>Declared issuer CIK: {p.cik} · mapping unverified.</p>
      <p>{p.boundCount} declarations bound · {p.foldedCount} matching source cards folded · {p.withheldCount} conflicting declarations withheld.</p>
      <p>Missing requested fields: {p.missingMetrics.length}. Missing values do not become zero or prove an empty filing history.</p>
      {p.missingMetrics.length>0&&<ul className="list-disc pl-5">{p.missingMetrics.map(metric=><li key={metric}>{concepts.find(c=>c.metric===metric)?.label??'Unsupported annual field'}</li>)}</ul>}
      <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Original supported annual declarations</summary><DossierStatementCards rows={view.sourceRows.filter(r=>r.period.start===p.start&&r.period.end===p.end)} fictional={fictional} testId="dossier-operating-source-row"/></details>
    </details>)}
    <p>Matching values are not independent source confirmation. Conflicting figures are withheld here too. Constructed references do not authenticate original filings; source, issuer, context, valuation and decision authority remain unverified.</p>
  </section>;
}
