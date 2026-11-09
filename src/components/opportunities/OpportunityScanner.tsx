import { useRef, useState } from 'react';
import { STOCK_UNIVERSE } from '../../utils/stockUniverse';
import { captureResearchSnapshot, type ResearchSnapshot } from '../../utils/researchSnapshot';
import { scanResearchSnapshot, type ResearchCandidate, type ResearchStatus } from '../../utils/opportunityResearch';
import OpportunityCard, { researchLabels } from './OpportunityCard';
import { formatReviewDate } from '../../utils/portfolioReview';
import OpportunityJevReview from './OpportunityJevReview';
import SourceQualityReview from './SourceQualityReview';
import { captureSourceQualitySnapshot, type SourceQualitySnapshot } from '../../utils/sourceQualityReview';

type Props = { holdings:readonly string[]; watchlist:readonly string[]; quotes:Record<string,Record<string,unknown>|undefined>; loading?:boolean; holdingsAvailable?:boolean };
export default function OpportunityScanner({ holdings, watchlist, quotes, loading = false, holdingsAvailable = true }:Props) {
  const [scan, setScan] = useState<{snapshot:ResearchSnapshot; candidates:ResearchCandidate[]; source:SourceQualitySnapshot|null}|null>(null);
  const sequence=useRef(0);
  const [error,setError] = useState('');
  const [query,setQuery] = useState('');
  const [status,setStatus] = useState<ResearchStatus|'all'>('all');
  const [limit,setLimit] = useState(20);
  const run = () => {
    try {
      const now = Date.now();
      // Names are descriptive metadata; do not infer an asset class or listing from a ticker.
      const companies = Object.fromEntries(STOCK_UNIVERSE.map(item => [item.symbol,{name:item.name,assetClass:'unknown' as const}]));
      const snapshot = captureResearchSnapshot({id:'loaded-snapshot:'+now,nowMs:now,holdings,watchlist,quotes,companies,holdingsAvailable});
      const source=(import.meta.env.DEV||import.meta.env.VITE_QA_MODE==='true')?captureSourceQualitySnapshot(snapshot.entries.map(row=>row.symbol),quotes,`source-snapshot:${now}:${++sequence.current}`,now):null;
      setScan({snapshot,candidates:scanResearchSnapshot(snapshot,now),source}); setError(''); setLimit(20);
    } catch { setError('Snapshot could not be evaluated. Existing results have not been replaced; reload reliable inputs before retrying.'); }
  };
  const visible = (scan?.candidates ?? []).filter(item => (status === 'all' || item.status === status) && (item.symbol+' '+item.companyName).toLowerCase().includes(query.trim().toLowerCase()));
  return <section aria-label="Opportunity research scanner" data-testid="opportunity-scanner" className="min-w-0 space-y-4">
    <h1 className="text-3xl font-bold">Opportunity research</h1>
    <p className="text-base text-white/80">Review your holdings and watchlist using a frozen copy of already-loaded data.</p>
    <p className="rounded-xl border border-amber-300/30 p-4 text-sm text-amber-100">Experimental research only. Uses data already loaded in this dashboard. Scanning does not refresh prices, send alerts, or change holding decisions. Company fundamentals and listing details may be unavailable; missing data stays marked as missing.</p>
    <button type="button" onClick={run} disabled={loading} className="rounded-lg bg-cyan-200 px-4 py-3 font-bold text-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">{loading ? 'Waiting for loaded snapshot…' : 'Scan loaded snapshot'}</button>
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    {!scan ? <p role="status">No scan has run. Choose Scan loaded snapshot to inspect available coverage.</p> : <>
      <p className="break-words text-sm">Captured {formatReviewDate(scan.snapshot.capturedAt)} · {scan.snapshot.universe.holdingsCoverage === 'unavailable' ? 'Holdings unavailable' : scan.snapshot.universe.holdings+' holdings'} · {scan.snapshot.universe.watchlistOnly} watchlist-only symbols</p>
      {scan.snapshot.universe.holdingsCoverage === 'unavailable' && <p role="status" className="text-amber-200">Holdings could not be loaded. This is watchlist coverage only, not a complete portfolio scan.</p>}
      <p className="text-sm text-white/70">Frozen evaluation, not a live forecast. Run again after inputs refresh. The universe is your current list, not the whole market or a historical sample.</p>
      {scan.source&&<SourceQualityReview snapshot={scan.source} />}
      <OpportunityJevReview candidates={scan.candidates} />
      {(scan.snapshot.universe.omittedHoldings+scan.snapshot.universe.omittedWatchlist+scan.snapshot.universe.invalidSymbols)>0 && <p role="status" className="text-amber-200">Coverage limited: {scan.snapshot.universe.omittedHoldings} holdings, {scan.snapshot.universe.omittedWatchlist} watchlist symbols and {scan.snapshot.universe.invalidSymbols} invalid symbols omitted by input limits.</p>}
      {!scan.candidates.length ? <p role="status">No holdings or watchlist symbols are available in this snapshot.</p> : <>
        <p className="text-sm">Research input coverage: {scan.candidates.filter(item => item.dataEligibility === 'eligible').length}/{scan.candidates.length} eligible · 0 validated signal families</p>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <label>Search research candidates<input type="search" value={query} onChange={event => {setQuery(event.target.value);setLimit(20);}} className="mt-1 block w-full min-w-0 rounded border border-white/25 bg-[#15181e] px-3 py-2 focus-visible:outline" /></label>
          <label>Research status<select value={status} onChange={event => {setStatus(event.target.value as ResearchStatus|'all');setLimit(20);}} className="mt-1 block w-full min-w-0 rounded border border-white/25 bg-[#15181e] px-3 py-2 focus-visible:outline"><option value="all">All research statuses</option>{Object.entries(researchLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <p role="status" className="text-sm">Showing {Math.min(limit,visible.length)} of {visible.length} matching symbols · holdings first, then symbol; no return ranking</p>
        {!visible.length && <p>No research candidates match these filters.</p>}
        {visible.slice(0,limit).map(candidate => <OpportunityCard key={candidate.symbol} candidate={candidate} />)}
        {visible.length>limit && <button type="button" className="rounded border border-white/25 px-4 py-2 focus-visible:outline" onClick={() => setLimit(value => value+20)}>Show 20 more</button>}
      </>}
    </>}
  </section>;
}
