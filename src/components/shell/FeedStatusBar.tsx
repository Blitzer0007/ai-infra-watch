import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';

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
    <div className="aiw-feed-summary">
      {error ? <AlertTriangle aria-hidden="true" size={16}/> : <Activity aria-hidden="true" size={16}/>}
      <span className="font-semibold">Live Market Intelligence</span>
      <span className="aiw-feed-status-label">{status}</span>
    </div>
    <div className="aiw-feed-controls">
      <details className="aiw-feed-details">
        <summary>Source details</summary>
        <div className="aiw-feed-detail-body">
          <p>Data feeds and quote observations are monitored independently; values require source-level checks.</p>
          <p>{lastFeed ? 'Feed response ' + lastFeed : 'No feed response time'}</p>
          <p>Quotes: {quoteCount ? quotesNotFlaggedStale + '/' + quoteCount + ' not marked stale' : 'no admitted observations'}</p>
          {lastQuotes && <p>Last quote check {lastQuotes}</p>}
          {buildCommit && <p>Build {buildCommit.slice(0, 7)}</p>}
          {environment && <p>{environment}</p>}
        </div>
      </details>
      <button type="button" onClick={onRefresh} disabled={loading}
        aria-label={loading ? 'SYNCHRONIZING...' : 'REFRESH FEED'}
        className="aiw-feed-refresh">
        <RefreshCw aria-hidden="true" size={14} className={loading ? 'animate-spin' : ''}/>
        <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
      </button>
    </div>
    {error && <p role="alert" className="aiw-feed-error">Latest refresh failed. Previously shown observations may be stale. Source detail: {error}</p>}
  </aside>;
}
