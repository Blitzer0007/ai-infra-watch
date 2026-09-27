import { useMemo, useState } from 'react';
import { useMemo, useState, type ReactNode } from 'react';
import { Activity, BarChart3, CalendarDays, FileText, Globe2, Network, Search, ShieldAlert, TrendingUp, WalletCards, Zap } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { buildIntelligence } from '../utils/intelligence';
import { buildPositionAnalyses, PORTFOLIO_AS_OF, PORTFOLIO_SNAPSHOT, type PositionAnalysis } from '../utils/portfolioPositions';
import { STOCK_UNIVERSE } from '../utils/stockUniverse';

type Price = { price: number; changePct: number };
type Props = { livePrices?: Record<string, Price> };

const WATCHLIST = STOCK_UNIVERSE;


export default function PortfolioIntelligence({ livePrices = {} }: Props) {
  const [tab, setTab] = useState('overview');
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('All');
  const [selected, setSelected] = useState('NVDA');

  const intelligence = useMemo(() => buildIntelligence(livePrices), [livePrices]);
  const analyses = useMemo(() => buildPositionAnalyses(livePrices, intelligence), [livePrices, intelligence]);
  const selectedAnalysis = analyses.find(x => x.symbol === selected) ?? analyses[0];
  const filtered = useMemo(() => analyses.filter(h =>
    (group === 'All' || h.group === group) &&
    (h.symbol + ' ' + h.name + ' ' + h.theme).toLowerCase().includes(q.toLowerCase())
  ), [analyses, q, group]);

  const breadth = analyses.filter(h => (h.dailyChangePct ?? 0) >= 0).length;
  const addReviews = analyses.filter(h => h.state === 'ADD REVIEW').length;
  const riskReviews = analyses.filter(h => h.state === 'RISK REVIEW').length;
  const infraScore = Math.round(intelligence.groups.find(g => g.name === 'AI Infrastructure')?.score ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono tracking-[.2em] uppercase text-emerald-400">AI INFRA WATCH / PORTFOLIO INTELLIGENCE</div>
          <div className="text-2xl font-black mt-2">Portfolio + Watchlist Decision Lab</div>
          <div className="text-xs text-white/45 mt-1">Broker snapshot · live market feed · peers · rotation · catalysts · event study</div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-mono text-white/40">
          <span className="px-2 py-1 rounded-full border border-white/10">BREADTH {breadth}/10</span>
          <span className="px-2 py-1 rounded-full border border-white/10">ADD REVIEWS {addReviews}</span>
          <span className="px-2 py-1 rounded-full border border-white/10">RISK REVIEWS {riskReviews}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Metric label="Broker invested" value={'$' + PORTFOLIO_SNAPSHOT.investedValue.toFixed(2)} suffix="" tone="neutral" icon={<WalletCards/>}/>
        <Metric label="Broker current" value={'$' + PORTFOLIO_SNAPSHOT.currentValue.toFixed(2)} suffix="" tone="up" icon={<TrendingUp/>}/>
        <Metric label="Unrealized" value={(PORTFOLIO_SNAPSHOT.unrealizedPnl >= 0 ? '+' : '') + '$' + PORTFOLIO_SNAPSHOT.unrealizedPnl.toFixed(2)} suffix={'(' + PORTFOLIO_SNAPSHOT.unrealizedPct.toFixed(2) + '%)'} tone="up" icon={<Activity/>}/>
        <Metric label="AI infra signal" value={infraScore.toString()} suffix="/100" tone={infraScore >= 50 ? "up" : "down"} icon={<Zap/>}/>
        <Metric label="Top live group" value={intelligence.topGroup || '—'} suffix="" tone="warn" icon={<ShieldAlert/>}/>
      </div>

      <div className="bg-[#15181E] border border-white/10 rounded-2xl px-4 py-3 text-[10px] text-white/45">
        <span className="font-mono text-white/65 uppercase mr-2">BROKER SNAPSHOT</span>
        {PORTFOLIO_AS_OF} · 1D {PORTFOLIO_SNAPSHOT.oneDayReturn >= 0 ? '+' : ''}{'$'}{PORTFOLIO_SNAPSHOT.oneDayReturn.toFixed(2)} ({PORTFOLIO_SNAPSHOT.oneDayPct.toFixed(2)}%) · buying power {'$'}{PORTFOLIO_SNAPSHOT.buyingPower.toFixed(2)}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
        {([['overview','Overview'],['watchlist','Watchlist'],['rotation','Money Rotation'],['events','Event Study'],['network','Relationship Graph']] as const).map(x =>
          <button key={x[0]} onClick={() => setTab(x[0])} className={'px-3 py-2 rounded-lg border text-[11px] font-mono uppercase ' + (tab === x[0] ? 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400' : 'border-transparent text-white/45 hover:text-white hover:bg-white/5')}>
            {x[1]}
          </button>
        )}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-4">
          <Panel title="Held portfolio universe" subtitle="Screenshot-backed positions with live quote and model state">
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/25"/>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ticker, name or theme" className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs outline-none"/>
              </div>
              <select value={group} onChange={e => setGroup(e.target.value)} className="bg-[#101318] border border-white/10 rounded-lg px-3 text-xs">
                {['All', ...intelligence.groups.map((item) => item.name)].map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="space-y-2">{filtered.map(h => <PositionRow key={h.symbol} h={h} selected={selected === h.symbol} onSelect={() => setSelected(h.symbol)} />)}</div>
          </Panel>
          {selectedAnalysis && <PositionDetail h={selectedAnalysis}/>}
        </div>
      )}

      {tab === 'watchlist' && (
        <Panel title="Watchlist intelligence universe" subtitle={`${WATCHLIST.length} configured names analyzed using the same market/peer/rotation framework`}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {WATCHLIST.map((w) =>
              <button key={w.symbol} onClick={() => setSelected(w.symbol)} className={'text-left border rounded-xl p-3 ' + (selected === w.symbol ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-white/5 bg-white/[.02]')}>
                <div className="flex justify-between"><span className="font-black text-xs">{w.symbol}</span><span className="text-[10px] text-white/25">analyze</span></div>
                <div className="text-xs mt-1">{w.name}</div>
                <div className="text-[10px] text-white/35 mt-1">{w.group} · {w.theme}</div>
                <div className="text-[9px] text-white/25 mt-2">Peers: {w.peers.join(' · ')}</div>
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            <Insight title="Memory cluster" body="SK Hynix · Micron · SanDisk · DRAM" icon={<BarChart3/>}/>
            <Insight title="Compute cluster" body="NVDA · AMD · TSM · QCOM · INTC · CBRS" icon={<Network/>}/>
            <Insight title="Software rotation" body="NOW · CRM · TEAM vs AI hardware breadth" icon={<TrendingUp/>}/>
          </div>
        </Panel>
      )}

      {tab === 'rotation' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-4">
          <Panel title="Money rotation engine" subtitle="Relative-strength model across infrastructure, compute, memory and software">
            <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={intelligence.groups.filter(g => g.avgChange !== 0 || g.members.some(m => livePrices[m])).map(g => ({group:g.name, score:Math.round(g.score), avg:g.avgChange}))}>
              <CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="group" stroke="#ffffff35" tick={{fontSize:9}} interval={0} angle={-18} textAnchor="end" height={55}/><YAxis stroke="#ffffff35" domain={[0,100]} tick={{fontSize:10}}/><Tooltip contentStyle={{background:'#15181E',border:'1px solid #ffffff20'}} formatter={(v,n) => n === 'score' ? [v + '/100','Signal'] : [v + '%','Avg daily return']}/><Bar dataKey="score" fill="#34d399" radius={[5,5,0,0]}/>
            </BarChart></ResponsiveContainer></div>
            <div className="text-[10px] text-white/30">Signal = daily return + breadth + universe-relative performance. It is not a literal measure of capital flows.</div>
          </Panel>
          <Panel title="Pair monitor" subtitle="Relative-strength relationships that the model tests">
            <div className="space-y-2">{intelligence.pairSignals.map(x => <div key={x.left+x.right} className="border border-white/5 rounded-xl p-3">
              <div className="flex justify-between"><div className="text-xs font-bold">{x.left} ↔ {x.right}</div><div className={'text-[10px] font-mono ' + ((x.spread ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{x.spread == null ? '—' : (x.spread >= 0 ? '+' : '') + x.spread.toFixed(2) + ' pts'}</div></div>
              <div className="text-[10px] text-white/35 mt-1">{x.label}</div>
            </div>)}</div>
          </Panel>
        </div>
      )}

      {tab === 'events' && <Panel title="Event study" subtitle="Historical event windows are separate until verified price history is available">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Insight title="Data status" body="Live prices are available. Verified event-date price history is the remaining input for T-5 / T0 / T+1 / T+5 / T+20 calculations." icon={<CalendarDays/>}/>
          <Insight title="Method" body="Measure raw return and benchmark-relative return at each window, then compare persistence across repeated event types." icon={<BarChart3/>}/>
          <Insight title="Guardrail" body="A catalyst reaction is not causal proof; separate company news from sector and macro moves." icon={<ShieldAlert/>}/>
        </div>
      </Panel>}

      {tab === 'network' && <Panel title="Relationship graph" subtitle="Competition and second-order exposure — click a node">
        <svg viewBox="0 0 920 420" className="w-full rounded-xl bg-[#0D1015] border border-white/5">
          {[['NVDA',140,210],['AMD',330,100],['MU',330,320],['META',550,100],['NOW',550,320],['NBIS',790,150],['CRM',790,290]].map(n => <g key={n[0]} onClick={() => setSelected(n[0])} style={{cursor:'pointer'}}>
            <circle cx={n[1]} cy={n[2]} r="38" fill={selected === n[0] ? '#153528' : '#15181E'} stroke={selected === n[0] ? '#34d399' : '#334155'} strokeWidth="2"/>
            <text x={n[1]} y={n[2]+5} textAnchor="middle" fill="white" fontSize="13" fontWeight="700">{n[0]}</text>
          </g>)}
          <line x1="178" y1="195" x2="292" y2="115" stroke="#34d399" strokeWidth="3"/><line x1="178" y1="225" x2="292" y2="305" stroke="#fbbf24" strokeWidth="2"/><line x1="368" y1="100" x2="512" y2="100" stroke="#60a5fa" strokeWidth="2"/><line x1="368" y1="320" x2="512" y2="320" stroke="#fb7185" strokeWidth="2"/><line x1="588" y1="115" x2="752" y2="145" stroke="#34d399" strokeWidth="2"/><line x1="588" y1="305" x2="752" y2="290" stroke="#fb7185" strokeWidth="2"/>
        </svg>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
          <Insight title="NVDA ↔ AMD" body="Direct accelerator competition." icon={<Activity/>}/><Insight title="MU ↔ SK Hynix" body="Memory-cycle relationship." icon={<Network/>}/><Insight title="NOW ↔ CRM" body="Enterprise-software relative strength." icon={<FileText/>}/>
        </div>
      </Panel>}

      <div className="text-[10px] text-white/30 flex items-center gap-2"><Globe2 className="w-3 h-3"/> Position states are model outputs for review, not automatic trade instructions.</div>
    </div>
  );
}

function PositionRow({h,selected,onSelect}:{h:PositionAnalysis;selected:boolean;onSelect:()=>void}) {
  return <button onClick={onSelect} className={'w-full text-left border rounded-xl p-3 ' + (selected ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-white/5 bg-white/[.02] hover:bg-white/[.04]')}>
    <div className="flex justify-between gap-3"><div className="min-w-0">
      <div className="flex items-center gap-2"><span className="font-black text-sm">{h.symbol}</span><StatePill state={h.state}/></div>
      <div className="text-[10px] text-white/40 truncate">{h.name} · {h.group}</div>
      <div className="text-[10px] text-white/25 mt-1">Qty {h.quantity.toFixed(6)} · Avg {'$'}{h.averageCost.toFixed(2)} · Snapshot P&L {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%</div>
    </div><div className="text-right shrink-0">
      <div className="font-bold text-sm">{h.livePrice != null ? '$' + h.livePrice.toFixed(2) : '$' + h.snapshotCurrentValue.toFixed(2)}</div>
      <div className={'text-[10px] font-mono ' + ((h.dailyChangePct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400')}>{h.dailyChangePct == null ? 'quote pending' : (h.dailyChangePct >= 0 ? '+' : '') + h.dailyChangePct.toFixed(2) + '%'}</div>
    </div></div>
  </button>;
}

function PositionDetail({h}:{h:PositionAnalysis}) {
  return <Panel title={h.symbol + ' decision context'} subtitle={h.name + ' · ' + h.group}>
    <div className="grid grid-cols-2 gap-2">
      <Info label="Snapshot invested" value={'$' + h.investedValue.toFixed(2)}/><Info label="Snapshot current" value={'$' + h.snapshotCurrentValue.toFixed(2)}/><Info label="Snapshot P&L" value={(h.pnl >= 0 ? '+' : '') + '$' + h.pnl.toFixed(2) + ' (' + h.pnlPct.toFixed(2) + '%)'}/><Info label="Daily move" value={h.dailyChangePct == null ? '—' : (h.dailyChangePct >= 0 ? '+' : '') + h.dailyChangePct.toFixed(2) + '%'}/>
      <Info label="Group score" value={h.groupScore == null ? '—' : Math.round(h.groupScore) + '/100'}/><Info label="Group breadth" value={h.groupBreadth == null ? '—' : Math.round(h.groupBreadth * 100) + '%'}/><Info label="Group vs universe" value={h.relativeToUniverse == null ? '—' : (h.relativeToUniverse >= 0 ? '+' : '') + h.relativeToUniverse.toFixed(2) + ' pts'}/><Info label="Vs tracked peers" value={h.vsPeers == null ? '—' : (h.vsPeers >= 0 ? '+' : '') + h.vsPeers.toFixed(2) + ' pts'}/>
    </div>
    <div className="mt-4 rounded-xl border border-white/10 bg-white/[.02] p-4"><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-mono uppercase text-white/35">Model state</div><StatePill state={h.state}/></div><div className="text-sm mt-2">{h.rationale}</div></div>
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2"><RuleCard title="Add review trigger" body={h.addTrigger} tone="up"/><RuleCard title="Risk review trigger" body={h.riskTrigger} tone="down"/></div>
    <div className="mt-3 bg-[#0F1115] border border-white/5 rounded-xl p-4"><div className="text-[9px] font-mono uppercase text-white/25">Transmission chain</div><div className="text-sm mt-2 leading-6">{h.theme} → catalyst/news → revenue/capex/supply-chain effect → peer response → event persistence → portfolio rotation regime.</div><div className="text-[10px] text-white/30 mt-2">Peers: {h.peers.join(' · ')} · Geo/risk lens: {h.geo}</div></div>
  </Panel>;
}

function RuleCard({title,body,tone}:{title:string;body:string;tone:'up'|'down'}) { return <div className="border border-white/5 rounded-xl p-3"><div className={'text-[10px] font-mono uppercase ' + (tone === 'up' ? 'text-emerald-400' : 'text-rose-400')}>{title}</div><div className="text-[10px] text-white/40 mt-2 leading-5">{body}</div></div>; }
function StatePill({state}:{state:PositionAnalysis['state']}) {
  const cls = state === 'ADD REVIEW' ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20' : state === 'RISK REVIEW' ? 'bg-rose-400/10 text-rose-300 border-rose-400/20' : state === 'INSUFFICIENT DATA' ? 'bg-amber-400/10 text-amber-300 border-amber-400/20' : 'bg-white/5 text-white/55 border-white/10';
  return <span className={'inline-flex px-1.5 py-0.5 rounded border text-[8px] font-mono font-bold uppercase ' + cls}>{state}</span>;
}
function Panel({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}) { return <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5"><div className="mb-4"><div className="text-sm font-bold">{title}</div><div className="text-[11px] text-white/40 mt-1">{subtitle}</div></div>{children}</section>; }
function Info({label,value}:{label:string;value:string}) { return <div className="bg-white/[.025] border border-white/5 rounded-xl p-3"><div className="text-[9px] uppercase font-mono text-white/25">{label}</div><div className="text-xs mt-1">{value}</div></div>; }
function Metric({label,value,suffix,tone,icon}:{label:string;value:string;suffix:string;tone:'up'|'down'|'warn'|'neutral';icon?:ReactNode}) { const c=tone==='up'?'text-emerald-400':tone==='down'?'text-rose-400':tone==='warn'?'text-amber-300':'text-white'; return <div className="bg-white/[.025] border border-white/5 rounded-xl p-3"><div className="flex items-center justify-between text-[9px] uppercase font-mono text-white/30">{label}{icon&&<span className={c}>{icon}</span>}</div><div className={'text-lg font-black mt-2 '+c}>{value}<span className="text-[10px] text-white/30 ml-1">{suffix}</span></div></div>; }
function Insight({title,body,icon}:{title:string;body:string;icon:ReactNode}) { return <div className="border border-white/5 rounded-xl p-3"><div className="flex items-center gap-2 text-xs font-bold">{icon}<span>{title}</span></div><div className="text-[10px] text-white/35 mt-2">{body}</div></div>; }