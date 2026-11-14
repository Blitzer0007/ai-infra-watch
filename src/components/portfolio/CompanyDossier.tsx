import {useId,useState} from 'react';
import type {CompanyFinancialObservation,FinancialObservationRequest} from '../../utils/companyFinancialObservations';
import {DOSSIER_SECTIONS,dossierFinancials,dossierObservations,dossierStatusLabels,dossierIssueLabels,formatDossierValue,type DossierSection} from '../../utils/companyDossier';

const control='min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold';
type Props={symbol:string;configuredName?:string;request:FinancialObservationRequest|null;fictional?:boolean;key?:string};

export default function CompanyDossier({symbol,configuredName,request,fictional=false}:Props){
  const [section,setSection]=useState<DossierSection>('Overview');
  const id=useId(),panel=id+'-panel',heading=id+'-heading';
  const {snapshot,status}=dossierFinancials(symbol,request);
  const rows=dossierObservations(snapshot,section);
  const references=[...new Map((snapshot?.observations??[]).flatMap(o=>o.references.map(ref=>[ref.accession,ref] as const))).values()];
  return <section aria-label={symbol+' company dossier'} data-testid="company-dossier" className="min-w-0 space-y-4 rounded-xl border border-cyan-200/25 p-4 text-sm text-white/80">
    <header className="space-y-2">
      <p className="font-semibold text-cyan-100">{fictional?'Fictional preview · ':''}{symbol} company dossier</p>
      {configuredName&&<p className="break-words">{configuredName} · {fictional?'invented company':'name from app configuration'}</p>}
      <p role="status" data-testid="dossier-source-status">{dossierStatusLabels[status]}. Source coverage and issuer verification remain unverified.</p>
      {fictional&&<p className="rounded-lg border border-amber-200/30 p-3 font-semibold text-amber-100">Fictional data only. These are invented financial statements, not a real issuer or your holdings. Every populated figure below is a demonstration.</p>}
      <p>Read-only research · no accounting reconciliation or decision eligibility is granted.</p>
    </header>
    <nav aria-label={symbol+' dossier sections'} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {DOSSIER_SECTIONS.map(label=><button key={label} type="button" aria-pressed={section===label} aria-controls={panel} onClick={()=>setSection(label)} className={control+(section===label?' border-cyan-200/60 bg-cyan-200/10 text-cyan-100':' border-white/25 text-white/80')}>{label}</button>)}
    </nav>
    <section id={panel} aria-labelledby={heading} className="min-w-0 space-y-4" data-testid="dossier-section">
      <h3 id={heading} className="text-lg font-semibold">{section}</h3>
      {section==='Overview'&&<>
        <p>Business description unavailable. No verified business model, customer mix or issuer profile is connected to this dossier.</p>
        <dl className="grid gap-2 sm:grid-cols-2"><dt>Supported loaded observations</dt><dd>{snapshot?.observations.length??0} · {snapshot?.observations.length?'partial coverage':'coverage not established'}</dd><dt>Financial source</dt><dd>{dossierStatusLabels[status]}</dd><dt>Issuer / source verification</dt><dd>Unverified</dd><dt>Trading or allocation decision</dt><dd>Withheld</dd></dl>
        <p>Choose a section to inspect supported observations and missing inputs. Holding returns, analyst targets and model opinions are not substitutes for company financial statements.</p>
      </>}
      {(section==='Growth'||section==='Financial health')&&<>
        <p>{section==='Growth'?'Annual-duration declarations and their supported comparisons; no growth forecast is supplied.':'Declared cash flows and point-in-time balances; no overall financial-health rating is inferred.'}</p>
        {!rows.length&&<p>No supported observations loaded for this section. This does not mean zero revenue, zero cash flow or a healthy balance sheet.</p>}
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">{rows.map(row=><Observation key={row.id} row={row} fictional={fictional}/>)}</div>
        {section==='Financial health'&&<p>Cash and interest-bearing debt are unavailable. Total liabilities / equity is a different measure from debt / equity.</p>}
      </>}
      {section==='Valuation'&&<>
        <p>Valuation multiples unavailable. No compatible price, shares, earnings or EBITDA contract is connected here.</p>
        <ul className="list-disc space-y-2 pl-5"><li>P/E needs supported earnings per share and a compatible price basis.</li><li>EV/EBITDA needs compatible cash, interest-bearing debt, shares, price and EBITDA inputs.</li><li>Missing or nonpositive denominators cannot establish that a company is cheap.</li></ul>
        <p>Unsupported inputs: cash, interest-bearing debt, shares, EPS and EBITDA. No zero values or multiples are inferred.</p>
      </>}
      {section==='Catalysts'&&<><p>No company event feed is connected to this dossier. Upcoming-event coverage is unknown; this is not a claim that no events exist.</p><p>Confirmed, estimated, cancelled and date-only events require their own source evidence before they can appear here.</p></>}
      {section==='Risks'&&<><p>No evidence-backed company risk assessment is connected. Financial gaps and unverified sources cannot establish a low-risk result.</p><ul className="list-disc space-y-2 pl-5"><li>Source authenticity and ticker-to-issuer mapping remain unverified.</li><li>Full statement coverage, fiscal labels and adjustment basis are incomplete.</li><li>Amendments and restatements need original filing evidence.</li><li>These declarations do not authorize trades or reconcile account history.</li></ul></>}
      {section==='Sources'&&<>
        <p>Source status: {dossierStatusLabels[status]}. Loaded metadata is not publisher authentication.</p>
        {snapshot&&<dl className="grid min-w-0 gap-2 break-words sm:grid-cols-2"><dt>Declared source</dt><dd>SEC EDGAR companyfacts</dd><dt>Declared issuer CIK</dt><dd>{snapshot.cik} · mapping unverified</dd><dt>Declared retrieval</dt><dd>{[...new Set(snapshot.observations.map(o=>o.retrievedAt))].join(' · ')||'Unavailable'}</dd><dt>Assessed at</dt><dd>{snapshot.assessedAt}</dd><dt>Projection activity</dt><dd>0 provider / model / database calls · acquisition usage unknown</dd></dl>}
        {!!snapshot?.issues.length&&<ul className="list-disc space-y-2 pl-5">{snapshot.issues.map(code=><li key={code}>{dossierIssueLabels[code]??'A financial input requires review.'}</li>)}</ul>}
        {!references.length&&<p>No supported filing references loaded. The absence of references is not an empty filing history.</p>}
        {references.map(ref=><article key={ref.accession} className="min-w-0 space-y-2 break-words rounded-lg border border-white/20 p-3">
          <h4 className="font-semibold">{fictional?'Fictional · ':''}{ref.form} · {ref.accession}</h4>
          <p>Filed on {ref.filedOn} · calendar-day precision; exact publication time not supplied.</p>
          <p>{ref.restatementStatus==='amendment-declared'?'An amended filing is declared; financial restatement is not certified.':'Restatement status not established.'}</p>
          <p>Constructed accession-index reference. This URL was reconstructed from supplied fields; no original document has been fetched or verified.</p>
          {fictional?<p className="break-all">{ref.url} · demonstration reference only</p>:<a className="inline-block min-h-11 break-all py-2 text-cyan-100 underline" href={ref.url} target="_blank" rel="noopener noreferrer">Open constructed SEC reference ↗</a>}
          <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Publication uncertainty bounds</summary><p className="break-words">Earliest bound: {ref.publicationWindow.earliest}. Exclusive latest bound: {ref.publicationWindow.latest_exclusive}. These are conservative date-policy bounds, not known publication timestamps or proof of historical availability.</p></details>
        </article>)}
      </>}
    </section>
  </section>;
}

