import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, ShieldAlert } from 'lucide-react';

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

const cache: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!cache[key]) {
    cache[key] = fetch('/api/stock-history?symbol=' + encodeURIComponent(key) + '&range=5y')
      .then(res => {
        if (!res.ok) throw new Error('history unavailable');
        return res.json();
      })
      .then(data => Array.isArray(data.points) ? data.points : [])
      .catch(() => []);
  }
  return cache[key];
}

function loadSecEvents(symbol: string): Promise<SecEvent[]> {
  return fetch('/api/stock-milestones?symbol=' + encodeURIComponent(symbol) + '&limit=20')
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'SEC events unavailable');
      return Array.isArray(data.events) ? data.events : [];
    });
}

function pct(from: number | null, to: number | null): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to! - from!) / from!) * 100;
}

function firstOnOrAfter(history: HistoryPoint[], date: string) {
  return history.find(point => point.date >= date) || null;
}

function calculateReaction(history: HistoryPoint[], spy: HistoryPoint[], eventDate: string): Reaction | null {
  if (!history.length) return null;

  const anchorCandidates = history.filter(point => point.date < eventDate);
  const anchor = anchorCandidates.at(-1);
  if (!anchor) return null;

  const event = firstOnOrAfter(history, eventDate);
  const eventIndex = event ? history.findIndex(point => point.date === event.date) : -1;
  if (eventIndex < 0) return null;

  const forward = (days: number) => history[eventIndex + days] || null;
  const spyAnchorCandidates = spy.filter(point => point.date < eventDate);
  const spyAnchor = spyAnchorCandidates.at(-1);
  const spyEvent = firstOnOrAfter(spy, eventDate);
  const spyIndex = spyEvent ? spy.findIndex(point => point.date === spyEvent.date) : -1;
  const spyForward = (days: number) => spyIndex >= 0 ? (spy[spyIndex + days] || null) : null;

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

function formatPct(value: number | null) {
  return value == null || !Number.isFinite(value) ? '—' : (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

function tone(value: number | null) {
  return value == null ? 'text-white/30' : value >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

function relative(stock: number | null, benchmark: number | null) {
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
      const ticker = symbol?.trim().toUpperCase();
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
        if (!stock.length) setError('No verified market history was returned for this ticker.');
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
    return () => { cancelled = true; };
  }, [symbol]);

  const rows = useMemo(() => events.map(event => ({
    event,
    reaction: calculateReaction(stockHistory, spyHistory, event.date),
  })), [events, stockHistory, spyHistory]);

  const summary = useMemo(() => {
    const valid = rows.map(x => x.reaction).filter((x): x is Reaction => Boolean(x));
    const nextDay = valid.map(x => x.t1).filter((x): x is number => x != null);
    const relNext = valid.map(x => relative(x.t1, x.spyT1)).filter((x): x is number => x != null);
    return {
      events: valid.length,
      avgT1: nextDay.length ? nextDay.reduce((a,b) => a+b, 0) / nextDay.length : null,
      avgRelativeT1: relNext.length ? relNext.reduce((a,b) => a+b, 0) / relNext.length : null,
    };
  }, [rows]);

  return (
    <Panel title={'Historical event impact · ' + symbol} subtitle="SEC filing chronology linked to verified price history; SPY is used as market context, not causal proof.">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        <Metric label="Events matched" value={String(summary.events)} suffix="SEC events" />
        <Metric label="Avg T+1 reaction" value={formatPct(summary.avgT1)} suffix="" tone={tone(summary.avgT1)} />
        <Metric label="Avg T+1 vs SPY" value={formatPct(summary.avgRelativeT1)} suffix="pts" tone={tone(summary.avgRelativeT1)} />
      </div>

      {loading && <div className="text-[10px] font-mono text-white/40 py-6">Loading SEC events + 5-year price history…</div>}
      {!loading && error && <div className="text-[10px] font-mono text-amber-300 py-4">{error}</div>}

      {!loading && !error && !rows.length && (
        <div className="border border-white/5 rounded-xl p-5 text-center text-[10px] text-white/35 font-mono">
          No recent SEC events could be matched to the selected ticker’s price history.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto border border-white/5 rounded-xl">
          <table className="w-full text-[10px] font-mono">
            <thead className="bg-white/[.03] text-white/35 uppercase tracking-wider">
              <tr>
                <th className="text-left p-3">Event</th>
                <th className="text-left p-3">Date</th>
                <th className="text-right p-3">T0</th>
                <th className="text-right p-3">T+1</th>
                <th className="text-right p-3">T+5</th>
                <th className="text-right p-3">T+20</th>
                <th className="text-right p-3">T+1 vs SPY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ event, reaction }) => (
                <tr key={event.id} className="border-t border-white/5 align-top">
                  <td className="p-3 min-w-[240px]">
                    <div className="text-white font-bold">{event.title}</div>
                    <div className="text-white/25 mt-1">{event.description || event.source || 'SEC EDGAR'}</div>
                    {event.url && <a className="text-cyan-300 hover:text-cyan-200 underline mt-1 inline-block" href={event.url} target="_blank" rel="noreferrer">SEC filing</a>}
                  </td>
                  <td className="p-3 whitespace-nowrap text-white/50">{event.date}</td>
                  <td className="p-3 text-right text-white">{reaction ? '$' + reaction.eventPrice.toFixed(2) : '—'}</td>
                  <td className={'p-3 text-right font-bold ' + tone(reaction?.t1 ?? null)}>{formatPct(reaction?.t1 ?? null)}</td>
                  <td className={'p-3 text-right font-bold ' + tone(reaction?.t5 ?? null)}>{formatPct(reaction?.t5 ?? null)}</td>
                  <td className={'p-3 text-right font-bold ' + tone(reaction?.t20 ?? null)}>{formatPct(reaction?.t20 ?? null)}</td>
                  <td className={'p-3 text-right font-bold ' + tone(relative(reaction?.t1 ?? null, reaction?.spyT1 ?? null))}>{formatPct(relative(reaction?.t1 ?? null, reaction?.spyT1 ?? null))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <Callout icon={<Activity/>} title="How to read it" body="2.02 / results-of-operations events can be used to inspect post-report price reactions. The table measures what happened after the filing, not whether the filing caused the move." />
        <Callout icon={<ShieldAlert/>} title="Market context" body="The SPY-relative column helps separate a stock-specific move from a broader market move. It is still descriptive, not a causal attribution." />
      </div>
    </Panel>
  );
}

function Panel({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) {
  return <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5">
    <div className="mb-4">
      <div className="text-sm font-bold">{title}</div>
      <div className="text-[11px] text-white/40 mt-1">{subtitle}</div>
    </div>
    {children}
  </section>;
}

function Metric({label,value,suffix,tone}:{label:string;value:string;suffix:string;tone?:string}) {
  return <div className="bg-white/[.025] border border-white/5 rounded-xl p-3">
    <div className="text-[9px] uppercase font-mono text-white/30">{label}</div>
    <div className={'text-lg font-black mt-2 ' + (tone || 'text-white')}>{value}<span className="text-[10px] text-white/30 ml-1">{suffix}</span></div>
  </div>;
}

function Callout({icon,title,body}:{icon:React.ReactNode;title:string;body:string}) {
  return <div className="border border-white/5 rounded-xl p-3">
    <div className="flex items-center gap-2 text-xs font-bold">{icon}<span>{title}</span></div>
    <div className="text-[10px] text-white/35 mt-2 leading-5">{body}</div>
  </div>;
}
