import { formatReviewDate } from '../../utils/portfolioReview';
import type { ResearchCandidate } from '../../utils/opportunityResearch';

export const researchLabels = { 'research-candidate':'Experimental research candidate', monitor:'Monitor reported evidence', 'needs-data':'Needs reliable data', excluded:'Outside issuer research scope' };
export default function OpportunityCard({ candidate }: { key?:string; candidate:ResearchCandidate }) {
  return <article className="min-w-0 rounded-xl border border-white/20 bg-white/[.025] p-4" data-testid="opportunity-card">
    <h2 className="text-xl font-bold">{candidate.symbol} <span className="text-sm font-normal text-white/70">{candidate.companyName}</span></h2>
    <p className="mt-2 text-sm text-cyan-200">{researchLabels[candidate.status]} · {candidate.portfolioContext}</p>
    <p className="mt-2 text-sm">Data: {candidate.dataEligibility} · Signal family: experimental · 2–12 month research context</p>
    <p className="mt-2 text-sm text-white/75">{candidate.accounting === 'not-applicable' ? 'No position: accounting is not applicable to watchlist research.' : 'Portfolio accounting unverified in this view; returns, sizing and exposure conclusions are withheld.'}</p>
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer rounded text-cyan-200 focus-visible:outline">Evidence and missing inputs for {candidate.symbol}</summary>
      <div className="mt-3 space-y-3 break-words text-white/80">
        {[...candidate.supportingReasons,...candidate.conflictingReasons].map(reason => <div key={reason.code}><h3 className="font-bold">{reason.title}</h3><p>{reason.explanation}</p><p>Evidence: {reason.evidenceIds.join(', ')}</p></div>)}
        {candidate.missingInputs.length > 0 && <div><h3 className="font-bold">Missing or unsuitable inputs</h3><ul className="list-disc pl-5">{candidate.missingInputs.map((text,index) => <li key={index}>{text}</li>)}</ul></div>}
        <h3 className="font-bold">Source references</h3>
        {candidate.evidence.length ? <ul className="list-disc pl-5">{candidate.evidence.map(item => <li key={item.id}>{item.label} · {item.source} · {item.publishedAt ? 'Published '+formatReviewDate(item.publishedAt) : item.observedAt ? formatReviewDate(item.observedAt) : 'Timestamp unavailable'}{item.url && <> · <a href={item.url} target="_blank" rel="noopener noreferrer" className="underline">Source document</a></>}</li>)}</ul> : <p>No source references supplied.</p>}
        <p>Next review: {candidate.nextReviewCondition}</p><p>Rule contract: {candidate.ruleVersion}</p>
        <p>No validated return advantage, trade instruction, or portfolio-state change is implied.</p>
      </div>
    </details>
    <div className="mt-4 flex flex-wrap gap-3 text-sm"><a className="rounded border border-white/25 px-3 py-2 focus-visible:outline" href={'/portfolio?portfolio_tab=research&portfolio_symbol='+encodeURIComponent(candidate.symbol)}>Existing portfolio research</a><a className="rounded border border-white/25 px-3 py-2 focus-visible:outline" href="/guide">Financial glossary</a></div>
  </article>;
}
