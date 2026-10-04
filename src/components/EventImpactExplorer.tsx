import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import JevDecisionPanel from './JevDecisionPanel';
import { FilterBar, FilterSelect } from './FilterControls';
import DataTable, { type DataTableColumn } from './DataTable';
import { summarizeSample } from '../utils/measurement';

type HistoryPoint = { date: string; price: number };

type SecEvent = {
  id: string;
  stockSymbol: string;
  date: string;
  acceptedDateTime?: string | null;
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
  acceptedDateTime: string | null;
  eventPrice: number | null;
  t1: number | null;
  t5: number | null;
  t20: number | null;
  spyT1: number | null;
  spyT5: number | null;
  spyT20: number | null;
  soxxT5: number | null;
  beta60: number | null;
  abnormalT5: number | null;
};

const historyCache: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!historyCache[key]) {
    historyCache[key] = fetch(
      '/api/company-scale?action=history&symbol=' + encodeURIComponent(key) + '&range=5y'
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
    '/api/company-scale?action=milestones&symbol=' + encodeURIComponent(symbol) + '&limit=20'
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
  soxx: HistoryPoint[],
  eventDate: string,
  acceptedDateTime?: string | null
): Reaction | null {
  if (!history.length) return null;

  const referenceDate = acceptedDateTime ? acceptedDateTime.slice(0, 10) : eventDate;
  const anchor = history.filter((point) => point.date < referenceDate).at(-1);
  const event = firstOnOrAfter(history, referenceDate);
  if (!anchor || !event) return null;

  const eventIndex = history.findIndex((point) => point.date === event.date);
  if (eventIndex < 0) return null;

  const forward = (days: number) => history[eventIndex + days] || null;

  const spyEvent = firstOnOrAfter(spy, referenceDate);
  const spyIndex = spyEvent
    ? spy.findIndex((point) => point.date === spyEvent.date)
    : -1;
  const spyForward = (days: number) =>
    spyIndex >= 0 ? spy[spyIndex + days] || null : null;

  return {
    anchorDate: anchor.date,
    anchorPrice: anchor.price,
    eventDate: event.date,
    acceptedDateTime: acceptedDateTime || null,
    eventPrice: event.price,
    t1: pct(event.price, forward(1)?.price ?? null),
    t5: pct(event.price, forward(5)?.price ?? null),
    t20: pct(event.price, forward(20)?.price ?? null),
    spyT1: spyEvent ? pct(spyEvent.price, spyForward(1)?.price ?? null) : null,
    spyT5: spyEvent ? pct(spyEvent.price, spyForward(5)?.price ?? null) : null,
    spyT20: spyEvent ? pct(spyEvent.price, spyForward(20)?.price ?? null) : null,
    soxxT5: (() => { const e = firstOnOrAfter(soxx, referenceDate); const i = e ? soxx.findIndex(p => p.date === e.date) : -1; return i >= 0 ? pct(soxx[i]?.price ?? null, soxx[i + 5]?.price ?? null) : null; })(),
    beta60: betaBeforeEvent(history, soxx, event.date),
    abnormalT5: null,
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

function betaBeforeEvent(stock: HistoryPoint[], benchmark: HistoryPoint[], eventDate: string, lookback = 60): number | null {
  const stockByDate = new Map(stock.map(point => [point.date, point.price]));
  const benchByDate = new Map(benchmark.map(point => [point.date, point.price]));
  const dates = [...new Set(benchmark.map(point => point.date))]
    .filter(date => date < eventDate && stockByDate.has(date) && benchByDate.has(date))
    .sort()
    .slice(-(lookback + 1));
  if (dates.length < 12) return null;
  const stockReturns = [], benchReturns = [];
  for (let i = 1; i < dates.length; i++) {
    const sp = Number(stockByDate.get(dates[i - 1]));
    const sn = Number(stockByDate.get(dates[i]));
    const bp = Number(benchByDate.get(dates[i - 1]));
    const bn = Number(benchByDate.get(dates[i]));
    if (!(sp > 0 && sn > 0 && bp > 0 && bn > 0)) continue;
    stockReturns.push(sn / sp - 1); benchReturns.push(bn / bp - 1);
  }
  if (stockReturns.length < 10) return null;
  const meanS = stockReturns.reduce((a,b)=>a+b,0) / stockReturns.length;
  const meanB = benchReturns.reduce((a,b)=>a+b,0) / benchReturns.length;
  const variance = benchReturns.reduce((sum,v)=>sum + (v-meanB) ** 2, 0);
  if (variance <= 0) return null;
  const covariance = stockReturns.reduce((sum,v,i)=>sum + (v-meanS) * (benchReturns[i]-meanB), 0);
  const beta = covariance / variance;
  return Number.isFinite(beta) ? beta : null;
}


export default function EventImpactExplorer({ symbol }: { symbol: string }) {
  const [events, setEvents] = useState<SecEvent[]>([]);
  const [stockHistory, setStockHistory] = useState<HistoryPoint[]>([]);
  const [spyHistory, setSpyHistory] = useState<HistoryPoint[]>([]);
  const [soxxHistory, setSoxxHistory] = useState<HistoryPoint[]>([]);
  const [categoryFilter, setCategoryFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('event_symbol') === symbol ? (params.get('event_category') || 'all') : 'all';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storedSymbol = params.get('event_symbol');
    if (storedSymbol !== symbol.trim().toUpperCase()) {
      setCategoryFilter('all');
    }
  }, [symbol]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const normalizedSymbol = symbol.trim().toUpperCase();
    params.set('event_symbol', normalizedSymbol);
    if (categoryFilter === 'all') {
      params.delete('event_category');
    } else {
      params.set('event_category', categoryFilter);
    }
    const query = params.toString();
    const url = window.location.pathname + (query ? '?' + query : '') + window.location.hash;
    window.history.replaceState(window.history.state, '', url);
  }, [symbol, categoryFilter]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const ticker = symbol.trim().toUpperCase();
      if (!ticker) return;

      setLoading(true);
      setError(null);

      try {
        const [sec, stock, spy, soxx] = await Promise.all([
          loadSecEvents(ticker),
          loadHistory(ticker),
          loadHistory('SPY'),
          loadHistory('SOXX'),
        ]);

        if (cancelled) return;

        setEvents(sec);
        setStockHistory(stock);
        setSpyHistory(spy);
        setSoxxHistory(soxx);

        if (!stock.length) {
          setError('No verified market history was returned for this ticker.');
        }
      } catch (err) {
        if (!cancelled) {
          setEvents([]);
          setStockHistory([]);
          setSpyHistory([]);
          setSoxxHistory([]);
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
        reaction: (() => { const value = calculateReaction(stockHistory, spyHistory, soxxHistory, event.date, event.acceptedDateTime); if (!value) return null; return { ...value, abnormalT5: value.t5 != null && value.soxxT5 != null && value.beta60 != null ? value.t5 - value.beta60 * value.soxxT5 : null }; })(),
      })),
    [events, stockHistory, spyHistory, soxxHistory]
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
        ...(() => {
          const t1 = summarizeSample(bucket.t1);
          const relativeT1 = summarizeSample(bucket.relativeT1);
          return {
            n: t1.n,
            avgT1: t1.mean,
            medianT1: t1.median,
            avgRelativeT1: relativeT1.mean,
            medianRelativeT1: relativeT1.median,
            quality: t1.quality,
          };
        })(),
      }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const visibleRows = useMemo(
    () => categoryFilter === 'all'
      ? rows
      : rows.filter((row) => (row.event.category || 'Other') === categoryFilter),
    [rows, categoryFilter]
  );

  const summary = useMemo(() => {
    const valid = rows.map((row) => row.reaction).filter((value): value is Reaction => Boolean(value));
    const values = (key: 't1' | 'relativeT1' | 'abnormalT5' | 'beta60') => valid.map(row => {
      if (key === 'relativeT1') return relative(row.t1, row.spyT1);
      return row[key];
    }).filter((value): value is number => value != null && Number.isFinite(value));
    const t1 = summarizeSample(values('t1'));
    const relativeT1 = summarizeSample(values('relativeT1'));
    const abnormal = summarizeSample(values('abnormalT5'));
    const betaValues = values('beta60');
    return {
      events: valid.length,
      avgT1: t1.mean,
      medianT1: t1.median,
      n: t1.n,
      quality: t1.quality,
      avgRelativeT1: relativeT1.mean,
      medianRelativeT1: relativeT1.median,
      relativeN: relativeT1.n,
      avgAbnormalT5: abnormal.mean,
      medianAbnormalT5: abnormal.median,
      abnormalN: abnormal.n,
      avgBeta60: betaValues.length ? betaValues.reduce((a,b)=>a+b,0) / betaValues.length : null,
    };
  }, [rows]);

  return (
    <Panel
      title={'Historical event impact · ' + symbol}
      subtitle="SEC filing chronology linked to verified price history; SPY is used as market context, not causal proof."
    >
      <div className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-400/[.04] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-mono uppercase tracking-[.2em] text-cyan-300">SELECTED TICKER</div>
            <div className="text-2xl font-black mt-1">{symbol.trim().toUpperCase()}</div>
            <div className="text-[10px] text-white/45 mt-1">Every metric and event below is calculated for this ticker only. SPY is the comparison market.</div>
          </div>
          <div className="text-right text-[9px] font-mono text-white/30">
            <div>EVENTS {events.length}</div>
            <div className="mt-1">MATCHED REACTIONS {summary.events}</div>
             {summary.events < 30 ? <div className="mt-1 text-[9px] font-mono text-amber-300">LOW CONFIDENCE · n&lt;30</div> : <div className="mt-1 text-[9px] font-mono text-emerald-300">SAMPLE SIZE ≥30</div>}
          </div>
        </div>
      </div>
      <JevDecisionPanel
        kind="events"
        title={'Event-study evidence review · ' + symbol}
        state={{
          symbol,
          events_returned: events.length,
          reactions_matched: summary.events,
          average_next_trading_day_reaction_pct: summary.avgT1,
          median_next_trading_day_reaction_pct: summary.medianT1,
          next_trading_day_sample_size: summary.n,
          next_trading_day_data_quality: summary.quality,
          average_next_trading_day_vs_spy_pct_points: summary.avgRelativeT1,
          median_next_trading_day_vs_spy_pct_points: summary.medianRelativeT1,
          vs_spy_sample_size: summary.relativeN,
          average_5d_beta_adjusted_vs_soxx_pct_points: summary.avgAbnormalT5,
          median_5d_beta_adjusted_vs_soxx_pct_points: summary.medianAbnormalT5,
          beta_sample_size: summary.abnormalN,
          average_pre_event_beta_60d: summary.avgBeta60,
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
              <div className="text-[9px] text-white/25 font-mono mt-1">mean {item.count} event{item.count === 1 ? '' : 's'} · n={item.n} · {item.quality} sample</div>
              <div className="text-[9px] text-white/35 font-mono mt-1">median {formatPct(item.medianT1)}</div>
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
          label={symbol.toUpperCase() + " · Mean Next Trading Day Reaction"}
          value={formatPct(summary.avgT1)}
          suffix={`n=${summary.n} · ${summary.quality} · median ${formatPct(summary.medianT1)}`}
          valueClass={tone(summary.avgT1)}
        />
        <Metric
          label={symbol.toUpperCase() + " · Mean Next Trading Day vs Market"}
          value={formatPct(summary.avgRelativeT1)}
          suffix={`pts vs SPY · n=${summary.relativeN} · median ${formatPct(summary.medianRelativeT1)}`}
          valueClass={tone(summary.avgRelativeT1)}
        />
        <Metric
          label={symbol.toUpperCase() + ' · 5D Beta-Adjusted vs SOXX'}
          value={formatPct(summary.avgAbnormalT5)}
          suffix={'pts · n=' + summary.abnormalN + ' · beta ' + (summary.avgBeta60 == null ? '—' : summary.avgBeta60.toFixed(2))}
          valueClass={tone(summary.avgAbnormalT5)}
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
        <>
          <div className="mb-3">
            <FilterBar resultCount={visibleRows.length} totalCount={rows.length} onClear={() => setCategoryFilter('all')}>
            <FilterSelect
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Filter event study table by event category"
              className="font-mono text-[10px] uppercase tracking-wider text-white/60"
            >
              <option value="all">All Event Types</option>
              {Array.from(new Set(rows.map((row) => row.event.category || 'Other'))).sort().map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </FilterSelect>
            </FilterBar>
          </div>

          <div className="max-h-[560px] overflow-y-auto aiw-scroll-region">
            <DataTable
              rows={visibleRows}
              rowKey={({ event }) => event.id}
              initialSort={{ key: 'date', direction: 'desc' }}
              columns={[
                {
                  key: 'event',
                  header: 'Event',
                  accessor: row => row.event.title,
                  render: ({ event }) => (
                    <div className="min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-white font-bold">{event.title}</div>
                        <span className="px-2 py-0.5 rounded border border-white/10 bg-white/[.03] text-[8px] uppercase tracking-wider text-white/45">{event.category || 'Other'}</span>
                      </div>
                      <div className="text-white/25 mt-1">{event.description || event.source || 'SEC EDGAR'}</div>
                      {event.url && <a className="text-cyan-300 hover:text-cyan-200 underline mt-1 inline-block" href={event.url} target="_blank" rel="noreferrer">SEC filing</a>}
                    </div>
                  )
                },
                { key: 'date', header: 'Date', accessor: row => row.event.date, type: 'date', className: 'whitespace-nowrap' },
                { key: 'eventPrice', header: 'Event Day', accessor: row => row.reaction?.eventPrice ?? null, type: 'currency', align: 'right', render: row => row.reaction?.eventPrice != null ? '$' + row.reaction.eventPrice.toFixed(2) : '—' },
                { key: 't1', header: 'Next Trading Day', accessor: row => row.reaction?.t1 ?? null, type: 'percent', align: 'right', render: row => <span className={'font-bold ' + tone(row.reaction?.t1 ?? null)}>{formatPct(row.reaction?.t1 ?? null)}</span> },
                { key: 't5', header: '5th Trading Day', accessor: row => row.reaction?.t5 ?? null, type: 'percent', align: 'right', render: row => <span className={'font-bold ' + tone(row.reaction?.t5 ?? null)}>{formatPct(row.reaction?.t5 ?? null)}</span> },
                { key: 't20', header: '20th Trading Day', accessor: row => row.reaction?.t20 ?? null, type: 'percent', align: 'right', render: row => <span className={'font-bold ' + tone(row.reaction?.t20 ?? null)}>{formatPct(row.reaction?.t20 ?? null)}</span> },
                { key: 'relative', header: 'Next Day vs SPY', accessor: row => row.reaction ? relative(row.reaction.t1, row.reaction.spyT1) : null, type: 'percent', align: 'right', render: row => { const value = row.reaction ? relative(row.reaction.t1, row.reaction.spyT1) : null; return <span className={'font-bold ' + tone(value)}>{formatPct(value)}</span>; } },
                { key: 'abnormal', header: '5D Beta-Adj vs SOXX', accessor: row => row.reaction?.abnormalT5 ?? null, type: 'percent', align: 'right', render: row => <span className={'font-bold ' + tone(row.reaction?.abnormalT5 ?? null)}>{formatPct(row.reaction?.abnormalT5 ?? null)}</span> }
              ] satisfies DataTableColumn<(typeof visibleRows)[number]>[]}
            />
          </div>
        </>
      )}

      <div className="mt-3 text-[9px] text-white/30 font-mono">
        Event Day = the first trading day on or after the SEC accepted timestamp’s calendar date. The accepted timestamp is the event-time source; filing date is retained for disclosure chronology. Next/5th/20th Trading Day = forward market sessions.
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
