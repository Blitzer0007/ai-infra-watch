import { useMemo, useState } from 'react';
import { buildIntelligence } from '../utils/intelligence';
import { Activity, BarChart3, CalendarDays, FileText, Globe2, Network, Search, ShieldAlert, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';

type Price = { price: number; changePct: number };
type Props = { livePrices?: Record<string, Price> };

const PORTFOLIO = [
  { t: 'DGXX', group: 'AI Infrastructure', theme: 'GPU hosting / power', peers: ['IREN','APLD'], geo: 'Power + grid' },
  { t: 'DRAM', group: 'Memory', theme: 'HBM / DRAM / NAND', peers: ['MU','SNDK'], geo: 'Korea + Taiwan' },
  { t: 'SOXL', group: 'Semiconductors', theme: '3x semiconductor beta', peers: ['SOXX','SMH'], geo: 'Broad semiconductor beta' },
  { t: 'NVDA', group: 'AI Compute', theme: 'Accelerators / AI systems', peers: ['AMD','AVGO'], geo: 'China export + Taiwan' },
  { t: 'MSFT', group: 'AI Platform', theme: 'Azure / Copilot / capex', peers: ['GOOGL','AMZN'], geo: 'Cloud capex + rates' },
  { t: 'NBIS', group: 'AI Infrastructure', theme: 'AI cloud / GPU capacity', peers: ['IREN','CRWV'], geo: 'U.S. + Europe capacity' },
  { t: 'VIVO', group: 'AI Infrastructure', theme: 'Power + data centers', peers: ['IREN','CIFR'], geo: 'Power / Nordic exposure' },
  { t: 'META', group: 'AI Platform', theme: 'AI monetization / capex', peers: ['GOOGL','MSFT'], geo: 'AI capex + regulation' },
  { t: 'NOW', group: 'Enterprise Software', theme: 'AI workflow software', peers: ['CRM','TEAM'], geo: 'Rates + enterprise spend' },
  { t: 'PHVS', group: 'Healthcare', theme: 'Clinical catalyst', peers: ['APLS','ARWR'], geo: 'Clinical / regulatory' },
] as const;

const WATCHLIST = [
  ['000660.KS','SK Hynix','Memory','HBM / DRAM','MU · SNDK'],
  ['SNDK','SanDisk','Storage','Enterprise SSD / NAND','MU · WDC'],
  ['MU','Micron','Memory','HBM / DRAM','SK Hynix · NVDA'],
  ['TEAM','Atlassian','Enterprise Software','AI software','CRM · NOW'],
  ['SOFI','SoFi','Fintech','Rates / consumer credit','HOOD · NU'],
  ['CRM','Salesforce','Enterprise Software','Agentic CRM / AI','NOW · MSFT'],
  ['AMZN','Amazon','AI Platform','AWS / capex','MSFT · GOOGL'],
  ['GOOGL','Alphabet','AI Platform','Gemini / TPU / Cloud','MSFT · AMZN'],
  ['PLTR','Palantir','AI Software','AIP / government AI','MSFT · SNOW'],
  ['CBRS','Cerebras','AI Compute','AI accelerators','NVDA · AMD'],
  ['RUM','Rumble','Media','Video / cloud','META · GOOGL'],
  ['QCOM','Qualcomm','Semiconductors','Edge AI / connectivity','NVDA · AMD'],
  ['INTC','Intel','Semiconductors','Foundry / x86 / AI','AMD · TSMC'],
  ['SOXX','iShares Semiconductor ETF','Semiconductors','Sector breadth','SOXL · SMH'],
  ['IREN','IREN','AI Infrastructure','Data centers / power','NBIS · DGXX'],
  ['TSM','TSMC','Semiconductors','Foundry / advanced nodes','NVDA · AMD'],
  ['AMD','AMD','AI Compute','Instinct accelerators','NVDA · AVGO'],
  ['TSLA','Tesla','AI / Robotics','FSD / robotics','NVDA · META'],
  ['AAPL','Apple','AI Platform','Device AI / ecosystem','MSFT · GOOGL'],
  ['ONDS','Ondas','AI / Autonomy','Wireless / autonomy','QCOM · NOK'],
  ['CIFR','Cipher Mining','AI Infrastructure','Power / data centers','IREN · DGXX'],
  ['IONQ','IonQ','Quantum','Quantum computing','NVDA · IBM'],
  ['NOK','Nokia','Networking','AI-RAN / telecom','QCOM · AMPG'],
  ['TRT','Trio-Tech','Semiconductor Services','Testing / manufacturing','AMKR · INTC'],
  ['AMPG','AmpliTech','RF Hardware','AI-RAN / RF','NOK · QCOM'],
  ['DELL','Dell','AI Hardware','AI servers / storage','NVDA · HPE'],
  ['IBM','IBM','Enterprise AI','watsonx / hybrid cloud','MSFT · ORCL'],
] as const;
export default function PortfolioIntelligence({ livePrices = {} }: Props) {
  const [tab,setTab] = useState('overview');
  const [q,setQ] = useState('');
  const [group,setGroup] = useState('All');
  const [selected,setSelected] = useState('NVDA');

  const price = (t:string) => livePrices[t];
  const filtered = useMemo(() => PORTFOLIO.filter(h => (group === 'All' || h.group === group) && (h.t + ' ' + h.theme).toLowerCase().includes(q.toLowerCase())), [q,group]);
  const breadth = PORTFOLIO.filter(h => (price(h.t)?.changePct ?? 0) >= 0).length;
  const intelligence = useMemo(() => buildIntelligence(livePrices), [livePrices]);
  const sel = PORTFOLIO.find(h => h.t === selected) || PORTFOLIO[0];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="text-[10px] font-mono tracking-[.2em] uppercase text-emerald-400">AI INFRA WATCH / PORTFOLIO INTELLIGENCE</div><div className="text-2xl font-black mt-2">Portfolio + Watchlist Rotation Lab</div><div className="text-xs text-white/45 mt-1">Contracts · geopolitics · earnings · peers · event reaction · rotation</div></div>
      <div className="flex gap-2 text-[10px] font-mono text-white/40"><span className="px-2 py-1 rounded-full border border-white/10">BREADTH {breadth}/10</span><span className="px-2 py-1 rounded-full border border-white/10">LIVE FEED</span></div>
    </div>

    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Metric label="AI infra signal" value={String(Math.round(intelligence.groups.find(g=>g.name==="AI Infrastructure")?.score ?? 0))} suffix="/100" tone={(intelligence.groups.find(g=>g.name==="AI Infrastructure")?.score ?? 50)>=50?"up":"down"} icon={<Zap/>}/>
      <Metric label="Compute signal" value={String(Math.round(intelligence.groups.find(g=>g.name==="AI Compute")?.score ?? 0))} suffix="/100" tone={(intelligence.groups.find(g=>g.name==="AI Compute")?.score ?? 50)>=50?"up":"down"} icon={<Activity/>}/>
      <Metric label="Software vs universe" value={(intelligence.groups.find(g=>g.name==="Enterprise Software")?.relativeToUniverse ?? 0).toFixed(2)} suffix=" pts" tone={(intelligence.groups.find(g=>g.name==="Enterprise Software")?.relativeToUniverse ?? 0)>=0?"up":"down"} icon={<TrendingDown/>}/>
      <Metric label="Top live group" value={intelligence.topGroup || "—"} suffix="" tone="warn" icon={<ShieldAlert/>}/>
    </div>

    <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
      {([['overview','Overview'],['watchlist','Watchlist'],['rotation','Money Rotation'],['events','Event Study'],['network','Relationship Graph']] as const).map(x => <button key={x[0]} onClick={()=>setTab(x[0])} className={'px-3 py-2 rounded-lg border text-[11px] font-mono uppercase '+(tab===x[0]?'bg-emerald-400/10 border-emerald-400/20 text-emerald-400':'border-transparent text-white/45 hover:text-white hover:bg-white/5')}>{x[1]}</button>)}
    </div>

    {tab==='overview' && <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-4">
      <Panel title="Held portfolio universe" subtitle="10 holdings with live quote, peers and transmission theme">
        <div className="flex flex-wrap gap-2 mb-3"><div className="relative flex-1 min-w-48"><Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-white/25"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search ticker or theme" className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs outline-none"/></div><select value={group} onChange={e=>setGroup(e.target.value)} className="bg-[#101318] border border-white/10 rounded-lg px-3 text-xs">{['All','AI Infrastructure','AI Compute','AI Platform','Enterprise Software','Memory','Semiconductors','Healthcare'].map(g=><option key={g}>{g}</option>)}</select></div>
        <div className="space-y-2">{filtered.map(h=>{const p=price(h.t);return <button key={h.t} onClick={()=>setSelected(h.t)} className={'w-full text-left border rounded-xl p-3 '+(selected===h.t?'border-emerald-400/30 bg-emerald-400/5':'border-white/5 bg-white/[.02] hover:bg-white/[.04]')}><div className="flex justify-between gap-3"><div><div className="font-black text-sm">{h.t}</div><div className="text-[10px] text-white/40">{h.group} · {h.theme}</div><div className="text-[10px] text-white/25 mt-1">Peers: {h.peers.join(' · ')}</div></div><div className="text-right">{p?<><div className="font-bold text-sm">{'$'}{p.price.toFixed(2)}</div><div className={'text-[10px] font-mono '+(p.changePct>=0?'text-emerald-400':'text-rose-400')}>{p.changePct>=0?'+':''}{p.changePct.toFixed(2)}%</div></>:<span className="text-[10px] text-white/25">quote pending</span>}</div></div></button>})}</div>
      </Panel>
      <Panel title={sel.t+' relationship profile'} subtitle={sel.group}>
        <div className="grid grid-cols-2 gap-2">{[['Theme',sel.theme],['Peers',sel.peers.join(' · ')],['Geo',sel.geo],['Signal','Compare relative return + event persistence']].map(x=><div className="bg-white/[.025] border border-white/5 rounded-xl p-3" key={x[0]}><div className="text-[9px] uppercase font-mono text-white/25">{x[0]}</div><div className="text-xs mt-1">{x[1]}</div></div>)}</div>
        <div className="mt-3 bg-[#0F1115] border border-white/5 rounded-xl p-4"><div className="text-[9px] font-mono uppercase text-white/25">Transmission chain</div><div className="text-sm mt-2 leading-6">Headline → catalyst → revenue/capex/supply-chain impact → peer response → historical event window → persistence → rotation regime.</div></div>
      </Panel>
    </div>}

    {tab==='watchlist' && <Panel title="Watchlist intelligence universe" subtitle="27 watchlist names analyzed using the same pipeline as portfolio holdings">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">{WATCHLIST.map(w=><button key={w[0]} onClick={()=>setSelected(w[0])} className={'text-left border rounded-xl p-3 '+(selected===w[0]?'border-emerald-400/30 bg-emerald-400/5':'border-white/5 bg-white/[.02]')}><div className="flex justify-between"><span className="font-black text-xs">{w[0]}</span><span className="text-[10px] text-white/25">analyze</span></div><div className="text-xs mt-1">{w[1]}</div><div className="text-[10px] text-white/35 mt-1">{w[2]} · {w[3]}</div><div className="text-[9px] text-white/25 mt-2">Peers: {w[4]}</div></button>)}</div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2"><Insight title="Memory cluster" body="SK Hynix · Micron · SanDisk · DRAM" icon={<BarChart3/>}/><Insight title="Compute cluster" body="NVDA · AMD · TSMC · QCOM · INTC · CBRS" icon={<Network/>}/><Insight title="Software rotation" body="NOW · CRM · TEAM vs AI hardware breadth" icon={<TrendingUp/>}/></div>
    </Panel>}

    {tab==='rotation' && <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-4">
      <Panel title="Money rotation engine" subtitle="Relative-strength model across infrastructure, compute, memory and software">
        <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={intelligence.groups.filter(g=>g.avgChange!==0 || g.members.some(m=>livePrices[m])).map(g=>({group:g.name,score:Math.round(g.score),avg:g.avgChange}))}><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="group" stroke="#ffffff35" tick={{fontSize:9}} interval={0} angle={-18} textAnchor="end" height={55}/><YAxis stroke="#ffffff35" domain={[0,100]} tick={{fontSize:10}}/><Tooltip contentStyle={{background:'#15181E',border:'1px solid #ffffff20'}} formatter={(v,n,p)=> n==='score' ? [v+'/100','Signal'] : [v+'%','Avg daily return']}/><Bar dataKey="score" fill="#34d399" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
        <div className="text-[10px] text-white/30">Calculated from current daily returns, breadth and relative performance versus the tracked universe. It is a signal, not a claim of literal capital flows.</div>
      </Panel>
      <Panel title="Pair monitor" subtitle="Relationships to test for factor rotation">
        <div className="space-y-2">{intelligence.pairSignals.map(x=><div key={x.left+x.right} className="border border-white/5 rounded-xl p-3"><div className="flex justify-between"><div className="text-xs font-bold">{x.left} ↔ {x.right}</div><div className={'text-[10px] font-mono '+((x.spread ?? 0)>=0?'text-emerald-400':'text-rose-400')}>{x.spread==null?'—':(x.spread>=0?'+':'')+x.spread.toFixed(2)+' pts'}</div></div><div className="text-[10px] text-white/35 mt-1">{x.label}</div></div>)}</div>
      </Panel>
    </div>}

    {tab==='events' && <Panel title="Event study" subtitle="Historical event windows will populate once catalyst dates are paired to verified price history">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Insight title="Data status" body="Live prices are available. Verified event-date price history is the remaining input for T-5 / T0 / T+1 / T+5 / T+20 calculations." icon={<CalendarDays/>}/>
        <Insight title="Method" body="Measure raw return and benchmark-relative return at each window, then compare persistence across repeated event types." icon={<BarChart3/>}/>
        <Insight title="Guardrail" body="Do not treat a single catalyst reaction as causal proof; separate company-specific news from sector and macro moves." icon={<ShieldAlert/>}/>
      </div>
      <div className="mt-4 text-xs text-white/35">Current event examples are retained in code only as a scaffold and are not presented here as verified historical returns.</div>
    </Panel>}

    {tab==='network' && <Panel title="Relationship graph" subtitle="Competition and second-order exposure — click a node"><svg viewBox="0 0 920 420" className="w-full rounded-xl bg-[#0D1015] border border-white/5">{[['NVDA',140,210],['AMD',330,100],['MU',330,320],['META',550,100],['NOW',550,320],['NBIS',790,150],['CRM',790,290]].map(n=><g key={n[0]} onClick={()=>setSelected(n[0])} style={{cursor:'pointer'}}><circle cx={n[1]} cy={n[2]} r="38" fill={selected===n[0]?'#153528':'#15181E'} stroke={selected===n[0]?'#34d399':'#334155'} strokeWidth="2"/><text x={n[1]} y={n[2]+5} textAnchor="middle" fill="white" fontSize="13" fontWeight="700">{n[0]}</text></g>)}<line x1="178" y1="195" x2="292" y2="115" stroke="#34d399" strokeWidth="3"/><line x1="178" y1="225" x2="292" y2="305" stroke="#fbbf24" strokeWidth="2"/><line x1="368" y1="100" x2="512" y2="100" stroke="#60a5fa" strokeWidth="2"/><line x1="368" y1="320" x2="512" y2="320" stroke="#fb7185" strokeWidth="2"/><line x1="588" y1="115" x2="752" y2="145" stroke="#34d399" strokeWidth="2"/><line x1="588" y1="305" x2="752" y2="290" stroke="#fb7185" strokeWidth="2"/></svg><div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3"><Insight title="NVDA ↔ AMD" body="Direct accelerator competition." icon={<Activity/>}/><Insight title="MU ↔ SK Hynix" body="Memory-cycle relationship." icon={<Network/>}/><Insight title="NOW ↔ CRM" body="Enterprise-software relative strength." icon={<FileText/>}/></div></Panel>}

    <div className="text-[10px] text-white/30 flex items-center gap-2"><Globe2 className="w-3 h-3"/> Source-grounded monitoring. Rotation scores are signals, not guaranteed capital-flow predictions.</div>
  </div>;
}

function Panel({title,subtitle,children}:{title:string;subtitle:string;children:React.ReactNode}) {
  return <section className="bg-[#15181E] border border-white/10 rounded-2xl p-5"><div className="mb-4"><div className="text-sm font-bold">{title}</div><div className="text-[11px] text-white/40 mt-1">{subtitle}</div></div>{children}</section>;
}
function Metric({label,value,suffix,tone,icon}:{label:string;value:string;suffix:string;tone:'up'|'down'|'warn';icon?:React.ReactNode}) {
  const c=tone==='up'?'text-emerald-400':tone==='down'?'text-rose-400':'text-amber-300';
  return <div className="bg-white/[.025] border border-white/5 rounded-xl p-3"><div className="flex items-center justify-between text-[9px] uppercase font-mono text-white/30">{label}{icon&&<span className={c}>{icon}</span>}</div><div className={'text-lg font-black mt-2 '+c}>{value}<span className="text-[10px] text-white/30 ml-1">{suffix}</span></div></div>;
}
function Insight({title,body,icon}:{title:string;body:string;icon:React.ReactNode}) {
  return <div className="border border-white/5 rounded-xl p-3"><div className="flex items-center gap-2 text-xs font-bold">{icon}<span>{title}</span></div><div className="text-[10px] text-white/35 mt-2">{body}</div></div>;
}
