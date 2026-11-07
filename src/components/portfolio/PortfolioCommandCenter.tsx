import { useId, useState } from 'react';
import { selectConfirmedCatalysts, formatReviewDate, type ConfirmedCatalyst, type ExplanationLevel } from '../../utils/portfolioReview';
import type { DecisionCardModel, PortfolioSummary } from '../../utils/decisionCardAdapter';
import PortfolioReviewQueue from './PortfolioReviewQueue';
import FinancialTerm from '../education/FinancialTerm';
export type { PortfolioSummary } from '../../utils/decisionCardAdapter';
export type CommandCenterProps = { summary: PortfolioSummary; positions: DecisionCardModel[]; loading: boolean; error?: string | null; catalysts?: ConfirmedCatalyst[]; explanationLevel?: ExplanationLevel; onSelectPosition: (symbol: string) => void; onOpenEvidence: (symbol: string) => void };
export default function PortfolioCommandCenter({ summary, positions, loading, error, catalysts = [], explanationLevel = 'simple', onSelectPosition, onOpenEvidence }: CommandCenterProps) {
  const [zone, setZone] = useState(() => {
    try { const saved = localStorage.getItem('aiw-review-timezone'); return ['UTC', 'Asia/Kolkata', 'America/New_York'].includes(saved ?? '') ? saved! : 'local'; }
    catch { return 'local'; }
  });
  const zoneId = useId();
  const timeZone = zone === 'local' ? undefined : zone;
  const confirmed = selectConfirmedCatalysts(catalysts, positions.map(item => item.symbol), Date.now(), timeZone);
  return <section aria-label="Portfolio Command Center" className="min-w-0 space-y-4 rounded-2xl border border-cyan-300/25 p-4 sm:p-6" data-testid="portfolio-command-center">
    <h2 className="text-2xl font-bold">Portfolio Command Center</h2><p className="text-sm text-white/75">Your prioritized review queue · research classifications, not trade orders.</p>
    <label htmlFor={zoneId} className="block text-sm">Review timezone
      <select id={zoneId} value={zone} onChange={event => {
        const value = event.target.value; setZone(value);
        try { localStorage.setItem('aiw-review-timezone', value); } catch { /* Remain usable when storage is unavailable. */ }
      }} className="ml-2 max-w-full rounded border border-white/25 bg-[#15181e] px-3 py-2 focus-visible:outline focus-visible:outline-cyan-300">
        <option value="local">Device local time</option><option value="Asia/Kolkata">India (Asia/Kolkata)</option><option value="America/New_York">US market (America/New_York)</option><option value="UTC">UTC</option>
      </select>
    </label>
    <p className="text-sm text-white/70">Times shown in {timeZone ?? 'device local time'}. Confirmed dates without times retain their source calendar date.</p>
    {loading ? <p role="status">Loading holdings…</p> : error ? <p role="alert" className="text-amber-200">Portfolio unavailable: {error}</p> : !positions.length ? <p>No holdings yet. Add holdings through the existing portfolio manager.</p> : <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 text-sm">
        <div>Portfolio value (USD)<p className="text-xl font-bold">{summary.portfolioValueUsd == null ? 'Unavailable' : '$' + summary.portfolioValueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p><p>Coverage: {summary.valueCoverage}</p></div>
        <div>Tracked holdings<p className="text-xl font-bold">{summary.holdingsCount}</p></div>
        <div>Risk reviews<p className="text-xl font-bold">{summary.reviewCounts.riskReview}</p><p>{summary.reviewCounts.insufficientData} data reviews</p></div>
        <div><FinancialTerm termId="concentration" explanationLevel={explanationLevel} /><p>Top 3: {summary.topConcentrationPct == null ? 'Unavailable' : summary.topConcentrationPct.toFixed(1) + '%'}</p></div>
      </div>
      <p className="text-sm">Opportunity reviews: {summary.reviewCounts.addReview} · Monitoring: {summary.reviewCounts.holdWatch} · Risk reviews: {summary.reviewCounts.riskReview} · Insufficient data: {summary.reviewCounts.insufficientData}</p>
      <p className="text-sm text-amber-200" role="status">{positions.some(p => !p.dataQuality.eligibleForDecision) ? 'Data-quality warning: some assessments are withheld. Expand each card for missing inputs.' : 'All required decision inputs passed the quality gate.'}</p>
      <p className="text-sm">Validated snapshot: {summary.asOf ? formatReviewDate(summary.asOf, undefined, timeZone) : 'Unavailable'}</p>
      <div className="text-sm"><FinancialTerm termId="catalyst" explanationLevel={explanationLevel} /> dates: {confirmed.length ? <ul>{confirmed.map(item => <li key={item.symbol + item.date + item.source}>{item.symbol} · {formatReviewDate(item.date, undefined, timeZone)} · {item.source} · review before the event</li>)}</ul> : 'No confirmed, sourced catalyst supplied to this snapshot. Check the existing events screen; estimated dates are not confirmed catalysts.'}</div>
      <PortfolioReviewQueue timeZone={timeZone} explanationLevel={explanationLevel} positions={positions} onSelectPosition={onSelectPosition} onOpenEvidence={onOpenEvidence} />
    </>}
  </section>;
}
