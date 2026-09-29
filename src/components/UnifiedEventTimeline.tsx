import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowUpRight, FileText, Globe2, Landmark, Newspaper, ShieldAlert } from 'lucide-react';

type HistoryPoint = { date: string; price: number };

type TimelineEvent = {
  id: string;
  kind: 'SEC' | 'Contract' | 'Congress' | 'Macro' | 'News';
  date: string;
  title: string;
  detail: string;
  source: string;
  sourceLevel: 'PRIMARY' | 'PUBLIC DISCLOSURE' | 'RISK LEDGER' | 'NEWS';
  url?: string | null;
};

type Reaction = {
  eventPrice: number | null;
  t1: number | null;
  t5: number | null;
  t20: number | null;
  spyT1: number | null;
  relativeT1: number | null;
};

const historyCache: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (!historyCache[key]) {
    historyCache[key] = fetch('/api/stock-history?symbol=' + encodeURIComponent(key) + '&range=5y', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('History request failed');
        const payload = await response.json();
        return Array.isArray(payload?.points) ? payload.points : [];
      })
      .catch(() => []);
  }
  return historyCache[key];
}

async function loadSecEvents(symbol: string): Promise<TimelineEvent[]> {
  try {
    const response = await fetch('/api/stock-milestones?symbol=' + encodeURIComponent(symbol) + '&limit=20', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return [];
    return (payload?.events || []).map((event: any) => ({
      id: String(event.id),
      kind: 'SEC' as const,
      date: String(event.date),
      title: String(event.title || 'SEC event'),
      detail: String(event.description || 'SEC 8-K disclosure'),
      source: 'SEC EDGAR',
      sourceLevel: 'PRIMARY' as const,
      url: event.url || null,
    }));
  } catch {
    return [];
  }
}

function clean(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function newsSymbols(title: string): string[] {
  const text = clean(title);
  const aliases: Record<string, string[]> = {
    NVDA: ['nvidia', 'nvda', 'blackwell', 'cuda'],
    DGXX: ['digi power', 'dgxx'],
    DRAM: ['micron', ' dram ', 'memory'],
    SOXL: ['soxl', 'semiconductor'],
    MSFT: ['microsoft', 'msft', 'azure'],
    NBIS: ['nebius', 'nbis'],
    VIVO: ['vivo power', 'vvpr', 'powerhouse'],
    META: ['meta', 'facebook'],
    NOW: ['servicenow', 'service now'],
    PHVS: ['pharvaris', 'phvs'],
  };
  return Object.entries(aliases)
    .filter(([, terms]) => terms.some(term => text.includes(term)))
    .map(([symbol]) => symbol);
}

function macroHolds(symbol: string, macroId: string): boolean {
  const id = clean(macroId);
  const holdings: Record<string, string[]> = {
    taiwan: ['DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS'],
    export: ['DRAM', 'SOXL', 'NVDA', 'MSFT', 'NBIS'],
    power: ['DGXX', 'NBIS', 'VIVO', 'META', 'NOW'],
  };
  const key = id.includes('taiwan') ? 'taiwan' : id.includes('power') || id.includes('grid') ? 'power' : 'export';
  return holdings[key].includes(symbol);
}

function sourceLevel(kind: TimelineEvent['kind']): TimelineEvent['sourceLevel'] {
  if (kind === 'SEC' || kind === 'Contract') return 'PRIMARY';
  if (kind === 'Congress') return 'PUBLIC DISCLOSURE';
  if (kind === 'Macro') return 'RISK LEDGER';
  return 'NEWS';
}

function eventReaction(history: HistoryPoint[], spy: HistoryPoint[], eventDate: string): Reaction | null {
  const event = history.find(point => point.date >= eventDate);
  if (!event) return null;
  const eventIndex = history.findIndex(point => point.date === event.date);
  if (eventIndex < 0) return null;

  const forward = (days: number) => history[eventIndex + days] || null;
  const spyEvent = spy.find(point => point.date === event.date) || spy.find(point => point.date >= event.date) || null;
  const spyIndex = spyEvent ? spy.findIndex(point => point.date === spyEvent.date) : -1;
  const spyForward = (days: number) => spyIndex >= 0 ? spy[spyIndex + days] || null : null;

  const pct = (from: number | null, to: number | null) =>
    from == null || to == null || from === 0 ? null : ((to - from) / from) * 100;

  const t1 = pct(event.price, forward(1)?.price ?? null);
  const spyT1 = spyEvent ? pct(spyEvent.price, spyForward(1)?.price ?? null) : null;

  return {
    eventPrice: event.price,
    t1,
    t5: pct(event.price, forward(5)?.price ?? null),
    t20: pct(event.price, forward(20)?.price ?? null),
    spyT1,
    relativeT1: t1 != null && spyT1 != null ? t1 - spyT1 : null,
  };
}

function fmt(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

function tone(value: number | null): string {
  return value == null ? 'text-white/30' : value >= 0 ? 'text-emerald-400' : 'text-rose-400';
}

function evidenceBadge(level: TimelineEvent['sourceLevel']): string {
  if (level === 'PRIMARY') return 'border-cyan-400/20 bg-cyan-400/5 text-cyan-300';
  if (level === 'PUBLIC DISCLOSURE') return 'border-amber-400/20 bg-amber-400/5 text-amber-300';
  if (level === 'RISK LEDGER') return 'border-rose-400/20 bg-rose-400/5 text-rose-300';
  return 'border-emerald-400/20 bg-emerald-400/5 text-emerald-300';
}

function iconFor(kind: TimelineEvent['kind']) {
  if (kind === 'SEC') return <FileText className="w-3.5 h-3.5" />;
  if (kind === 'Contract') return <FileText className="w-3.5 h-3.5" />;
  if (kind === 'Congress') return <Landmark className="w-3.5 h-3.5" />;
  if (kind === 'Macro') return <Globe2 className="w-3.5 h-3.5" />;
  return <Newspaper className="w-3.5 h-3.5" />;
}

export default function UnifiedEventTimeline({
  symbol,
  contracts = [],
  congressTrades = [],
  macroRisks = [],
  news = [],
}: {
  symbol: string;
  contracts?: any[];
  congressTrades?: any[];
  macroRisks?: any[];
  news?: any[];
}) {
  const [secEvents, setSecEvents] = useState<TimelineEvent[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [spy, setSpy] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ticker = symbol.trim().toUpperCase();
    if (!ticker) return;

    setLoading(true);
    Promise.all([loadSecEvents(ticker), loadHistory(ticker), loadHistory('SPY')])
      .then(([sec, stock, benchmark]) => {
        if (cancelled) return;
        setSecEvents(sec);
        setHistory(stock);
        setSpy(benchmark);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [symbol]);

  const events = useMemo(() => {
    const ticker = symbol.trim().toUpperCase();

    const contractEvents: TimelineEvent[] = (contracts || [])
      .filter(item => String(item?.company || '').toUpperCase() === ticker)
      .map(item => ({
        id: 'contract-' + String(item?.id || item?.dateSigned || item?.client || item?.details),
        kind: 'Contract',
        date: String(item?.dateSigned || item?.date || ''),
        title: String(item?.client || 'Contract disclosure'),
        detail: String(item?.geminiImpactSummary || item?.details || 'Contract disclosure linked to the portfolio issuer.'),
        source: item?.source === 'sec-edgar-primary' ? 'SEC EDGAR' : 'Contracts feed',
        sourceLevel: sourceLevel('Contract'),
        url: item?.url || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const congressEvents: TimelineEvent[] = (congressTrades || [])
      .filter(item => String(item?.stockSymbol || '').toUpperCase() === ticker)
      .map(item => ({
        id: 'congress-' + String(item?.id || item?.transactionDate || item?.date),
        kind: 'Congress',
        date: String(item?.transactionDate || item?.date || ''),
        title: ticker + ' transaction disclosure',
        detail: String(item?.politician || 'Public filer') + ' · ' + String(item?.chamber || 'Chamber') + ' · ' + String(item?.transactionType || 'transaction') + ' · ' + String(item?.amountRange || 'amount not disclosed'),
        source: 'Congress disclosure feed',
        sourceLevel: sourceLevel('Congress'),
        url: item?.filingPortal || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const macroEvents: TimelineEvent[] = (macroRisks || [])
      .filter(item => macroHolds(ticker, String(item?.id || item?.title || '')))
      .map(item => ({
        id: 'macro-' + String(item?.id || item?.dateUpdated || item?.title),
        kind: 'Macro',
        date: String(item?.dateUpdated || ''),
        title: String(item?.title || 'Macro risk indicator'),
        detail: String(item?.geminiImpactSummary || item?.description || 'Macro risk indicator affecting the tracked exposure group.'),
        source: 'Live macro risk ledger',
        sourceLevel: sourceLevel('Macro'),
        url: null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    const newsEvents: TimelineEvent[] = (news || [])
      .filter(item => item?.title && newsSymbols(String(item.title)).includes(ticker))
      .map(item => ({
        id: 'news-' + String(item?.id || item?.date || item?.title),
        kind: 'News',
        date: String(item?.date || ''),
        title: String(item?.title),
        detail: 'Reported by ' + String(item?.source || 'news feed') + '; review the linked report for context.',
        source: String(item?.source || 'News feed'),
        sourceLevel: sourceLevel('News'),
        url: item?.url || null,
      }))
      .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));

    return [...secEvents, ...contractEvents, ...congressEvents, ...macroEvents, ...newsEvents]
      .filter(event => event.date <= new Date().toISOString().slice(0, 10))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 16);
  }, [symbol, secEvents, contracts, congressTrades, macroRisks, news]);

  const rows = useMemo(() => events.map(event => ({
    event,
    reaction: eventReaction(history, spy, event.date),
  })), [events, history, spy]);

  const matched = rows.filter(row => row.reaction);
  const avgT1 = matched.length
    ? matched.map(row => row.reaction!.t1).filter((x): x is number => x != null).reduce((sum, x, _, arr) => sum + x / arr.length, 0)
    : null;
  const avgRel = matched.length
    ? matched.map(row => row.reaction!.relativeT1).filter((x): x is number => x != null).reduce((sum, x, _, arr) => sum + x / arr.length, 0)
    : null;

  return (
    <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-300">
            <Activity className="w-4 h-4" />
            <span className="text-[9px] font-mono uppercase tracking-[0.2em]">Unified event reaction timeline</span>
          </div>
          <h2 className="text-lg font-black mt-1">What happened → Evidence → What followed</h2>
          <p className="text-[10px] text-white/35 mt-1 max-w-3xl">
            Aligns SEC events, contracts, public transaction disclosures, macro indicators and matched news with T+1 / T+5 / T+20 market reactions. These are descriptive post-event windows, not causal attribution.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 min-w-[230px]">
          <Metric label="Events" value={String(events.length)} />
          <Metric label="Reactions matched" value={String(matched.length)} />
        </div>
      </div>

      {loading && (
        <div className="text-[10px] font-mono text-white/35 py-4">Loading event history + market benchmark…</div>
      )}

      {!loading && !events.length && (
        <div className="rounded-xl border border-white/5 bg-white/[.02] p-4 text-[10px] font-mono text-white/30">
          No historical events from the current live feeds could be aligned to {symbol}.
        </div>
      )}

      {!loading && events.length > 0 && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            <Metric label="Avg T+1" value={fmt(avgT1)} valueClass={tone(avgT1)} />
            <Metric label="Avg T+1 vs SPY" value={fmt(avgRel)} valueClass={tone(avgRel)} />
            <Metric label="T+5 tracked" value={String(rows.filter(row => row.reaction?.t5 != null).length)} />
            <Metric label="T+20 tracked" value={String(rows.filter(row => row.reaction?.t20 != null).length)} />
          </div>

          <div className="overflow-x-auto border border-white/5 rounded-xl">
            <table className="w-full min-w-[980px] text-[10px] font-mono">
              <thead className="bg-white/[.03] text-white/35 uppercase tracking-wider">
                <tr>
                  <th className="text-left p-3">Event / Evidence</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-right p-3">Event price</th>
                  <th className="text-right p-3">T+1</th>
                  <th className="text-right p-3">T+5</th>
                  <th className="text-right p-3">T+20</th>
                  <th className="text-right p-3">T+1 vs SPY</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ event, reaction }) => (
                  <tr key={event.id} className="border-t border-white/5 align-top">
                    <td className="p-3 min-w-[330px]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-white/[.03] px-2 py-1 text-[8px] font-mono font-black uppercase text-white/55">
                          {iconFor(event.kind)}
                          {event.kind}
                        </span>
                        <span className={'rounded border px-1.5 py-0.5 text-[8px] font-mono uppercase ' + evidenceBadge(event.sourceLevel)}>
                          {event.sourceLevel}
                        </span>
                      </div>
                      <div className="text-white font-bold mt-2">{event.title}</div>
                      <div className="text-white/30 mt-1 leading-4">{event.detail}</div>
                      <div className="flex items-center gap-2 mt-1.5 text-[8px] font-mono text-white/20">
                        <span>{event.source}</span>
                        {event.url && (
                          <a href={event.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
                            Source <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap text-white/50">{event.date}</td>
                    <td className="p-3 text-right text-white">
                      {reaction?.eventPrice == null ? '—' : '$' + reaction.eventPrice.toFixed(2)}
                    </td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t1 ?? null)}>{fmt(reaction?.t1 ?? null)}</td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t5 ?? null)}>{fmt(reaction?.t5 ?? null)}</td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.t20 ?? null)}>{fmt(reaction?.t20 ?? null)}</td>
                    <td className={'p-3 text-right font-bold ' + tone(reaction?.relativeT1 ?? null)}>{fmt(reaction?.relativeT1 ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[9px] text-white/30 leading-4">
            <ShieldAlert className="w-3.5 h-3.5 text-white/20 mt-0.5 shrink-0" />
            <span>For macro entries, the date is the live indicator's review/update date. Public transaction dates describe the disclosed transaction, not the filing date. Post-event returns show what followed in the market; they do not establish that the event caused the move.</span>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[.025] p-3">
      <div className="text-[8px] font-mono uppercase tracking-widest text-white/25">{label}</div>
      <div className={'text-lg font-black mt-1 ' + (valueClass || 'text-white')}>{value}</div>
    </div>
  );
}
