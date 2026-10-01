import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Clock3, ExternalLink, ShieldAlert } from 'lucide-react';

type EarningsAlert = {
  id: string;
  symbol: string;
  date: string;
  hour?: string | null;
  days_until: number;
  title: string;
  impact_reasons: string[];
  direct_holdings: string[];
  linked_holdings: string[];
  profile?: { name?: string | null; group?: string | null; theme?: string | null };
  consensus?: { eps_estimate?: number | null; revenue_estimate?: number | null };
  source?: string;
};

type HistoricalEarnings = {
  symbol: string;
  period: string;
  reportDate: string;
  hour?: string | null;
  epsActual?: number | null;
  epsEstimate?: number | null;
  surprise?: number | null;
  surprisePercent?: number | null;
  reaction?: {
    anchorDate: string;
    anchorPrice: number;
    eventTradingDate: string;
    eventPrice: number;
    t1: number | null;
    t5: number | null;
    t20: number | null;
  } | null;
};

type EarningsResponse = {
  ok: boolean;
  source?: string;
  as_of?: string;
  lead_days?: number;
  lookahead_days?: number;
  upcoming?: EarningsAlert[];
  historical?: Record<string, HistoricalEarnings[]>;
  notification?: { configured?: boolean; sent?: number; error?: string | null };
  configuration?: {
    finnhub_configured?: boolean;
    webhook_configured?: boolean;
    cron_secret_configured?: boolean;
  };
  error?: string | null;
};

function timingLabel(hour?: string | null): string {
  if (hour === 'bmo') return 'Before open';
  if (hour === 'amc') return 'After close';
  if (hour === 'dmh') return 'Market hours';
  return 'Time not specified';
}

function dayLabel(days: number): string {
  if (days === 0) return 'TODAY';
  if (days === 1) return 'TOMORROW';
  return 'IN ' + days + ' DAYS';
}

