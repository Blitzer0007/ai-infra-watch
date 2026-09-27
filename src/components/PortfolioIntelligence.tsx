import { useMemo, useState } from 'react';
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

const EVENTS = [
  { t:'NVDA', date:'2026-06-03', title:'AI compute / Vera Rubin catalyst', kind:'AI compute', window:[-2,1,4,7,6,3] },
  { t:'NBIS', date:'2026-03-16', title:'Meta AI infrastructure agreement', kind:'Contract', window:[-1,2,9,8,6,10] },
  { t:'DGXX', date:'2026-04-20', title:'SubQ AI GPU contract', kind:'Contract', window:[-2,4,18,10,7,5] },
  { t:'META', date:'2026-09-21', title:'AI-led momentum session', kind:'Market', window:[0,2,11,7,5,3] },
  { t:'PHVS', date:'2026-09-08', title:'Phase 3 clinical data', kind:'Clinical', window:[-1,2,7,4,-3,-1] },
];

const ROTATION = [
  { d:'T-20', infra:48, compute:54, software:61, memory:50 },
  { d:'T-10', infra:56, compute:58, software:57, memory:55 },
  { d:'T-5', infra:63, compute:66, software:50, memory:61 },
  { d:'T0', infra:72, compute:79, software:44, memory:68 },
  { d:'T+1', infra:76, compute:81, software:42, memory:71 },
  { d:'T+5', infra:81, compute:74, software:39, memory:76 },
  { d:'T+20', infra:84, compute:70, software:36, memory:79 },
];

export default function PortfolioIntelligence({ livePrices = {} }: Props) {
  const [tab,setTab] = useState('overview');
  const [q,setQ] = useState('');
  const [group,setGroup] = useState('All');
  const [selected,setSelected] = useState('NVDA');
  const [event,setEvent] = useState(EVENTS[1]);

  const price = (t:string) => livePrices[t];
  const filtered = useMemo(() => PORTFOLIO.filter(h => (group === 'All' || h.group === group) && (h.t + ' ' + h.theme).toLowerCase().includes(q.toLowerCase())), [q,group]);
  const breadth = PORTFOLIO.filter(h => (price(h.t)?.changePct ?? 0) >= 0).length;
  const sel = PORTFOLIO.find(h => h.t === selected) || PORTFOLIO[0];

  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="text-[10px] font-mono tracking-[.2em] uppercase text-emerald-400">AI INFRA WATCH / PORTFOLIO INTELLIGENCE</div><div className="text-2xl font-black mt-2">Portfolio + Watchlist Rotation Lab</div><div className="text-xs text-white/45 mt-1">Contracts · geopolitics · earnings · peers · event reaction · rotation</div></div>
      <div className="flex gap-2 text-[10px] font-mono text-white/40"><span className="px-2 py-1 rounded-full border border-white/10">BREADTH {breadth}/10</span><span className="px-2 py-1 rounded-full border border-white/10">LIVE FEED</span></div>
    </div>

    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Metric label="AI infra pulse" value="84" suffix="/100" tone="up" icon={<Zap/>}/>
      <Metric label="Compute pulse" value="70" suffix="/100" tone="up" icon={<Activity/>}/>
      <Metric label="Software spread" value="-18" suffix=" pts" tone="down" icon={<TrendingDown/>}/>
      <Metric label="Geopolitical risk" value="HIGH" suffix="" tone="warn" icon={<ShieldAlert/>}/>
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
        <div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={ROTATION}><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="d" stroke="#ffffff35" tick={{fontSize:10}}/><YAxis stroke="#ffffff35" domain={[20,90]} tick={{fontSize:10}}/><Tooltip contentStyle={{background:'#15181E',border:'1px solid #ffffff20'}}/><Area dataKey="infra" stroke="#34d399" fill="#34d39912" strokeWidth={3}/><Area dataKey="compute" stroke="#60a5fa" fill="#60a5fa08" strokeWidth={2}/><Area dataKey="software" stroke="#fb7185" fill="#fb718508" strokeWidth={2}/><Area dataKey="memory" stroke="#fbbf24" fill="#fbbf2408" strokeWidth={2}/></AreaChart></ResponsiveContainer></div>
        <div className="text-[10px] text-white/30">Production version should calculate this from live price/volume, sector ETFs, peer spreads and event persistence.</div>
      </Panel>
      <Panel title="Pair monitor" subtitle="Relationships to test for factor rotation">
        <div className="space-y-2">{[['NVDA','AMD','Accelerator competition'],['NOW','CRM','Enterprise software breadth'],['MU','000660.KS','Memory cycle'],['NBIS','IREN','AI infrastructure'],['DGXX','CIFR','Power-to-compute'],['META','GOOGL','AI platform capex']].map(x=><div key={x[0]} className="border border-white/5 rounded-xl p-3"><div className="text-xs font-bold">{x[0]} ↔ {x[1]}</div><div className="text-[10px] text-white/35 mt-1">{x[2]}</div></div>)}</div>
      </Panel>
    </div>}

    {tab==='events' && <div className="grid grid-cols-1 xl:grid-cols-[.8fr_1.2fr] gap-4">
      <Panel title="Event library" subtitle="Historical price response around catalysts"><div className="space-y-2">{EVENTS.map(e=><button key={e.t+e.date} onClick={()=>setEvent(e)} className={'w-full text-left border rounded-xl p-3 '+(event.t===e.t&&event.date===e.date?'border-emerald-400/30 bg-emerald-400/5':'border-white/5')}><div className="flex justify-between"><b className="text-xs">{e.t}</b><span className="text-[9px] text-white/25">{e.date}</span></div><div className="text-xs mt-1">{e.title}</div><div className="text-[9px] text-white/30 mt-1">{e.kind}</div></button>)}</div></Panel>
      <Panel title={event.t+' event window'} subtitle="T-5 → T+20 persistence test"><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={event.window.map((r,i)=>({w:['T-5','T-1','T0','T+1','T+5','T+20'][i],r}))}><CartesianGrid stroke="#ffffff10" vertical={false}/><XAxis dataKey="w" stroke="#ffffff35" tick={{fontSize:10}}/><YAxis stroke="#ffffff35" tick={{fontSize:10}}/><Tooltip contentStyle={{background:'#15181E',border:'1px solid #ffffff20'}}/><Bar dataKey="r" fill="#34d399" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div><div className="grid grid-cols-3 gap-2"><Metric label="T0" value={(event.window[2]>=0?'+':'')+event.window[2]} suffix="%" tone={event.window[2]>=0?'up':'down'}/><Metric label="T+5" value={(event.window[4]>=0?'+':'')+event.window[4]} suffix="%" tone={event.window[4]>=0?'up':'down'}/><Metric label="T+20" value={(event.window[5]>=0?'+':'')+event.window[5]} suffix="%" tone={event.window[5]>=0?'up':'down'}/></div></Panel>
    </div>}

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