function Observation({row,fictional}:{row:CompanyFinancialObservation;fictional:boolean;key?:string}){
  return <article className="min-w-0 space-y-2 break-words rounded-lg border border-white/20 p-3" data-testid="dossier-observation" data-metric={row.metric}>
    <h4 className="font-semibold">{row.label}</h4><p>{fictional?'Fictional · ':''}{row.kind==='derived'?'Derived from declared inputs':'Source-field declaration'}</p>
    <p className="text-lg font-semibold" data-testid="dossier-value">{formatDossierValue(row.value,row.unit)}</p>
    <p>{row.period.start?`${row.period.start} to ${row.period.end} · annual duration`:`As of ${row.period.end} · instant balance`}</p>
    <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Definition and original inputs</summary>
      <p>{row.kind==='derived'?row.label+'; uses only the listed period-aligned declarations.':'Value copied from the listed source-field declaration.'}</p>
      <p>Fiscal year / fiscal period unavailable · adjustment basis unknown.</p><p>Declared SEC source · retrieved {row.retrievedAt}</p>
      <ul className="mt-2 space-y-3">{row.inputs.map((input,index)=><li key={index} className="break-all">{input.tag}: {formatDossierValue(input.value,'USD')} · {input.period_start?input.period_start+' to ':''}{input.period_end} · {input.form} {input.accession} · filed {input.filed_on}</li>)}</ul>
      <p className="mt-2">The declared fields and calculation do not verify the source or establish decision eligibility.</p>
    </details>
  </article>;
}
