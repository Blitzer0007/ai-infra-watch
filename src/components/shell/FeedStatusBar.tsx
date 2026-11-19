import { Activity, AlertTriangle, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';

type Props = {
  loading: boolean;
  error: string | null;
  observedAt: number | null;
  buildCommit?: string | null;
  environment?: string | null;
  quoteCount: number;
  quotesNotFlaggedStale: number;
  lastQuoteRefresh: number | null;
  onRefresh: () => void;
};

function observedTime(value: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  const time = new Date(value);
  return Number.isFinite(time.getTime()) ? time.toLocaleTimeString() : null;
}

export default function FeedStatusBar({
  loading, error, observedAt, buildCommit, environment, quoteCount,
  quotesNotFlaggedStale, lastQuoteRefresh, onRefresh,
}: Props) {
  const lastFeed = observedTime(observedAt);
  const lastQuotes = observedTime(lastQuoteRefresh);
  const status = error ? 'Feed request needs review' :
    loading ? 'Checking configured sources' :
      lastFeed ? 'Last feed response recorded' : 'Feed response not confirmed';
  return <aside aria-label="Market feed and evidence status"
    className="aiw-feed-toolbar" data-testid="app-feed-status">
    <div className="flex min-w-0 flex-1 items-start gap-3">
      <div className={'aiw-feed-indicator mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' +
        (error ? 'text-amber-300' : 'text-cyan-200')}>
        {error ? <AlertTriangle aria-hidden="true" size={18}/> :
          loading ? <RefreshCw aria-hidden="true" size={18} className="animate-spin"/> :
            <Activity aria-hidden="true" size={18}/>}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">Live Market Intelligence</span>
          <span className={'aiw-feed-status-label rounded-full border px-2 py-0.5 text-[11px] font-medium ' +
            (error ? 'border-amber-300/30 text-amber-200' :
              lastFeed ? 'border-cyan-300/25 text-cyan-200' : 'border-white/15 text-slate-300')}>
            {status}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-300">
          {error ? 'Latest data refresh did not complete. Previously shown observations may be stale.' :
            'Data feeds and quote observations are monitored independently; values require source-level checks.'}
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-amber-200">Source detail: {error}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1"><Clock3 aria-hidden="true" size={13}/>
            {lastFeed ? 'Feed response ' + lastFeed : 'No feed response time'}
          </span>
          <span>
            Quotes: {quoteCount ? quotesNotFlaggedStale + '/' + quoteCount +
              ' not marked stale' : 'no admitted observations'}
          </span>
          {lastQuotes && <span>Last quote check {lastQuotes}</span>}
          {buildCommit && <span>Build {buildCommit.slice(0, 7)}</span>}
          {environment && <span>{environment}</span>}
        </div>
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2 self-start">
      <span className="hidden items-center gap-1 text-[11px] text-slate-400 lg:inline-flex">
        <ShieldCheck aria-hidden="true" size={14}/> Eligibility checked per source
      </span>
      <button type="button" onClick={onRefresh} disabled={loading}
        aria-label={loading ? 'SYNCHRONIZING...' : 'REFRESH FEED'}
        className="aiw-feed-refresh inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-wait disabled:opacity-50">
        <RefreshCw aria-hidden="true" size={15} className={loading ? 'animate-spin' : ''}/>
        <span>{loading ? 'Refreshing…' : 'Refresh feed'}</span>
      </button>
    </div>
  </aside>;
}
