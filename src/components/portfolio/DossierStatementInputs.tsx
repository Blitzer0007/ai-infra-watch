import {formatStatementValue,type AdmittedStatement, type admitDossierStatements} from '../../utils/dossierStatements';
import {dossierStatusLabels} from '../../utils/companyDossier';
import {SEC_STATEMENT_CONCEPTS} from '../../../shared/secStatementObservations.js';
const statementConcepts=SEC_STATEMENT_CONCEPTS as readonly {metric:string;label:string}[];
export function DossierStatementCards({rows,fictional}:{rows:AdmittedStatement[];fictional:boolean}){
  return <div className="grid min-w-0 gap-3 lg:grid-cols-2">{rows.map(row=><article key={row.id} data-testid="dossier-statement" data-metric={row.metric} className="min-w-0 space-y-2 break-words rounded-lg border border-cyan-200/25 p-3 text-sm">
    <h4 className="font-semibold">{row.label}</h4><p>{fictional?'Fictional · ':''}Original declaration bound · source unverified</p>
    <p data-testid="statement-value" className="text-lg font-semibold">{formatStatementValue(row.value,row.unit)}</p>
    <p>{row.period.start?`${row.period.start} to ${row.period.end} · annual duration`:`As of ${row.period.end} · instant`}</p>
    <p>{row.measurementBasis.startsWith('debt-')?'Individual borrowing component; not total debt.':row.measurementBasis.startsWith('duration-weighted-')?'Weighted-average shares over this period; not point-in-time shares.':row.measurementBasis==='point-in-time-cover-page-shares'?'Cover-page date; not a replacement for balance-date shares.':row.unit==='USD/shares'?'Reported basic/diluted EPS declaration; not a valuation multiple.':'Value applies only to the declared date and definition.'}</p>
    <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Original statement input and filing</summary>
      <p className="break-all">{row.sourceLocator.namespace}:{row.sourceLocator.tag} · unit {row.sourceLocator.unit} · source row {row.sourceLocator.rowIndex}</p>
      <p>Original supplied value: {String(row.value)} {row.unit}.</p>
      <p>{row.filing.form} · {row.filing.accession} · filed {row.filing.filedOn} with date-only precision.</p>
      <p>Filing focus: {row.filing.filingFiscalYear} / {row.filing.filingFiscalPeriod}. This is not the fact’s fiscal year or period.</p>
      <p>Fact fiscal labels, adjustment and dimensional scope remain unknown. Supplied retrieval: {row.retrievedAt}.</p>
      <p>Publication uncertainty bounds: {row.publicationWindow.earliest} to exclusive {row.publicationWindow.latest_exclusive}. Exact publication time is not supplied.</p>
      <p className="break-all">Constructed filing-index reference: {row.sourceReference.filingIndexUrl}. Original document not retained or verified.</p>
      <p>{row.filing.revisionStatus==='amendment-declared'?'Amended filing declared; financial restatement not certified.':row.filing.revisionStatus==='later-vintage-selected'?'A later declared filing vintage was selected.':'Restatement status not established.'} Prior declared vintages: {row.filing.priorVintageCount}; prior values were not compared.</p>
    </details>
  </article>)}</div>;
}
export function DossierStatementSources({admission}:{admission:ReturnType<typeof admitDossierStatements>}){
  if(admission.status==='not-connected')return null;
  return <section className="space-y-3 border-t border-white/20 pt-3" aria-label="Statement input validation">
    <h4 className="font-semibold">Statement input validation</h4><p>{admission.reason}</p>
    <p>Validation makes no provider, model or database call. Acquisition usage and source coverage remain unknown.</p>
    {admission.snapshots.map((s,index)=><details key={index} className="min-w-0 rounded-lg border border-white/20 p-3">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{s.requestedPeriod.start?`${s.requestedPeriod.start} to `:'Instant · '}{s.requestedPeriod.end} · {s.observations.length} admitted declarations</summary>
      <p>Source status: {dossierStatusLabels[s.status]??'Financial inputs unavailable'}. This does not certify complete statements.</p>
      <p>Declared source: SEC companyfacts · supplied retrieval {s.retrievedAt??'unavailable'} · assessed {s.assessedAt}.</p>
      <p>Missing requested fields: {s.missingMetrics.length}. No missing value becomes an observed zero.</p>
      {!!s.missingMetrics.length&&<ul className="list-disc pl-5">{s.missingMetrics.map(metric=><li key={metric}>{statementConcepts.find(c=>c.metric===metric)?.label??'Unsupported financial input'}</li>)}</ul>}
      <p>Total interest-bearing debt, enterprise value, EBITDA, P/E and EV/EBITDA remain unavailable.</p>
      <p>Filing references are constructed from supplied metadata; original source documents are not retained or verified. No source, issuer, valuation, aggregation or decision authority is granted.</p>
      {!!s.issues.length&&<p>Some requested inputs were absent, unsupported, ambiguous or incompatible. These are input-quality findings, not a complete filing history or company risk rating.</p>}
    </details>)}
  </section>;
}
