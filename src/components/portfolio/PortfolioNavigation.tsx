import { useId } from 'react';
export const PORTFOLIO_SECTIONS = [
  {id:'overview',label:'Daily Review',description:'Review the queue and choose the next task.'},
  {id:'holdings',label:'My Holdings',description:'Find a holding, inspect its detail, or manage positions and purchases.'},
  {id:'performance',label:'Performance',description:'Review cash flows, returns, benchmarks, and portfolio risk.'},
  {id:'evidence',label:'Evidence',description:'Inspect data coverage, decision context, and signal evidence.'},
  {id:'watchlist',label:'Watchlist',description:'Explore the configured research universe.'},
  {id:'events',label:'Events',description:'Study dated events for a selected holding.'},
  {id:'radar',label:'Event Risk Radar',description:'Review fictional emerging concerns, priority sources and counter-evidence. Live monitoring is not configured.'},
  {id:'rotation',label:'Money Flow',description:'Compare group-level rotation and market context.'},
  {id:'network',label:'Connections',description:'Inspect peer relationships for a selected holding.'},
  {id:'research',label:'Portfolio Research',description:'Open the dedicated portfolio research tools.'},
] as const;
export type PortfolioTab = typeof PORTFOLIO_SECTIONS[number]['id'];
export const portfolioTabFromValue = (value: unknown): PortfolioTab => PORTFOLIO_SECTIONS.find(item=>item.id===value)?.id || 'overview';
export default function PortfolioNavigation({ tab, onChange }: { tab: PortfolioTab; onChange: (tab: PortfolioTab)=>void }) {
  const id=useId();
  const primary=PORTFOLIO_SECTIONS.slice(0,4);
  const advanced=PORTFOLIO_SECTIONS.slice(4);
  return <>
    <div data-testid="portfolio-navigation" className="aiw-portfolio-jump flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/20 bg-[#15181e] p-3">
      <label htmlFor={id} className="text-sm font-semibold">Portfolio section</label>
      <select id={id} value={tab} onChange={event=>onChange(portfolioTabFromValue(event.target.value))} className="min-w-0 w-full rounded-lg border border-white/25 bg-[#15181e] px-3 py-2 text-sm sm:w-auto">
        <optgroup label="Daily tasks">{primary.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
        <optgroup label="Research tools">{advanced.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
      </select>
    </div>
    <nav aria-label="Portfolio workspaces" className="hidden space-y-3 md:block">
      <div className="grid grid-cols-4 gap-2">{primary.map(item=><button type="button" key={item.id} onClick={()=>onChange(item.id)} aria-current={tab===item.id?'page':undefined} aria-pressed={tab===item.id} className={'rounded-lg border px-3 py-3 text-sm font-semibold '+(tab===item.id?'border-cyan-200/50 bg-cyan-200/10 text-cyan-100':'border-white/15 text-white/75 hover:bg-white/5')}>{item.label}</button>)}</div>
      <details open={advanced.some(item=>item.id===tab)||undefined} className="rounded-lg border border-white/10 px-3">
        <summary className="cursor-pointer text-sm text-white/75">Research tools</summary>
        <div className="flex flex-wrap gap-2 pb-3">{advanced.map(item=><button type="button" key={item.id} onClick={()=>onChange(item.id)} aria-current={tab===item.id?'page':undefined} className={'rounded-lg border px-3 py-2 text-sm '+(tab===item.id?'border-cyan-200/50 text-cyan-100':'border-white/15 text-white/75')}>{item.label}</button>)}</div>
      </details>
    </nav>
  </>;
}
