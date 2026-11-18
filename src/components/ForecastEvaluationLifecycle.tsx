export type ForecastEvaluationProtocol = {
  version: 'forecast-evaluation-v1';
  coverage: { asOfUtcDate:string;returnedRows:number;rowLimit:number;truncated:boolean;completeUniverse:boolean;note:string };
  lifecycle: { total:number; pendingNotDue:number;pendingDueForReview:number;pendingUnknownTarget:number;verifiedReported:number;verifiedScorable:number;verifiedUnscorable:number;unknownStatus:number;independentScorable:number;overlappingExcluded:number };
  horizons: Record<'5D'|'20D'|'other',{total:number;pendingDueForReview:number;independentScorable:number}>;
  exclusions: Record<string,number>;
  metrics: {
    scoredNonoverlapping:number;medianAbsoluteErrorPctPoints:number|null;medianNoChangeBaselineErrorPctPoints:number|null;
    direction:{n:number;hits:number;accuracyPct:number|null};
    middle50:{n:number;hits:number;coveragePct:number|null;wilson95Pct:[number,number]|null};
    wide80:{n:number;hits:number;coveragePct:number|null;wilson95Pct:[number,number]|null};
    declaredCreationSourceCount:number;independentlyAuthenticatedSourceCount:null;
  };
  interpretation: 'insufficient'|'descriptive-only';
  decisionEligible:false;limitations:string[];
};
const fmt=(value:number|null,unit='')=>typeof value==='number'&&Number.isFinite(value)?value.toFixed(2)+unit:'—';
function Metric({label,count,detail}:{label:string;count:number;detail?:string}){
  return <div className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-3">
    <div className="text-xs text-white/65">{label}</div>
    <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{count}</div>
    {detail&&<div className="mt-1 text-[10px] text-white/50">{detail}</div>}
  </div>;
}

/** Pure presentation: no provider call, model call, portfolio mutation or polling. */
export default function ForecastEvaluationLifecycle({report,status}:{report:ForecastEvaluationProtocol|null;status:'ready'|'unavailable'}){
  if(status!=='ready'||report?.version!=='forecast-evaluation-v1') return <section data-testid="forecast-evaluation-lifecycle" aria-label="Forecast evaluation lifecycle" className="mt-3 rounded-xl border border-amber-300/25 p-3">
    <h3 className="text-sm font-semibold text-amber-100">Forecast evaluation lifecycle · unavailable</h3>
    <p className="mt-1 text-xs text-white/65" role="status">Pending, due and excluded-record counts are unavailable. This does not mean there are zero pending forecasts or any validated outcomes.</p>
  </section>;
  const c=report.lifecycle,m=report.metrics,v=report.coverage;
  return <section data-testid="forecast-evaluation-lifecycle" aria-label="Forecast evaluation lifecycle" className="mt-3 min-w-0 rounded-xl border border-cyan-300/25 bg-cyan-400/[.025] p-3 sm:p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-cyan-100">Forecast evaluation lifecycle</h3>
        <p className="mt-1 text-xs text-white/65">Recent returned records as of {v.asOfUtcDate} UTC. A passed target date is not proof of an adjusted market outcome.</p></div>
      <span className="rounded border border-amber-300/30 px-2 py-1 text-[10px] text-amber-100">Research only · no trade eligibility</span>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Metric label="Pending · not due" count={c.pendingNotDue}/>
      <Metric label="Due for review" count={c.pendingDueForReview} detail="Calendar target reached; result still pending"/>
      <Metric label="Pending · unknown date" count={c.pendingUnknownTarget}/>
      <Metric label="Verified reported" count={c.verifiedReported} detail="Stored label, not independent verification"/>
      <Metric label="Scorable, non-overlapping" count={c.independentScorable} detail={c.overlappingExcluded+' overlapping excluded'}/>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div data-testid="evaluation-scoring-denominators" className="min-w-0 rounded-lg border border-white/10 p-3 text-xs">
        <h4 className="font-semibold">Scoring denominators</h4>
        <p className="mt-1 text-white/65">{c.verifiedScorable} verified rows have valid outcome and timing metadata. {c.verifiedUnscorable} are excluded for missing/invalid values; {c.unknownStatus} have another status.</p>
        <p className="mt-2 text-white/65">Median absolute error: {fmt(m.medianAbsoluteErrorPctPoints,' pp')} · No-change baseline: {fmt(m.medianNoChangeBaselineErrorPctPoints,' pp')} · {m.scoredNonoverlapping} non-overlapping rows.</p>
        <p className="mt-1 text-white/65">Direction right: {m.direction.hits}/{m.direction.n} non-flat cases ({fmt(m.direction.accuracyPct,'%')}).</p>
        <p className="mt-1 text-white/65">Middle 50% interval: {m.middle50.hits}/{m.middle50.n} ({fmt(m.middle50.coveragePct,'%')}) · Wide 80%: {m.wide80.hits}/{m.wide80.n} ({fmt(m.wide80.coveragePct,'%')}).</p>
        <p className="mt-1 text-[10px] text-white/50">Only well-ordered interval pairs contribute. Wilson 95% coverage bounds: {m.middle50.wilson95Pct?m.middle50.wilson95Pct.map(n=>n.toFixed(1)).join('–')+'%':'unavailable'}. This sample is {report.interpretation==='insufficient'?'insufficient':'descriptive only'}, never a forecast-skill certificate.</p>
      </div>
      <div data-testid="evaluation-window-coverage" className="min-w-0 rounded-lg border border-white/10 p-3 text-xs">
        <h4 className="font-semibold">Window and cohort coverage</h4>
        <p className="mt-1 text-white/65">Returned window: {v.returnedRows} rows (requested limit {v.rowLimit}). {v.truncated?'Configured limit reached; older history omitted.':'Historical completeness not independently established.'}</p>
        <p className="mt-2 text-white/65">5D: {report.horizons['5D'].independentScorable} independent, {report.horizons['5D'].pendingDueForReview} due · 20D: {report.horizons['20D'].independentScorable} independent, {report.horizons['20D'].pendingDueForReview} due.</p>
        <p className="mt-1 text-white/65">Other horizons: {report.horizons.other.total} · Pending unknown target: {c.pendingUnknownTarget} · Overlapping excluded: {c.overlappingExcluded}.</p>
        <p className="mt-2 text-amber-100">Declared creation source: {m.declaredCreationSourceCount} scored rows. Independent issuer/publisher authentication was not performed. These figures cannot establish live model accuracy.</p>
      </div>
    </div>
    <details className="mt-3 rounded border border-white/10 p-3 text-xs">
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Exclusion reasons and evaluation limitations</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-white/65">
        {Object.entries(report.exclusions).filter(([,n])=>n>0).map(([reason,n])=><li key={reason}>{reason.replace(/([A-Z])/g,' $1').toLowerCase()}: {n}</li>)}
        {report.limitations.map((text,i)=><li key={i}>{text}</li>)}
      </ul>
      <p className="mt-2 text-white/55">These counts are aggregates. They do not expose forecast rows, private holdings, or provider messages.</p>
    </details>
  </section>;
}
