import type { PortfolioConcentration } from '../../utils/measurement';
import type { PositionAnalysis } from '../../utils/portfolioPositions';

export default function PortfolioValuationCoverage({ coverage, positions, holdingsStatus = 'ready' }: { coverage: PortfolioConcentration; positions: PositionAnalysis[]; holdingsStatus?: 'loading' | 'unavailable' | 'ready' }) {
  return <section aria-label="Current valuation coverage" data-testid="portfolio-valuation-coverage" className="space-y-2 rounded-xl border border-white/20 p-4 text-sm text-white/80">
    <h3 className="font-semibold text-white">Current valuation coverage</h3>
    <p role="status">{holdingsStatus === 'loading' ? 'Loading holdings; valuation coverage is not established.' : holdingsStatus === 'unavailable' ? 'Holdings are unavailable; portfolio scope cannot be verified.' : `${coverage.observedCount}/${coverage.expectedCount} holding values supported · ${coverage.coverage}.`}</p>
    <p>{coverage.coverage === 'complete' ? 'These estimates cover the holdings loaded here. Complete account and trade-history verification is separate.' : 'Current total, weights and concentration are withheld until every loaded holding has a compatible value.'} Invested cost is shown separately and never substitutes for a current price.</p>
    <details><summary className="min-h-11 cursor-pointer py-2">Holding valuation limits</summary>
      <ul className="list-disc space-y-2 pl-5">{positions.map(row => <li key={row.symbol}><strong>{row.symbol}:</strong> {row.valuationIssues.length ? row.valuationIssues.join(' ') : 'Quote and quantity checks passed; complete cost and transaction-history verification is separate.'}</li>)}</ul>
      {!positions.length && <p>No holdings loaded; portfolio valuation is unavailable.</p>}
    </details>
  </section>;
}
