import { useState } from 'react';
import { Search, Info, TrendingUp, AlertTriangle, Sparkles } from 'lucide-react';
import { formatPrice } from '../utils';
import { CongressTrade } from '../types';

interface CongressTradesProps {
  liveTrades?: CongressTrade[];
}

export default function CongressTrades({ liveTrades }: CongressTradesProps) {
  const [search, setSearch] = useState('');
  const [chamberFilter, setChamberFilter] = useState<'all' | 'Senate' | 'House'>('all');

  const activeTrades = liveTrades || [];

  const filtered = activeTrades.filter((t) => {
    const matchesChamber = chamberFilter === 'all' || t.chamber === chamberFilter;
    const matchesSearch =
      t.politician.toLowerCase().includes(search.toLowerCase()) ||
      t.stockSymbol.toLowerCase().includes(search.toLowerCase());
    return matchesChamber && matchesSearch;
  });

  return (
    <div className="space-y-6" id="congress-view">
      {/* Page Header */}
      <div className="flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 04 / Signals</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          Congressional Trading Signals
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          Track disclosure logs of stock transactions filed by members of the Senate and House of Representatives for active AI infrastructure symbols.
        </p>
      </div>

      {/* Advisory Note */}
      <div className="flex items-start space-x-3 bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 text-white/80">
        <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-500" />
        <div className="text-xs leading-relaxed">
          <span className="font-black uppercase tracking-wider text-white">Regulatory Insight:</span> Disclosures are gathered from public Congressional filing portals. Under the STOCK Act, representatives must file transactions within 45 days. Use these trends as directional sentiment, not direct trade recommendations.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-[#15181E]/30 border border-white/10 p-4 rounded-xl">
        <div className="flex space-x-2 w-full md:w-auto">
          {(['all', 'Senate', 'House'] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setChamberFilter(ch)}
              className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded border transition cursor-pointer flex-1 md:flex-initial ${
                chamberFilter === ch
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              {ch === 'all' && 'All Chambers'}
              {ch === 'Senate' && 'Senate'}
              {ch === 'House' && 'House'}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-white/40 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search politician or symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-white placeholder-white/20 font-mono"
          />
        </div>
      </div>

      <div className="text-[10px] text-white/40 font-mono">
        Data source: Bargo U.S. Congress Stock Trades API, derived from official House and Senate disclosure filings.
      </div>

      {/* Trades Table */}
      <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 bg-[#0F1115]/60 text-white/40 uppercase tracking-widest text-[9px] font-black">
                <th className="p-4">Filer / Chamber</th>
                <th className="p-4">Symbol</th>
                <th className="p-4">Type</th>
                <th className="p-4">Amount Range</th>
                <th className="p-4">Date Filed</th>
                <th className="p-4 text-right">Filing Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-white/40">
                    No transactions matching current search query.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className="hover:bg-white/5 transition">
                    <td className="p-4 font-sans font-bold text-white max-w-sm">
                      <div className="flex items-center space-x-2">
                        <span>{t.politician}</span>
                        {t.geminiImpactSummary && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-wider">
                            <Sparkles className="w-2.5 h-2.5 mr-1" />
                            Grounded
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-white/40 font-mono tracking-wide uppercase">{t.chamber}</span>
                      {t.geminiImpactSummary && (
                        <div className="mt-2 p-2.5 bg-emerald-500/5 border border-emerald-500/10 rounded-lg text-[10px] text-[#A7F3D0] font-mono leading-relaxed font-normal">
                          <span className="text-[8px] uppercase tracking-wider text-emerald-400/70 font-black block mb-1">🤖 Gemini Stock Impact Summary</span>
                          {t.geminiImpactSummary}
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 text-white rounded text-[9px] font-black uppercase tracking-wider">
                        {t.stockSymbol}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                        t.transactionType === 'buy'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {t.transactionType.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-white/80 font-bold">{t.amountRange}</td>
                    <td className="p-4 text-white/40 font-bold">{t.date}</td>
                    <td className="p-4 text-right text-emerald-400 font-bold">${formatPrice(t.stockPrice)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
