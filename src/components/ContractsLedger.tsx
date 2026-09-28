import { useEffect, useMemo, useState } from 'react';
import { Search, Info, ShieldCheck, DollarSign, Sparkles } from 'lucide-react';
import { STOCK_METADATA } from '../data';
import { Contract } from '../types';

type HistoryPoint = { date: string; price: number };
type EventReaction = { anchorDate: string; anchorPrice: number; t1?: number; t5?: number; t20?: number };

function eventReaction(history: HistoryPoint[], eventDate: string): EventReaction | null {
  const anchors = history.filter(p => p.date < eventDate);
  const targets = history.filter(p => p.date > eventDate);
  if (!anchors.length) return null;
  const anchor = anchors[anchors.length - 1];
  const result: EventReaction = { anchorDate: anchor.date, anchorPrice: anchor.price };
  ([1, 5, 20] as const).forEach(horizon => {
    const target = targets[horizon - 1];
    if (!target || !Number.isFinite(anchor.price) || anchor.price === 0) return;
    const key = horizon === 1 ? 't1' : horizon === 5 ? 't5' : 't20';
    result[key] = ((target.price - anchor.price) / anchor.price) * 100;
  });
  return result;
}

function fmtReaction(value?: number) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

interface ContractsLedgerProps {
  liveContracts?: Contract[];
}

