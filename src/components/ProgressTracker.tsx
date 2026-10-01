import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceDot } from 'recharts';
import { Calendar, CheckCircle, Clock, AlertCircle, Award, Search, Loader2 } from 'lucide-react';
import { STOCK_METADATA, INITIAL_MILESTONES } from '../data';
import { Milestone } from '../types';
import { formatPrice } from '../utils';

function matchesDate(milestoneDate: string, historyDate: string): boolean {
  const m = milestoneDate.trim().toLowerCase();
  const h = historyDate.trim().toLowerCase();
  if (m === h) return true;

  const parsed = Date.parse(milestoneDate);
  if (!Number.isNaN(parsed) && /^\d{4}-\d{2}-\d{2}$/.test(historyDate)) {
    return new Date(parsed).toISOString().slice(0, 10) === historyDate;
  }

  const monthYear = m.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})$/);
  if (monthYear && /^\d{4}-\d{2}-\d{2}$/.test(historyDate)) {
    const month = new Date(monthYear[1] + ' 1, ' + monthYear[2]).getMonth();
    const date = new Date(historyDate + 'T00:00:00Z');
    return date.getUTCMonth() === month && date.getUTCFullYear() === Number(monthYear[2]);
  }

  return false;
}

interface ProgressTrackerProps {
  livePrices?: Record<string, { price: number; changePct: number }>;
}

const TRACKER_SYMBOL_ALIASES: Record<string, string> = {
  SALESFORCE: 'CRM',
  MICROSOFT: 'MSFT',
  NVIDIA: 'NVDA',
  MICRON: 'MU',
  ONDAS: 'ONDS',
  ONDASNETWORKS: 'ONDS',
  SERVICENOW: 'NOW',
  NEBIUS: 'NBIS',
  SANDISK: 'SNDK',
  TSMC: 'TSM',
};

function resolveTrackerSymbol(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  return TRACKER_SYMBOL_ALIASES[normalized] || normalized;
}

