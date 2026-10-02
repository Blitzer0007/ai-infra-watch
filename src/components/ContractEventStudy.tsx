import { useEffect, useState } from 'react';

type HistoryPoint = { date: string; price: number };
type EventReaction = {
  anchorDate: string;
  anchorPrice: number;
  t1: number | null;
  t5: number | null;
  t20: number | null;
};

const historyPromises: Record<string, Promise<HistoryPoint[]>> = {};

function loadHistory(symbol: string): Promise<HistoryPoint[]> {
  const key = symbol.trim().toUpperCase();
  if (historyPromises[key]) return historyPromises[key];
  historyPromises[key] = fetch('/api/company-scale?action=history&symbol=' + encodeURIComponent(key) + '&range=2y')
    .then(res => {
      if (!res.ok) throw new Error('history unavailable');
      return res.json();
    })
    .then(data => Array.isArray(data.points) ? data.points : [])
    .catch(() => []);
  return historyPromises[key];
}

function calculateReaction(history: HistoryPoint[], eventDate: string): EventReaction | null {
  const anchorCandidates = history.filter(point => point.date < eventDate);
  const targets = history.filter(point => point.date > eventDate);
  if (!anchorCandidates.length) return null;

  const anchor = anchorCandidates[anchorCandidates.length - 1];
  const forward = (horizon: number) => {
    const target = targets[horizon - 1];
    if (!target || !Number.isFinite(anchor.price) || anchor.price === 0) return null;
    return ((target.price - anchor.price) / anchor.price) * 100;
  };

  return {
    anchorDate: anchor.date,
    anchorPrice: anchor.price,
    t1: forward(1),
    t5: forward(5),
    t20: forward(20),
  };
}

function formatReaction(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

interface ContractEventStudyProps {
  symbol: string;
  eventDate: string;
}

export default function ContractEventStudy({ symbol, eventDate }: ContractEventStudyProps) {
  const [reaction, setReaction] = useState<EventReaction | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadHistory(symbol).then(history => {
      if (!cancelled) setReaction(calculateReaction(history, eventDate));
    });
    return () => { cancelled = true; };
  }, [symbol, eventDate]);

  return (
    <div className="bg-cyan-400/5 border border-cyan-400/10 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">SEC filing event study</span>
        <span className="text-[9px] font-mono text-white/30">event date: {eventDate}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
        <div>
          <span className="text-[8px] text-white/35 block uppercase tracking-widest">Prior Trading Day</span>
          <span className="text-white font-bold">{reaction ? '$' + reaction.anchorPrice.toFixed(2) : '—'}</span>
        </div>
        <div>
          <span className="text-[8px] text-white/35 block uppercase tracking-widest">Next Trading Day</span>
          <span className={reaction?.t1 != null && reaction.t1 >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-300 font-bold'}>{formatReaction(reaction?.t1 ?? null)}</span>
        </div>
        <div>
          <span className="text-[8px] text-white/35 block uppercase tracking-widest">5th Trading Day</span>
          <span className={reaction?.t5 != null && reaction.t5 >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-300 font-bold'}>{formatReaction(reaction?.t5 ?? null)}</span>
        </div>
        <div>
          <span className="text-[8px] text-white/35 block uppercase tracking-widest">20th Trading Day</span>
          <span className={reaction?.t20 != null && reaction.t20 >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-300 font-bold'}>{formatReaction(reaction?.t20 ?? null)}</span>
        </div>
      </div>
      <p className="text-[9px] text-white/35 leading-relaxed">
        Uses the prior trading-day close as the baseline, then measures the 1st, 5th, and 20th trading sessions after Event Day. This measures price reaction around the filing date; it does not establish causation.
      </p>
    </div>
  );  
}
