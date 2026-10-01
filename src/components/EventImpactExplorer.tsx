import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import JevDecisionPanel from './JevDecisionPanel';

type HistoryPoint = { date: string; price: number };

type SecEvent = {
  id: string;
  stockSymbol: string;
  date: string;
  title: string;
  description?: string;
  accession?: string;
  url?: string;
  source?: string;
  category?: string;
  items?: string[];
};

type Reaction = {
  anchorDate: string;
  anchorPrice: number;
  eventDate: string;
  eventPrice: number | null;
  t1: number | null;
  t5: number | null;
  t20: number | null;
  spyT1: number | null;
  spyT5: number | null;
  spyT20: number | null;
};

const historyCache: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!historyCache[key]) {
    historyCache[key] = fetch(
      '/api/stock-history?symbol=' + encodeURIComponent(key) + '&range=5y'
    )
      .then(async (res) => {
        if (!res.ok) throw new Error('History request failed: HTTP ' + res.status);
        const data = await res.json();
        return Array.isArray(data?.points) ? data.points : [];
      })
      .catch(() => []);
  }
  return historyCache[key];
}

async function loadSecEvents(symbol: string): Promise<SecEvent[]> {
  const res = await fetch(
    '/api/stock-milestones?symbol=' + encodeURIComponent(symbol) + '&limit=20'
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'SEC event lookup failed');
  return Array.isArray(data?.events) ? data.events : [];
}

function pct(from: number | null, to: number | null): number | null {
  if (from == null || to == null || !Number.isFinite(from) || !Number.isFinite(to) || from === 0) {
    return null;
  }
  return ((to - from) / from) * 100;
}

function firstOnOrAfter(history: HistoryPoint[], date: string): HistoryPoint | null {
  return history.find((point) => point.date >= date) || null;
}

function calculateReaction(
  history: HistoryPoint[],
  spy: HistoryPoint[],
  eventDate: string
): Reaction | null {
  if (!history.length) return null;

  const anchor = history.filter((point) => point.date < eventDate).at(-1);
  const event = firstOnOrAfter(history, eventDate);
  if (!anchor || !event) return null;

  const eventIndex = history.findIndex((point) => point.date === event.date);
  if (eventIndex < 0) return null;

  const forward = (days: number) => history[eventIndex + days] || null;

  const spyEvent = firstOnOrAfter(spy, eventDate);
  const spyIndex = spyEvent
    ? spy.findIndex((point) => point.date === spyEvent.date)
    : -1;
  const spyForward = (days: number) =>
    spyIndex >= 0 ? spy[spyIndex + days] || null : null;

  return {
    anchorDate: anchor.date,
    anchorPrice: anchor.price,
    eventDate: event.date,
    eventPrice: event.price,
    t1: pct(event.price, forward(1)?.price ?? null),
    t5: pct(event.price, forward(5)?.price ?? null),
    t20: pct(event.price, forward(20)?.price ?? null),
    spyT1: spyEvent ? pct(spyEvent.price, spyForward(1)?.price ?? null) : null,
    spyT5: spyEvent ? pct(spyEvent.price, spyForward(5)?.price ?? null) : null,
    spyT20: spyEvent ? pct(spyEvent.price, spyForward(20)?.price ?? null) : null,
  };
}