export default function ProgressTracker({ livePrices }: ProgressTrackerProps) {
  const [selectedStock, setSelectedStock] = useState<string>('NBIS');
  const [milestones] = useState<Milestone[]>(INITIAL_MILESTONES);
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [historyData, setHistoryData] = useState<{ date: string; price: number }[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [secMilestones, setSecMilestones] = useState<Milestone[]>([]);
  const [secMilestoneLoading, setSecMilestoneLoading] = useState(false);
  const [secMilestoneError, setSecMilestoneError] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState('');


  // Combine the curated timeline with live SEC milestones for the selected symbol.
  const stockMilestones = [
    ...milestones.filter((m) => m.stockSymbol === selectedStock),
    ...secMilestones.filter((m) => m.stockSymbol === selectedStock && !milestones.some(existing => existing.id === m.id))
  ].sort((a, b) => {
    const da = Date.parse(a.date) || 0;
    const db = Date.parse(b.date) || 0;
    return db - da;
  });
  const activeMilestone = stockMilestones.find((m) => m.id === activeMilestoneId) || stockMilestones[0];

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const res = await fetch('/api/stock-history?symbol=' + encodeURIComponent(selectedStock) + '&range=2y');
        if (!res.ok) throw new Error('History request failed: HTTP ' + res.status);
        const data = await res.json();
        if (!cancelled) setHistoryData(Array.isArray(data.points) ? data.points : []);
      } catch (err: any) {
        if (!cancelled) {
          setHistoryData([]);
          setHistoryError(err?.message || 'Historical market data unavailable');
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    loadHistory();
    return () => { cancelled = true; };
  }, [selectedStock]);

  // Live SEC milestone discovery makes the tracker work for any public ticker,
  // not only symbols present in the curated dashboard metadata.
  useEffect(() => {
    let cancelled = false;
    async function loadSecMilestones() {
      setSecMilestoneLoading(true);
      setSecMilestoneError(null);
      try {
        const res = await fetch('/api/stock-milestones?symbol=' + encodeURIComponent(selectedStock) + '&limit=12');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'SEC milestone lookup failed');
        if (!cancelled) {
          const events = Array.isArray(data.events) ? data.events : [];
          setSecMilestones(events);
        }
      } catch (err: any) {
        if (!cancelled) {
          setSecMilestones([]);
          setSecMilestoneError(err?.message || 'Live SEC milestones unavailable');
        }
      } finally {
        if (!cancelled) setSecMilestoneLoading(false);
      }
    }
    loadSecMilestones();
    return () => { cancelled = true; };
  }, [selectedStock]);

  const chartHistory = livePrices?.[selectedStock]
    ? (() => {
        const liveObj = livePrices[selectedStock];
        const today = new Date().toISOString().slice(0, 10);
        const updated = historyData.map((point) =>
          point.date === today ? { ...point, price: liveObj.price } : point
        );
        return updated.some((point) => point.date === today)
          ? updated
          : [...updated, { date: today, price: liveObj.price }];
      })()
    : [...historyData];

  const currentMeta = STOCK_METADATA[selectedStock] || { name: selectedStock, sector: 'Live Market', desc: 'Tracking this public ticker from live market and SEC feeds.', logoColor: '#22c55e' };

  const getAccuratePrice = (m: Milestone) => {
    // Prefer an exact trading-day match. For month-only milestones, use the
    // nearest available trading day to the middle of that month so the UI
    // still shows a real market price instead of a missing/static value.
    const exact = chartHistory.find((pt) => matchesDate(m.date, pt.date));
    if (exact) return exact.price;

    const monthYear = m.date.trim().match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})$/i);
    if (monthYear) {
      const month = new Date(monthYear[1] + ' 1, ' + monthYear[2]).getMonth();
      const year = Number(monthYear[2]);
      const candidates = chartHistory
        .filter((pt) => {
          const d = new Date(pt.date + 'T00:00:00Z');
          return d.getUTCFullYear() === year && d.getUTCMonth() === month;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
      if (candidates.length) return candidates[Math.floor((candidates.length - 1) / 2)].price;
    }

    return undefined;
  };

  // Prepare chart data by merging stock history with milestone flags
  const chartData = chartHistory.map((pt) => {
    // Find milestone at matching month/date
    const m = stockMilestones.find((mil) => matchesDate(mil.date, pt.date));
    return {
      ...pt,
      milestone: m ? m.title : null,
      milestoneId: m ? m.id : null,
      milestonePrice: m ? getAccuratePrice(m) : null
    };
  });

  // Custom tool tip for chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const pt = payload[0].payload;
      return (
        <div className="bg-[#15181E] border border-white/15 p-3 rounded shadow-xl text-xs space-y-1 font-mono">
          <p className="text-white/40">{pt.date}</p>
          <p className="text-white font-bold">Stock Price: ${formatPrice(pt.price)}</p>
          {pt.milestone && (
            <div className="mt-1 pt-1.5 border-t border-white/10 text-emerald-400 font-bold">
              ★ {pt.milestone} (Price: ${formatPrice(pt.milestonePrice)})
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6" id="tracker-view">
      {/* Page Header */}
      <div className="aiw-page-header flex flex-col space-y-1 md:space-y-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Section 03 / Markets</span>
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase italic text-white">
          Build-Out &amp; Stock Price Progress Tracker
        </h1>
        <p className="text-xs text-white/60 max-w-3xl leading-relaxed">
          Observe how concrete progression events—data center scaling, chip validation, and cloud leases—correlate with historical stock prices in real-time.
        </p>
      </div>

      {/* Stock Selection + Arbitrary Ticker Search */}
      <div className="space-y-4 border-b border-white/10 pb-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3">
          <div className="flex-1">
            <label className="text-[9px] font-mono uppercase tracking-widest text-white/40 block mb-1.5">
              Track any public ticker
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                <input
                  value={tickerInput}
                  onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tickerInput.trim()) {
                      setSelectedStock(resolveTrackerSymbol(tickerInput));
                      setActiveMilestoneId(null);
                    }
                  }}
                  placeholder="e.g. AAPL, CRM, Salesforce, ONDAS"
                  className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-emerald-400/50 placeholder-white/20 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!tickerInput.trim()) return;
                  setSelectedStock(resolveTrackerSymbol(tickerInput));
                  setActiveMilestoneId(null);
                }}
                className="px-4 py-2.5 bg-emerald-500 text-black rounded text-[10px] font-mono font-black uppercase tracking-wider hover:bg-emerald-400 transition cursor-pointer"
              >
                Track
              </button>
            </div>
            <p className="text-[9px] text-white/30 font-mono mt-1.5">
              Public tickers use live market history plus recent SEC 8-K milestones. Private/non-SEC issuers may have price history without SEC events.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {Object.keys(STOCK_METADATA).map((symbol) => {
            const isSelected = selectedStock === symbol;
            const color = STOCK_METADATA[symbol]?.logoColor || '#94a3b8';
            return (
              <button
                key={symbol}
                onClick={() => {
                  setSelectedStock(symbol);
                  setTickerInput('');
                  setActiveMilestoneId(null);
                }}
                className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded border transition cursor-pointer flex items-center space-x-2 ${
                  isSelected
                    ? 'bg-white text-black border-white'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span>{symbol}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-cyan-300">
          {secMilestoneLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
          <span>{secMilestoneLoading ? 'Discovering SEC milestones' : `${secMilestones.length} live SEC milestones found`}</span>
          {secMilestoneError && <span className="text-amber-300 normal-case tracking-normal">· {secMilestoneError}</span>}
        </div>
      </div>

      {/* Interactive Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart Column */}
        <div className="lg:col-span-2 bg-[#15181E] border border-white/10 rounded-2xl p-4 md:p-5 flex flex-col space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-black uppercase italic tracking-tight text-white">{currentMeta.name} ({selectedStock})</h2>
              <span className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">{currentMeta.sector}</span>
            </div>
            <div className="text-right text-[10px] font-mono font-bold uppercase tracking-wider bg-white/5 border border-white/10 px-3 py-1.5 rounded text-white/60">
              Interactive Milestone Overlay
            </div>
          </div>

          {/* Recharts Wrapper */}
          <div className="h-64 md:h-80 w-full bg-[#0F1115] rounded-xl p-2 border border-white/5">
            {historyLoading && <div className="text-[10px] font-mono text-white/40 p-2">Loading verified daily market history…</div>}
            {!historyLoading && historyError && <div className="text-[10px] font-mono text-amber-300 p-2">{historyError}</div>}
            {!historyLoading && !historyError && chartHistory.length === 0 && <div className="text-[10px] font-mono text-white/40 p-2">No public market history is available for this symbol.</div>}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 15, right: 15, left: -20, bottom: 5 }}>
                <XAxis dataKey="date" stroke="#64748b" style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: 700 }} />
                <YAxis stroke="#64748b" domain={['auto', 'auto']} style={{ fontSize: '10px', fontFamily: 'JetBrains Mono', fontWeight: 700 }} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={currentMeta.logoColor}
                  strokeWidth={2.5}
                  activeDot={{ r: 6 }}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (payload.milestone) {
                      const isActive = payload.milestoneId === activeMilestone?.id;
                      return (
                        <circle
                          key={payload.date}
                          cx={cx}
                          cy={cy}
                          r={isActive ? 8 : 5}
                          fill="#15803d"
                          stroke="#4ade80"
                          strokeWidth={isActive ? 3 : 1.5}
                          className="cursor-pointer animate-pulse"
                          onClick={() => setActiveMilestoneId(payload.milestoneId)}
                        />
                      );
                    }
                    return <circle key={payload.date} cx={cx} cy={cy} r={2} fill={currentMeta.logoColor} />;
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 text-center">
            ★ Click any green milestone dot on the chart to read event briefs and stock valuation impacts.
          </p>
        </div>

        {/* Milestone Detail Sidebar */}
        <div className="bg-[#15181E]/40 border border-white/10 rounded-2xl p-5 flex flex-col justify-between space-y-4">
          {activeMilestone ? (
            <div className="space-y-4">
              <div className="flex justify-between items-start border-b border-white/10 pb-3">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/40">Selected Progression</span>
                  <h3 className="text-base font-black uppercase tracking-tight text-white mt-1 leading-tight">{activeMilestone.title}</h3>
                </div>
                <span className={`text-[9px] font-mono font-bold px-2.5 py-1 rounded ${
                  activeMilestone.status === 'done'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : activeMilestone.status === 'active'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-white/5 text-white/40 border border-white/10'
                }`}>
                  {activeMilestone.status === 'done' && 'DONE'}
                  {activeMilestone.status === 'active' && 'IN PROGRESS'}
                  {activeMilestone.status === 'planned' && 'PLANNED'}
                </span>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-white/40">Milestone Date:</span>
                  <span className="text-white font-bold flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-white/40 mr-1" />
                    {activeMilestone.date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Price at Event:</span>
                  <span className="text-emerald-400 font-bold">${formatPrice(getAccuratePrice(activeMilestone))}</span>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded p-3.5">
                <p className="text-xs text-white/60 leading-relaxed">
                  {activeMilestone.description}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-white/40 font-mono text-xs">
              No milestones available for this stock.
            </div>
          )}

          <div className="pt-4 border-t border-white/10 bg-white/5 p-3 rounded border border-white/10">
            <span className="text-[10px] font-mono text-white/60 flex items-center space-x-1.5">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>Current Evaluation: ${formatPrice(livePrices?.[selectedStock]?.price ?? historyData[historyData.length - 1]?.price)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Target Metrics Cards (Nebius / Digi Power X) */}
      {(selectedStock === 'NBIS' || selectedStock === 'DGXX') && (
        <div className="space-y-4">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Physical Capacity Build-Out Metrics</h3>
          {selectedStock === 'NBIS' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#15181E]/40 border border-white/10 p-4 rounded-xl space-y-2.5">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">Connected Capacity</span>
                <div className="flex justify-between text-xs font-mono text-white/80 font-bold">
                  <span>170MW (Active)</span>
                  <span className="text-emerald-400">800MW-1GW Target</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '22%' }}></div>
                </div>
                <p className="text-[10px] text-white/40 font-mono">~22% of long-term target reached under guidance</p>
              </div>

              <div className="bg-[#15181E]/40 border border-white/10 p-4 rounded-xl space-y-2.5">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">Contracted Power capacity</span>
                <div className="flex justify-between text-xs font-mono text-white/80 font-bold">
                  <span>2GW (Secured)</span>
                  <span className="text-emerald-400">3.5GW+ Target</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '57%' }}></div>
                </div>
                <p className="text-[10px] text-white/40 font-mono">75%+ of contracted capacity is corporate-owned</p>
              </div>

              <div className="bg-[#15181E]/40 border border-white/10 p-4 rounded-xl space-y-2.5">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">Backlog-to-Revenue Gap</span>
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-lg font-mono font-black text-white">$46B+ Backlog</span>
                  <span className="text-white/40 text-[9px]">vs $530M Revenues</span>
                </div>
                <p className="text-[10px] text-white/40 font-mono">Reflects capacity conversion over 2027-2031 bounds</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#15181E]/40 border border-white/10 p-4 rounded-xl space-y-2.5">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">FY Revenue Guidance</span>
                <div className="flex justify-between text-xs font-mono text-white/80 font-bold">
                  <span>$9.35M (Actual)</span>
                  <span className="text-blue-400">$250M-300M Target</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: '6%' }}></div>
                </div>
                <p className="text-[10px] text-white/40 font-mono">Contingent on Cerebras and SubQ delivery</p>
              </div>

              <div className="bg-[#15181E]/40 border border-white/10 p-4 rounded-xl space-y-2.5">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">Columbiana AL Campus buildout</span>
                <div className="flex justify-between text-xs font-mono text-white/80 font-bold">
                  <span>0MW (Active)</span>
                  <span className="text-blue-400">40MW Target</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: '8%' }}></div>
                </div>
                <p className="text-[10px] text-white/40 font-mono">Phase 1 (15MW) actively under construction</p>
              </div>

              <div className="bg-[#15181E]/40 border border-white/10 p-4 rounded-xl space-y-2.5">
                <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block">Total Power Grid Procurement</span>
                <div className="flex justify-between items-baseline pt-1">
                  <span className="text-lg font-mono font-black text-white">~400MW</span>
                  <span className="text-white/40 text-[9px]">Across 3 States</span>
                </div>
                <p className="text-[10px] text-white/40 font-mono font-medium">Secured footprint across Alabama, NC, and NY</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline of All Stock Milestones */}
      <div className="bg-[#15181E]/30 border border-white/10 rounded-2xl p-5 md:p-6 space-y-6">
        <h3 className="text-xs font-black uppercase tracking-widest text-white">Milestone Chronology ({selectedStock})</h3>
        <div className="relative border-l-2 border-white/10 pl-4 space-y-6 ml-2 font-mono">
          {stockMilestones.length === 0 ? (
            <p className="text-xs text-white/40">No SEC events were returned for this ticker yet.</p>
          ) : (
            stockMilestones.map((m) => {
              const isActive = m.id === activeMilestone?.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setActiveMilestoneId(m.id)}
                  className={`group relative pl-2 cursor-pointer transition ${
                    isActive ? 'text-emerald-400' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {/* Timeline Node Ring */}
                  <div className={`absolute -left-[27px] w-4 h-4 rounded-full border-2 bg-[#0F1115] flex items-center justify-center transition ${
                    isActive ? 'border-emerald-400 scale-110' : 'border-white/10 group-hover:border-white/40'
                  }`}>
                    {m.status === 'done' ? (
                      <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                    ) : m.status === 'active' ? (
                      <Clock className="w-2.5 h-2.5 text-amber-500" />
                    ) : (
                      <AlertCircle className="w-2.5 h-2.5 text-white/20" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="text-white/40 font-bold">{m.date}</span>
                      <span className="text-[10px] text-white/20">|</span>
                      <span className="text-emerald-400 font-bold">Price: ${formatPrice(getAccuratePrice(m))}</span>
                    </div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-white group-hover:underline">{m.title}</h4>
                    <p className="text-xs text-white/60 max-w-2xl font-sans mt-1">
                      {m.description.slice(0, 110)}...
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>


    </div>
  );
}
