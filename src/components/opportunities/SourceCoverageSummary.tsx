import {useState} from 'react';
import type {SourceQualitySnapshot} from '../../utils/sourceQualityReview';

/** Read-only metadata review of the frozen, already-loaded quote snapshot. No provider or model calls. */
export default function SourceCoverageSummary({snapshot}:{snapshot:SourceQualitySnapshot}) {
  const [selected,setSelected]=useState('');
  const scope=snapshot.entries.slice(0,30);
  const entry=scope.find(row=>row.symbol===selected)??scope[0];
  return <details className="rounded-xl border border-amber-300/25 p-4" data-testid="source-coverage-summary">
    <summary className="cursor-pointer font-semibold text-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Source coverage · read-only inspection</summary>
    <div className="mt-3 space-y-3 text-sm text-white/80">
      <p>Frozen at {snapshot.capturedAt}. Declared providers and timestamps are metadata, not authenticated publisher records. This local inspection makes no additional request and cannot grant a trade decision.</p>
      <p>Review scope: {scope.length}/{snapshot.entries.length} symbols (display capped at 30). Re-scan to refresh inputs.</p>
      {entry?<><label className="block">Review symbol
        <select aria-label="Source coverage company" value={entry.symbol} onChange={e=>setSelected(e.target.value)} className="mt-1 block min-h-11 w-full rounded border border-white/30 bg-slate-950 px-3">
          {scope.map(x=><option key={x.symbol} value={x.symbol}>{x.symbol}</option>)}
        </select>
      </label>
      {entry.issue?<p role="alert" className="text-amber-200">{entry.issue}</p>:entry.observations.length===0?<p role="status">No loaded observations. Source coverage is unavailable, not verified zero activity.</p>:
        <ul className="space-y-2">{entry.observations.map(row=><li key={row.evidence_id} className="rounded-lg border border-white/15 p-3">
          <p>Declared provider: {row.provider} · {row.source_mode} · {row.returned_symbol===entry.symbol?'returned symbol matches declaration':'returned symbol not independently matched'}</p>
          <p>Observation instant: {row.market_time??(row.market_date?'date-only '+row.market_date:'unknown')} · Retrieved: {row.retrieved_at??'unknown'}</p>
          <p>Price: {row.price!=null&&row.price>0?'present':'missing or invalid'} · Daily change: {row.change_pct==null?'missing':'present'} · Currency: {row.currency??'unknown'} · Basis: {row.adjusted_basis}</p>
          <p className="text-amber-100">{row.stale?'Source marks this record stale. ':'Source freshness is not independently verified. '}{row.source_mode!=='live'?'Non-live/unknown mode: cannot admit for investment decisions.':''}</p>
        </li>)}</ul>}
      </>:<p>No eligible symbols in this snapshot.</p>}
      <p className="text-xs">A quote label, matching symbol, or displayed timestamp does not verify issuer identity, licensing, independent sources, or historical market availability. Full deterministic backend assessment requires a separately authorized development-only gateway.</p>
    </div>
  </details>;
}