export default function ContractsLedger({ liveContracts }: ContractsLedgerProps) {
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterStatusLevel, setFilterStatusLevel] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [priceHistory, setPriceHistory] = useState<Record<string, HistoryPoint[]>>({});

  const activeContracts = liveContracts || [];
  const contractCompanies = useMemo(
    () => [...new Set(activeContracts.map(c => c.company).filter(Boolean))],
    [activeContracts]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadHistories() {
      const results: Record<string, HistoryPoint[]> = {};
      await Promise.all(contractCompanies.map(async (symbol) => {
        try {
          const res = await fetch('/api/stock-history?symbol=' + encodeURIComponent(symbol) + '&range=2y');
          if (!res.ok) return;
          const data = await res.json();
          if (Array.isArray(data.points)) results[symbol] = data.points;
        } catch {
          // One unavailable history feed must not block other contract records.
        }
      }));
      if (!cancelled) setPriceHistory(results);
    }

    if (contractCompanies.length) loadHistories();
    else setPriceHistory({});
    return () => { cancelled = true; };
  }, [contractCompanies]);

  const parseValueB = (value: string): number => {
    const match = value.match(/\$([0-9]+(?:\.[0-9]+)?)\s*(B|bn)/i);
    return match ? Number(match[1]) : 0;
  };
  const totalDisclosedB = activeContracts.reduce((sum, c) => sum + parseValueB(c.value), 0);


  const filteredContracts = activeContracts.filter((c) => {
    const matchesCompany = filterCompany === 'all' || c.company === filterCompany;
    const matchesStatus = filterStatusLevel === 'all' || c.statusLevel === filterStatusLevel;
    const matchesSearch =
      c.client.toLowerCase().includes(search.toLowerCase()) ||
      c.hardware.toLowerCase().includes(search.toLowerCase()) ||
      c.details.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase());
    return matchesCompany && matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6" id="contracts-view">
      {/* Page Header */}
      <div className="flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 02 / Markets</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          AI Infrastructure Contracts Ledger
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          Disclosed commercial obligations representing committed backlog. 
          Use this ledger to inspect who is buying GPU compute power and what hardware is being secured.
        </p>
      </div>

      {/* Stats Quick Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#15181E]/30 border border-white/10 p-4 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block">Parsed Disclosed Value</span>
            <div className="text-lg font-mono font-black text-white">{totalDisclosedB > 0 ? `${totalDisclosedB.toFixed(1)}B+` : 'Not quantified'}</div>
          </div>
        </div>

        <div className="bg-[#15181E]/30 border border-white/10 p-4 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block">SEC-Linked Records</span>
            <div className="text-lg font-mono font-black text-white">{activeContracts.filter(c => c.source === 'sec-edgar-primary').length}</div>
          </div>
        </div>

        <div className="bg-[#15181E]/30 border border-white/10 p-4 rounded-xl flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest block">Total Registered Contracts</span>
            <div className="text-lg font-mono font-black text-white">{activeContracts.length} Active Deals</div>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between bg-[#15181E]/30 border border-white/10 p-4 rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 lg:max-w-2xl">
          {/* Company Filter Dropdown */}
          <div className="flex flex-col space-y-1">
            <label className="text-[9px] font-mono uppercase tracking-widest text-white/40">Select Company</label>
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white font-mono cursor-pointer"
            >
              <option value="all" className="bg-[#15181E]">ALL COMPANIES</option>
              {Object.keys(STOCK_METADATA).map((symbol) => (
                <option key={symbol} value={symbol} className="bg-[#15181E]">
                  {symbol} - {STOCK_METADATA[symbol].name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Level Filter Dropdown */}
          <div className="flex flex-col space-y-1">
            <label className="text-[9px] font-mono uppercase tracking-widest text-white/40">Verification / Status</label>
            <select
              value={filterStatusLevel}
              onChange={(e) => setFilterStatusLevel(e.target.value)}
              className="bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-white font-mono cursor-pointer"
            >
              <option value="all" className="bg-[#15181E]">ALL STATUS LEVELS</option>
              <option value="high-verified" className="bg-[#15181E]">🟢 HIGH-VERIFIED</option>
              <option value="in-progress" className="bg-[#15181E]">🟡 IN PROGRESS</option>
              <option value="low-rumour" className="bg-[#15181E]">🔴 LOW-RUMOUR</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col space-y-1 w-full lg:w-80">
          <label className="text-[9px] font-mono uppercase tracking-widest text-white/40">Text Search</label>
          <div className="relative">
            <Search className="w-4 h-4 text-white/40 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search client, hardware, details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-white placeholder-white/20 font-mono"
            />
          </div>
        </div>
      </div>

      {/* Contracts Cards List */}
      <div className="space-y-4">
        {filteredContracts.length === 0 ? (
          <div className="text-center py-12 border border-white/10 rounded text-white/40 text-xs font-mono">
            No live SEC-linked contracts are available for the current data refresh.
          </div>
        ) : (
          filteredContracts.map((c) => {
            const meta = STOCK_METADATA[c.company];
            const companyColor = meta ? meta.logoColor : '#94A3B8';
            const companyName = meta ? meta.name : c.company;

            return (
              <div
                key={c.id}
                className="bg-[#15181E]/30 border border-white/10 hover:border-white/20 rounded-2xl p-5 md:p-6 transition flex flex-col space-y-4"
              >
                <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span 
                        className="text-[9px] font-mono tracking-wider px-2 py-0.5 rounded border font-semibold"
                        style={{
                          backgroundColor: `${companyColor}15`,
                          borderColor: `${companyColor}30`,
                          color: companyColor,
                        }}
                      >
                        {companyName} ({c.company})
                      </span>
                      {c.geminiImpactSummary && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider">
                          <Sparkles className="w-2.5 h-2.5 mr-1" />
                          Live Synthesized
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Signed/Filed: {c.dateSigned}</span>
                      {c.source === 'sec-edgar-primary' && (
                        <span className="text-[8px] font-mono uppercase tracking-wider text-cyan-300 border border-cyan-400/20 bg-cyan-400/5 px-1.5 py-0.5 rounded">
                          SEC PRIMARY
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight text-white mt-2">{c.client}</h3>
                  </div>

                  <div className="bg-[#0F1115]/60 border border-white/10 rounded px-4 py-2 text-right md:self-center">
                    <span className="text-[8px] font-mono uppercase tracking-widest text-white/40 block">Total Value</span>
                    <span className="text-base font-mono font-black text-emerald-400">{c.value}</span>
                  </div>
                </div>

                {(() => {
                  const reaction = eventReaction(priceHistory[c.company] || [], c.dateSigned);
                  return (
                    <div className="bg-cyan-400/5 border border-cyan-400/10 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[9px] font-mono uppercase tracking-widest text-cyan-300">SEC filing event study</span>
                        <span className="text-[9px] font-mono text-white/30">event date: {c.dateSigned}</span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                        <div><span className="text-[8px] text-white/35 block uppercase tracking-widest">Anchor</span><span className="text-white font-bold">{reaction ? '
                  <div>
                    <span className="text-white/40 block uppercase text-[8px] tracking-widest">Duration</span>
                    <span className="text-white font-bold mt-0.5 block">{c.duration}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-white/40 block uppercase text-[8px] tracking-widest">Hardware Spec</span>
                    <span className="text-white font-bold mt-0.5 block truncate">{c.hardware}</span>
                  </div>
                </div>

                <div className="text-xs text-white/60 leading-relaxed space-y-3">
                  <p>{c.details}</p>
                  
                  {c.geminiImpactSummary && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 space-y-1.5">
                      <div className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[9px] font-black uppercase tracking-widest">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>🤖 Gemini Stock Impact Summary</span>
                      </div>
                      <p className="text-xs text-[#A7F3D0] leading-relaxed font-sans font-normal">
                        {c.geminiImpactSummary}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/40 font-mono border-t border-white/5 pt-3">
                    <div className="flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 text-white/30" />
                      <span className="uppercase tracking-wider">Status: <span className="text-white font-bold">{c.status}</span></span>
                    {c.source === 'sec-edgar-primary' && c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-l border-white/10 pl-3 text-cyan-300 hover:text-cyan-200 underline"
                      >
                        SEC filing
                      </a>
                    )}
                    </div>
                    <div className="flex items-center space-x-1.5 border-l border-white/10 pl-3">
                      <span className="uppercase tracking-wider">Verification: 
                        <span className={`ml-1 font-bold uppercase ${
                          c.statusLevel === 'high-verified' ? 'text-emerald-400' :
                          c.statusLevel === 'in-progress' ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {c.statusLevel === 'high-verified' && '🟢 HIGH-VERIFIED'}
                          {c.statusLevel === 'in-progress' && '🟡 IN PROGRESS'}
                          {c.statusLevel === 'low-rumour' && '🔴 LOW-RUMOUR'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
 + reaction.anchorPrice.toFixed(2) : '—'}</span></div>
                        <div><span className="text-[8px] text-white/35 block uppercase tracking-widest">T+1</span><span className={reaction?.t1 != null && reaction.t1 >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-300 font-bold'}>{fmtReaction(reaction?.t1)}</span></div>
                        <div><span className="text-[8px] text-white/35 block uppercase tracking-widest">T+5</span><span className={reaction?.t5 != null && reaction.t5 >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-300 font-bold'}>{fmtReaction(reaction?.t5)}</span></div>
                        <div><span className="text-[8px] text-white/35 block uppercase tracking-widest">T+20</span><span className={reaction?.t20 != null && reaction.t20 >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-300 font-bold'}>{fmtReaction(reaction?.t20)}</span></div>
                      </div>
                      <p className="text-[9px] text-white/35 leading-relaxed">Calculated from the last trading close before the SEC filing date to the 1st, 5th, and 20th subsequent trading sessions. This measures reaction around the filing date; it is not a claim that the filing caused the move.</p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0F1115]/30 border border-white/5 rounded p-4 text-xs font-mono">
                  <div>
                    <span className="text-white/40 block uppercase text-[8px] tracking-widest">Duration</span>
                    <span className="text-white font-bold mt-0.5 block">{c.duration}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-white/40 block uppercase text-[8px] tracking-widest">Hardware Spec</span>
                    <span className="text-white font-bold mt-0.5 block truncate">{c.hardware}</span>
                  </div>
                </div>

                <div className="text-xs text-white/60 leading-relaxed space-y-3">
                  <p>{c.details}</p>
                  
                  {c.geminiImpactSummary && (
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 space-y-1.5">
                      <div className="flex items-center space-x-1.5 text-emerald-400 font-mono text-[9px] font-black uppercase tracking-widest">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>🤖 Gemini Stock Impact Summary</span>
                      </div>
                      <p className="text-xs text-[#A7F3D0] leading-relaxed font-sans font-normal">
                        {c.geminiImpactSummary}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/40 font-mono border-t border-white/5 pt-3">
                    <div className="flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 text-white/30" />
                      <span className="uppercase tracking-wider">Status: <span className="text-white font-bold">{c.status}</span></span>
                    {c.source === 'sec-edgar-primary' && c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-l border-white/10 pl-3 text-cyan-300 hover:text-cyan-200 underline"
                      >
                        SEC filing
                      </a>
                    )}
                    </div>
                    <div className="flex items-center space-x-1.5 border-l border-white/10 pl-3">
                      <span className="uppercase tracking-wider">Verification: 
                        <span className={`ml-1 font-bold uppercase ${
                          c.statusLevel === 'high-verified' ? 'text-emerald-400' :
                          c.statusLevel === 'in-progress' ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {c.statusLevel === 'high-verified' && '🟢 HIGH-VERIFIED'}
                          {c.statusLevel === 'in-progress' && '🟡 IN PROGRESS'}
                          {c.statusLevel === 'low-rumour' && '🔴 LOW-RUMOUR'}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