function formatRevenue(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (Math.abs(value) >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export default function EarningsAlerts() {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [browserStatus, setBrowserStatus] = useState<'unknown' | 'enabled' | 'blocked'>('unknown');
  const [historical, setHistorical] = useState<Record<string, HistoricalEarnings[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const load = async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch('/api/earnings-alerts?days=14', { cache: 'no-store' });
      const payload = await res.json();
      setData(payload);
      setLoading(false);
      setLastLoadedAt(Date.now());

      const monitored = Array.isArray(payload?.monitored_symbols)
        ? payload.monitored_symbols.filter((symbol: unknown): symbol is string => typeof symbol === 'string')
        : [];
      const symbols = monitored.slice(0, 10);
      if (symbols.length) {
        setHistoryLoading(true);
        try {
          const historyRes = await fetch(
            '/api/earnings-alerts?history=1&symbols=' + encodeURIComponent(symbols.join(',')) + '&limit=4',
            { cache: 'no-store' }
          );
          const historyPayload = await historyRes.json().catch(() => ({}));
          setHistorical(historyPayload?.historical || {});
        } catch {
          setHistorical({});
        } finally {
          setHistoryLoading(false);
        }
      }

      const enabled = localStorage.getItem('aiw_earnings_browser_alerts') === '1';
      if (enabled && 'Notification' in window && Notification.permission === 'granted') {
        setBrowserStatus('enabled');
        const delivered = JSON.parse(localStorage.getItem('aiw_earnings_browser_delivered') || '{}');
        for (const event of payload.upcoming || []) {
          if (event.days_until !== 1 || delivered[event.id]) continue;
          new Notification('AI Infra Watch · ' + event.symbol + ' earnings tomorrow', {
            body: [
              event.date + ' · ' + timingLabel(event.hour),
              'Why it matters: ' + event.impact_reasons.slice(0, 2).join(' · '),
            ].join('\n'),
            tag: event.id,
          });
          delivered[event.id] = Date.now();
        }
        localStorage.setItem('aiw_earnings_browser_delivered', JSON.stringify(delivered));
      }
    } catch (error) {
      console.error('Earnings alert feed failed:', error);
      setLoading(false);
      setData({ ok: false, error: 'Unable to load the earnings alert feed.' });
    } finally {
      if (manual) setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 15 * 60 * 1000);


  return () => clearInterval(timer);
  }, []);

  const enableBrowserAlerts = async () => {
    if (!('Notification' in window)) {
      setBrowserStatus('blocked');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      localStorage.setItem('aiw_earnings_browser_alerts', '1');
      setBrowserStatus('enabled');
      await load();
    } else {
      setBrowserStatus('blocked');
    }
  };

  const events = (data?.upcoming || []).filter(event => event.days_until >= 0);
  const historicalRows: HistoricalEarnings[] = Object.keys(historical)
    .flatMap(symbol => historical[symbol] || [])
    .sort((a, b) => b.reportDate.localeCompare(a.reportDate) || a.symbol.localeCompare(b.symbol));
  const serverReady = Boolean(data?.configuration?.finnhub_configured && data?.configuration?.webhook_configured);

  return (
    <section className="max-w-7xl mx-auto mb-6 rounded-2xl border border-amber-400/20 bg-amber-400/[0.03] p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border border-amber-400/20 bg-amber-400/10 p-2">
              <Bell className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-mono font-black uppercase tracking-widest text-white">
                  Earnings Alert Watch
                </h2>
                <span className="rounded border border-amber-400/20 px-1.5 py-0.5 text-[8px] font-mono uppercase text-amber-300">
                  {(data?.lead_days ?? 1) + (data?.lead_days === 1 ? ' day before' : ' days before')}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                Monitors the configured portfolio + watchlist and surfaces the next 14 days of scheduled earnings,
                with potential impact channels and linked holdings.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[9px] font-mono uppercase">
            {lastLoadedAt && (
              <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-white/35">
                Checked {new Date(lastLoadedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => { void load(true); }}
              disabled={refreshing || loading}
              className="rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/65 hover:text-white hover:bg-white/10 transition disabled:opacity-40"
            >
              {refreshing ? 'Refreshing…' : 'Refresh earnings'}
            </button>
            <span className={serverReady
              ? 'rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300'
              : 'rounded border border-rose-400/20 bg-rose-400/10 px-2 py-1 text-rose-300'
            }>
              Server alert {serverReady ? 'ready' : 'needs Vercel env'}
            </span>

            <button
              onClick={enableBrowserAlerts}
              className="rounded border border-white/10 bg-white/5 px-2.5 py-1.5 text-white/65 hover:text-white hover:bg-white/10 transition"
            >
              {browserStatus === 'enabled' ? 'Browser alerts enabled' : 'Enable browser alerts'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[9px] font-mono text-white/30">
          <span className="text-white/50">Server alert schedule:</span> daily pre-earnings check at 08:30 IST ·
          <span className="text-white/50"> Calendar:</span> Finnhub earnings calendar ·
          <span className="text-white/50"> Dashboard refresh:</span> every 15 minutes ·
          <span className="text-white/50"> Browser alert:</span> only while this dashboard is open
        </div>

        {loading && (
          <div className="text-[10px] font-mono uppercase tracking-wider text-white/30">Loading earnings calendar…</div>
        )}

        {!loading && !data?.ok && (
          <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.04] p-3 text-[10px] leading-relaxed text-rose-200/75">
            {data?.error || 'Earnings calendar unavailable.'}
          </div>
        )}

        {!loading && data?.ok && events.length === 0 && (
          <div className="rounded-xl border border-white/5 bg-black/15 p-4 text-[10px] font-mono text-white/30">
            No monitored earnings announcements are currently scheduled in the next {data.lookahead_days ?? 14} days.
          </div>
        )}

        {!loading && data?.ok && events.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 max-h-[680px] overflow-y-auto pr-1 aiw-scroll-region">
            {events.slice(0, 6).map(event => (
              <article key={event.id} className="rounded-xl border border-white/8 bg-[#0F1115]/55 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-mono font-black text-white">{event.symbol}</span>
                      <span className="rounded border border-white/10 px-1.5 py-0.5 text-[8px] font-mono uppercase text-amber-300">
                        {dayLabel(event.days_until)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-white/40">
                      {event.date} · {timingLabel(event.hour)}
                    </p>
                  </div>
                  <Clock3 className="w-3.5 h-3.5 text-white/25" />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/5 bg-black/20 p-2">
                    <p className="text-[8px] font-mono uppercase text-white/25">EPS estimate</p>
                    <p className="mt-1 text-[11px] font-mono font-bold text-white/70">
                      {typeof event.consensus?.eps_estimate === 'number' ? event.consensus.eps_estimate.toFixed(2) : 'n/a'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/20 p-2">
                    <p className="text-[8px] font-mono uppercase text-white/25">Revenue estimate</p>
                    <p className="mt-1 text-[11px] font-mono font-bold text-white/70">
                      {formatRevenue(event.consensus?.revenue_estimate)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-wider text-white/35">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Potential impact channels
                  </div>
                  <ul className="mt-2 space-y-1">
                    {event.impact_reasons.slice(0, 3).map((reason, index) => (
                      <li key={index} className="text-[10px] leading-relaxed text-white/55">• {reason}</li>
                    ))}
                  </ul>
                </div>

                {(event.direct_holdings.length > 0 || event.linked_holdings.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[8px] font-mono uppercase">
                    {event.direct_holdings.map(symbol => (
                      <span key={'direct-' + symbol} className="rounded border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-1 text-emerald-300">
                        Direct: {symbol}
                      </span>
                    ))}
                    {event.linked_holdings.map(symbol => (
                      <span key={'linked-' + symbol} className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-white/45">
                        Linked: {symbol}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/5 pt-2">
                  <span className="text-[8px] font-mono uppercase text-white/20">
                    {event.profile?.group || 'Tracked symbol'} · {event.profile?.theme || 'Earnings event'}
                  </span>
                  <a
                    href={'https://finnhub.io/'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[8px] font-mono uppercase text-white/35 hover:text-white/65"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}


        {!loading && data?.ok && (
          <div className="rounded-xl border border-white/5 bg-black/15 p-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">Recent earnings reaction history</div>
                <p className="text-[10px] text-white/35 mt-1">
                  Historical report surprise is shown next to the observed stock move after the report. This is descriptive, not a causal signal.
                </p>
              </div>
              {historyLoading && (
                <span className="text-[8px] font-mono uppercase text-white/25">Loading recent history…</span>
              )}
            </div>

            {!historyLoading && !historicalRows.length && (
              <div className="mt-3 text-[10px] font-mono text-white/30">
                No recent reported earnings reactions were returned for the monitored symbols.
              </div>
            )}

            {historicalRows.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-[9px] font-mono">
                  <thead className="text-white/25 uppercase tracking-wider">
                    <tr className="border-b border-white/5">
                      <th className="text-left py-2 pr-3">Report</th>
                      <th className="text-right py-2 px-2">EPS actual</th>
                      <th className="text-right py-2 px-2">EPS est.</th>
                      <th className="text-right py-2 px-2">Surprise</th>
                      <th className="text-right py-2 px-2">Event price</th>
                      <th className="text-right py-2 px-2">Next Trading Day</th>
                      <th className="text-right py-2 px-2">5th Trading Day</th>
                      <th className="text-right py-2 pl-2">20th Trading Day</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicalRows.slice(0, 12).map(row => (
                      <tr key={row.symbol + ':' + row.reportDate + ':' + row.period} className="border-t border-white/5">
                        <td className="py-2 pr-3">
                          <div className="font-black text-white">{row.symbol}</div>
                          <div className="text-white/30 mt-0.5">{row.reportDate} · {row.period}</div>
                        </td>
                        <td className="text-right px-2 text-white/65">{typeof row.epsActual === 'number' ? row.epsActual.toFixed(2) : '—'}</td>
                        <td className="text-right px-2 text-white/40">{typeof row.epsEstimate === 'number' ? row.epsEstimate.toFixed(2) : '—'}</td>
                        <td className={'text-right px-2 font-bold ' + (row.surprisePercent == null ? 'text-white/30' : row.surprisePercent >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {row.surprisePercent == null ? '—' : (row.surprisePercent >= 0 ? '+' : '') + row.surprisePercent.toFixed(1) + '%'}
                        </td>
                        <td className="text-right px-2 text-white/65">{row.reaction ? ('$' + row.reaction.eventPrice.toFixed(2)) : '—'}</td>
                        <td className={'text-right px-2 font-bold ' + (row.reaction?.t1 == null ? 'text-white/30' : row.reaction.t1 >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {row.reaction?.t1 == null ? '—' : (row.reaction.t1 >= 0 ? '+' : '') + row.reaction.t1.toFixed(2) + '%'}
                        </td>
                        <td className="text-right pl-2 text-white/50">
                          {row.reaction?.t5 == null ? '—' : (row.reaction.t5 >= 0 ? '+' : '') + row.reaction.t5.toFixed(1) + '%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!loading && data?.configuration && !serverReady && (
          <div className="flex items-start gap-2 rounded-xl border border-white/5 bg-black/15 p-3 text-[9px] leading-relaxed text-white/35">
            <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 text-amber-300/70 flex-shrink-0" />
            <p>
              To make the alert independent of the open browser, set <span className="text-white/65">FINNHUB_API_KEY</span> and
              <span className="text-white/65"> NOTIFY_WEBHOOK_URL</span> in Vercel, then set matching <span className="text-white/65">CRON_SECRET</span> in Vercel
              and <span className="text-white/65">AIW_CRON_SECRET</span> in GitHub Actions secrets.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
