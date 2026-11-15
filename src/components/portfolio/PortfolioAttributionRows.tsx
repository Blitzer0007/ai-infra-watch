import type { PortfolioAttribution } from '../../utils/measurement';

export default function PortfolioAttributionRows({ rows }: { rows: PortfolioAttribution[] }) {
  const largest = rows.reduce((max, row) => Math.max(max, Math.abs(row.pnlContribution ?? 0)), 0);
  return <section aria-label="Loaded position P&L contributions" data-testid="portfolio-attribution" className="rounded-xl border border-white/10 bg-black/10 p-3">
    <h3 className="text-sm font-semibold">Loaded position P&amp;L contributions</h3>
    <p className="mt-1 text-sm text-white/65">Estimates from available cost records and quotes. Missing positions remain unavailable; contribution percentages need complete coverage.</p>
    <ul className="mt-3 space-y-3">{rows.map(row => <li key={row.symbol} data-testid="attribution-row" className="flex flex-wrap items-center gap-3 text-sm">
      <span className="w-12 font-semibold">{row.symbol}</span>
      <div aria-hidden="true" className="h-2 min-w-12 flex-1 overflow-hidden rounded bg-white/10"><div className={row.pnlContribution == null ? '' : row.pnlContribution >= 0 ? 'h-full bg-emerald-300/70' : 'h-full bg-rose-300/70'} style={{ width: row.pnlContribution == null || largest === 0 ? '0%' : Math.min(100, Math.abs(row.pnlContribution) / largest * 100) + '%' }} /></div>
      <span className={row.pnlContribution == null ? 'text-white/65' : row.pnlContribution >= 0 ? 'text-emerald-200' : 'text-rose-200'}>{row.pnlContribution == null ? 'Unavailable' : (row.pnlContribution >= 0 ? '+' : '−') + '$' + Math.abs(row.pnlContribution).toFixed(2)}</span>
    </li>)}</ul>
    {!rows.length && <p className="mt-2 text-sm text-white/65">No loaded position contribution data.</p>}
  </section>;
}
