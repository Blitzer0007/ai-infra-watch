import FreshnessBadge from '../FreshnessBadge';
import { formatReviewDate, type ExplanationLevel } from '../../utils/portfolioReview';
import { decisionLabels, type DecisionCardModel } from '../../utils/decisionCardAdapter';
import DecisionEvidencePanel from './DecisionEvidencePanel';
export default function PositionDecisionCard({ position, timeZone, explanationLevel = 'simple', onSelectPosition, onOpenEvidence }: { key?: string; timeZone?: string; explanationLevel?: ExplanationLevel; position: DecisionCardModel; onSelectPosition: (s: string) => void; onOpenEvidence: (s: string) => void }) {
  return <article className="min-w-0 rounded-xl border border-white/15 bg-white/[.025] p-4" data-testid="position-decision-card">
    <div className="flex flex-wrap justify-between gap-3"><h3 className="text-lg font-bold">{position.symbol} <span className="text-sm font-normal text-white/70">{position.companyName}</span></h3><span className="text-sm text-cyan-200">{decisionLabels[position.state]}</span></div>
    <p className="mt-2 text-sm">{position.state} · 2–12 month research review</p>
    <p className="mt-2">{position.priceUsd == null ? 'Price: Unavailable' : 'Validated price: $' + position.priceUsd.toFixed(2)} · Return: {position.positionReturnPct == null ? 'Unavailable' : position.positionReturnPct.toFixed(2) + '%'}</p>
    <p className="mt-2 text-sm text-white/80">{position.reasons[0]?.explanation}</p>
    <p className="mt-2 text-sm text-white/65">{position.dataQuality.status} · {position.dataQuality.source ?? 'Source unavailable'} · {position.dataQuality.marketTime ? formatReviewDate(position.dataQuality.marketTime, undefined, timeZone) : 'Market timestamp unavailable'}</p>
    <FreshnessBadge expandable timeZone={timeZone} provider={position.dataQuality.source} marketTime={position.dataQuality.marketTime} retrievedAt={position.dataQuality.retrievedAt}
      labelOverride={position.dataQuality.status === 'valid' ? undefined : position.dataQuality.status === 'delayed' ? 'Delayed' : position.dataQuality.status === 'last_close' ? 'Last close' : 'Unknown'} />
    <details className="mt-3"><summary className="cursor-pointer text-cyan-200 focus-visible:outline">Why this position needs review</summary><DecisionEvidencePanel timeZone={timeZone} explanationLevel={explanationLevel} position={position} /></details>
    <div className="mt-4 flex flex-wrap gap-3 text-sm"><button type="button" onClick={() => onSelectPosition(position.symbol)} className="rounded border border-white/25 px-3 py-2 focus-visible:outline">Position details</button><button type="button" onClick={() => onOpenEvidence(position.symbol)} className="rounded border border-white/25 px-3 py-2 focus-visible:outline">Evidence and research</button><a href="/outlook" className="rounded border border-white/25 px-3 py-2 focus-visible:outline">Forecast evidence</a><a href="/overview" className="rounded border border-white/25 px-3 py-2 focus-visible:outline">Decision journal</a></div>
  </article>;
}