function formatPct(value: number | null): string {
  return value == null || !Number.isFinite(value)
    ? '—'
    : (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

function tone(value: number | null): string {
  return value == null
    ? 'text-white/30'
    : value >= 0
      ? 'text-emerald-400'
      : 'text-rose-400';
}

function relative(stock: number | null, benchmark: number | null): number | null {
  return stock == null || benchmark == null ? null : stock - benchmark;
}

export default function EventImpactExplorer({ symbol }: { symbol: string }) {
  const [events, setEvents] = useState<SecEvent[]>([]);
  const [stockHistory, setStockHistory] = useState<HistoryPoint[]>([]);
  const [spyHistory, setSpyHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const ticker = symbol.trim().toUpperCase();
      if (!ticker) return;

      setLoading(true);
      setError(null);

      try {
        const [sec, stock, spy] = await Promise.all([
          loadSecEvents(ticker),
          loadHistory(ticker),
          loadHistory('SPY'),
        ]);

        if (cancelled) return;

        setEvents(sec);
        setStockHistory(stock);
        setSpyHistory(spy);

        if (!stock.length) {
          setError('No verified market history was returned for this ticker.');
        }
      } catch (err) {
        if (!cancelled) {
          setEvents([]);
          setStockHistory([]);
          setSpyHistory([]);
          setError(err instanceof Error ? err.message : 'Event study unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const rows = useMemo(
    () =>
      events.map((event) => ({
        event,
        reaction: calculateReaction(stockHistory, spyHistory, event.date),
      })),
    [events, stockHistory, spyHistory]
  );

  const categories = useMemo(() => {
    const grouped = new Map<string, { count: number; t1: number[]; relativeT1: number[] }>();

    for (const row of rows) {
      if (!row.reaction) continue;
      const category = row.event.category || 'Other';
      const bucket = grouped.get(category) || { count: 0, t1: [], relativeT1: [] };
      bucket.count += 1;
      if (row.reaction.t1 != null) bucket.t1.push(row.reaction.t1);
      const rel = relative(row.reaction.t1, row.reaction.spyT1);
      if (rel != null) bucket.relativeT1.push(rel);
      grouped.set(category, bucket);
    }

    return Array.from(grouped.entries())
      .map(([category, bucket]) => ({
        category,
        count: bucket.count,
        avgT1: bucket.t1.length ? bucket.t1.reduce((a, b) => a + b, 0) / bucket.t1.length : null,
        avgRelativeT1: bucket.relativeT1.length
          ? bucket.relativeT1.reduce((a, b) => a + b, 0) / bucket.relativeT1.length
          : null,
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const summary = useMemo(() => {
    const valid = rows
      .map((row) => row.reaction)
      .filter((value): value is Reaction => Boolean(value));

    const t1Values = valid
      .map((row) => row.t1)
      .filter((value): value is number => value != null);

    const relativeT1Values = valid
      .map((row) => relative(row.t1, row.spyT1))
      .filter((value): value is number => value != null);

    return {
      events: valid.length,
      avgT1: t1Values.length
        ? t1Values.reduce((sum, value) => sum + value, 0) / t1Values.length
        : null,
      avgRelativeT1: relativeT1Values.length
        ? relativeT1Values.reduce((sum, value) => sum + value, 0) / relativeT1Values.length
        : null,
    };
  }, [rows]);

  return (
    <Panel
      title={'Historical event impact · ' + symbol}
      subtitle="SEC filing chronology linked to verified price history; SPY is used as market context, not causal proof."
    >
      <JevDecisionPanel
        kind="events"
        title={'Event-study evidence review · ' + symbol}
        state={{
          symbol,
          events_returned: events.length,
          reactions_matched: summary.events,
          average_next_trading_day_reaction_pct: summary.avgT1,
          average_next_trading_day_vs_spy_pct_points: summary.avgRelativeT1,
          categories: categories.slice(0, 8),
          recent_events: events.slice(0, 8).map((event) => ({
            date: event.date,
            title: event.title,
            category: event.category,
            source: event.source,
            accession: event.accession,
          })),
        }}
      />

      <div className="mb-4 rounded-xl border border-white/5 bg-white/[.02] p-3">
        <div className="text-[9px] uppercase tracking-widest font-mono text-white/30 mb-2">Historical reaction by event type</div>
        <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-5 gap-2">
          {categories.map((item) => (
            <div key={item.category} className="rounded-lg border border-white/5 bg-black/10 p-3">
              <div className="text-[9px] uppercase font-mono font-bold text-white/55 leading-4">{item.category}</div>
              <div className={'text-base font-black mt-2 ' + tone(item.avgT1)}>{formatPct(item.avgT1)}</div>
              <div className="text-[9px] text-white/25 font-mono mt-1">avg next trading day · {item.count} event{item.count === 1 ? '' : 's'}</div>
              <div className={'text-[9px] font-mono mt-2 ' + tone(item.avgRelativeT1)}>vs market {formatPct(item.avgRelativeT1)}</div>
            </div>
          ))}
          {!categories.length && (
            <div className="text-[10px] text-white/30 font-mono">No classified event reactions yet.</div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <Metric label="Events matched" value={String(summary.events)} suffix="SEC events" />
        <Metric
          label="Avg Next Trading Day Reaction"
          value={formatPct(summary.avgT1)}
          suffix=""
          valueClass={tone(summary.avgT1)}
        />
        <Metric
          label="Avg Next Trading Day vs Market"
          value={formatPct(summary.avgRelativeT1)}
          suffix="pts vs SPY"
          valueClass={tone(summary.avgRelativeT1)}
        />
      </div>

      {loading && (
        <div className="text-[10px] font-mono text-white/40 py-6">
          Loading SEC events + 5-year price history…
        </div>
      )}

      {!loading && error && (
        <div className="text-[10px] font-mono text-amber-300 py-4">{error}</div>
      )}

      {!loading && !error && !rows.length && (
        <div className="border border-white/5 rounded-xl p-5 text-center text-[10px] text-white/35 font-mono">
          No recent SEC events could be matched to the selected ticker’s price history.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto max-h-[560px] overflow-y-auto border border-white/5 rounded-xl aiw-scroll-region">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-white/[.03] text-white/35 uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">Event</th>
                <th className="text-left p-3">Date</th>
                <th className="text-right p-3">Event Day</th>
                <th className="text-right p-3">Next Trading Day</th>
                <th className="text-right p-3">5th Trading Day</th>
                <th className="text-right p-3">20th Trading Day</th>
                <th className="text-right p-3">Next Trading Day vs Market</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, reaction }) => {
                const t1Relative = reaction
                  ? relative(reaction.t1, reaction.spyT1)
                  : null;

                return (
                  <tr key={event.id} className="border-t border-white/5 align-top">
                    <td className="p-3 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-white font-bold">{event.title}</div>
                        <span className="px-2 py-0.5 rounded border border-white/10 bg-white/[.03] text-[8px] uppercase tracking-wider text-white/45">
                          {event.category || 'Other'}
                        </span>
                      </div>
                      <div className="text-white/25 mt-1">
                        {event.description || event.source || 'SEC EDGAR'}
                      </div>
                      {event.url && (
                        <a
                          className="text-cyan-300 hover:text-cyan-200 underline mt-1 inline-block"
                          href={event.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          SEC filing
                        </a>
                      )}
                    </td>
                    <td className="p-3 whitespace-nowrap text-white/50">{event.date}</td>
                    <td className="p-3 text-right text-white">
                      {reaction?.eventPrice != null
                        ? '$' + reaction.eventPrice.toFixed(2)
                        : '—'}
                    </td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t1 ?? null)}>
                      {formatPct(reaction?.t1 ?? null)}
                    </td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t5 ?? null)}>
                      {formatPct(reaction?.t5 ?? null)}
                    </td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t20 ?? null)}>
                      {formatPct(reaction?.t20 ?? null)}
                    </td>
                    <td className={'p-3 text-right font-bold ' + tone(t1Relative)}>
                      {formatPct(t1Relative)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 text-[9px] text-white/30 font-mono">
        Event Day = the first trading day on or after the filing date · Next Trading Day = the first market session after Event Day · 5th/20th Trading Day = forward market sessions.
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <Callout
          icon={<Activity />}
          title="How to read it"
          body="2.02 / results-of-operations events can be used to inspect post-report price reactions. The table measures what happened after the filing, not whether the filing caused the move."
        />
        <Callout
          icon={<ShieldAlert />}
          title="Market context"
          body="The SPY-relative comparison helps separate a stock-specific move from a broader market move. It is still descriptive, not a causal attribution."
        />
      </div>
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5">
      <div className="mb-4">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-[11px] text-white/40 mt-1">{subtitle}</div>
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  suffix,
  valueClass,
}: {
  label: string;
  value: string;
  suffix: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white/[.025] border border-white/5 rounded-xl p-3">
      <div className="text-[9px] uppercase font-mono text-white/30">{label}</div>
      <div className={'text-lg font-black mt-2 ' + (valueClass || 'text-white')}>
        {value}
        <span className="text-[10px] text-white/30 ml-1">{suffix}</span>
      </div>
    </div>
  );
}

function Callout({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="border border-white/5 rounded-xl p-3">
      <div className="flex items-center gap-2 text-xs font-bold">
        {icon}
        <span>{title}</span>
      </div>
      <div className="text-[10px] text-white/35 mt-2 leading-5">{body}</div>
    </div>
  );
}
