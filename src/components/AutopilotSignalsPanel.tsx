import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Radio, ShieldCheck } from 'lucide-react';
import { authFetch } from '../utils/apiAuth';

type Signal = {
  title?: string;
  snippet?: string;
  url?: string;
  publishedAt?: string | null;
  official?: boolean;
  sourceType?: string;
  tickers?: string[];
};

type ApiResponse = {
  ok?: boolean;
  account?: { name?: string; username?: string; xUrl?: string; platformUrl?: string };
  provider?: string;
  degraded?: boolean;
  signals?: Signal[];
  tickers?: string[];
  portfolioLinks?: string[];
  officialCoverage?: number;
  fetchedAt?: string;
  providerNotes?: string[];
  error?: string;
};

function formatDate(value?: string | null) {
  if (!value) return 'date unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function AutopilotSignalsPanel() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await authFetch('/api/autopilot-signals?limit=8', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || 'Autopilot signal request failed');
      setData(body);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : 'Autopilot signal retrieval failed.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <section className="rounded-2xl border border-violet-400/15 bg-violet-400/[.025] p-4" data-testid="autopilot-signals">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-violet-300" />
            <div className="text-[9px] font-mono uppercase tracking-[.2em] text-violet-300">AUTOPILOT / X SIGNALS</div>
          </div>
          <h2 className="text-base font-black mt-1">Autopilot platform activity</h2>
          <p className="text-[10px] text-white/35 mt-1 max-w-3xl">
            Public signals from <span className="text-white/60">@{data?.account?.username || 'joinautopilot'}</span> and linked Autopilot portfolio pages.
            These are platform/social evidence, not verified holdings or trade instructions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={data?.account?.xUrl || 'https://x.com/joinautopilot'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-2 text-[9px] font-mono text-white/50 hover:text-white">
            View X <ExternalLink className="w-3 h-3" />
          </a>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh Autopilot signals" className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-2 text-[9px] font-mono text-white/50 hover:text-white disabled:opacity-40">
            <RefreshCw className={'w-3 h-3 ' + (loading ? 'animate-spin' : '')} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-400/[.03] p-3 text-[9px] font-mono text-amber-200/70">{error}</div>}

      {!error && data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            <Metric label="Source" value={data.provider || '—'} />
            <Metric label="Official X posts" value={String(data.officialCoverage ?? 0)} />
            <Metric label="Tickers detected" value={String((data.tickers || []).length)} />
            <Metric label="Portfolio links" value={String((data.portfolioLinks || []).length)} />
          </div>

          {(data.tickers || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(data.tickers || []).slice(0, 16).map(ticker => (
                <span key={ticker} className="rounded-full border border-cyan-400/15 bg-cyan-400/[.04] px-2 py-1 text-[8px] font-mono text-cyan-200">{ticker}</span>
              ))}
            </div>
          )}

          <div className="mt-3 space-y-2">
            {(data.signals || []).map((signal, index) => (
              <a key={signal.url || index} href={signal.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/5 bg-black/10 p-3 hover:border-violet-300/20 hover:bg-violet-300/[.03]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {signal.official && <ShieldCheck className="w-3.5 h-3.5 text-violet-300 shrink-0" />}
                    <span className="text-[10px] font-bold text-white/80 truncate">{signal.title || signal.url}</span>
                  </div>
                  <span className="text-[8px] font-mono text-white/25">{formatDate(signal.publishedAt)}</span>
                </div>
                {signal.snippet && <div className="text-[9px] leading-4 text-white/40 mt-1 line-clamp-2">{signal.snippet}</div>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(signal.tickers || []).map(ticker => <span key={ticker} className="rounded border border-white/10 px-1.5 py-0.5 text-[7px] font-mono text-white/35">{'$' + ticker}</span>)}
                  {signal.sourceType && <span className="rounded border border-white/10 px-1.5 py-0.5 text-[7px] font-mono uppercase text-white/25">{signal.sourceType}</span>}
                </div>
              </a>
            ))}
            {!data.signals?.length && <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-[9px] font-mono text-white/30">No recent Autopilot X signals were returned.</div>}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[8px] font-mono text-white/25">
            <span>{data.degraded ? 'Degraded discovery fallback' : 'Live web discovery'}</span>
            <span>{data.fetchedAt ? 'Fetched ' + formatDate(data.fetchedAt) : 'Fetch time unavailable'}</span>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/5 bg-black/10 p-2">
    <div className="text-[8px] font-mono uppercase text-white/25">{label}</div>
    <div className="text-[10px] font-mono font-bold mt-1 text-white/70">{value}</div>
  </div>;
}
