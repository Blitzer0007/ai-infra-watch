import { useId } from 'react';
import { ChevronRight, Compass, FlaskConical } from 'lucide-react';

export const PORTFOLIO_SECTIONS = [
  {id:'overview',label:'Daily Review',description:'Review the queue and choose the next task.'},
  {id:'holdings',label:'My Holdings',description:'Find a holding, inspect its detail, or manage positions and purchases.'},
  {id:'performance',label:'Performance',description:'Review cash flows, returns, benchmarks, and portfolio risk.'},
  {id:'evidence',label:'Evidence',description:'Inspect data coverage, decision context, and signal evidence.'},
  {id:'watchlist',label:'Watchlist',description:'Explore the configured research universe.'},
  {id:'events',label:'Events',description:'Study dated events for a selected holding.'},
  {id:'rotation',label:'Money Flow',description:'Compare group-level rotation and market context.'},
  {id:'network',label:'Connections',description:'Inspect peer relationships for a selected holding.'},
  {id:'research',label:'Portfolio Research',description:'Open the dedicated portfolio research tools.'},
] as const;

export type PortfolioTab = typeof PORTFOLIO_SECTIONS[number]['id'];
export const portfolioTabFromValue = (value: unknown): PortfolioTab =>
  PORTFOLIO_SECTIONS.find(item => item.id === value)?.id || 'overview';

export default function PortfolioNavigation({tab, onChange}:{
  tab:PortfolioTab; onChange:(tab:PortfolioTab)=>void;
}) {
  const id = useId();
  const primary = PORTFOLIO_SECTIONS.slice(0, 4);
  const advanced = PORTFOLIO_SECTIONS.slice(4);
  const selected = PORTFOLIO_SECTIONS.find(item => item.id === tab) ?? primary[0];
  const inResearch = advanced.some(item => item.id === tab);
  const tabClass = (active:boolean) => `group flex min-w-0 flex-col items-start gap-1.5 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${active
    ? 'border-cyan-300/40 bg-cyan-300/[0.11] text-white'
    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:bg-white/[0.07]'}`;
  return <div data-testid="portfolio-navigation" className="space-y-3">
    <div className="aiw-portfolio-jump rounded-2xl border border-white/10 bg-[#151e2a] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
          <Compass aria-hidden="true" className="h-4 w-4 text-cyan-300"/>
          Portfolio workspaces
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-400">
          {inResearch ? 'Research' : 'Core'} workspace
        </span>
      </div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300 md:sr-only">Portfolio section</label>
      <select
        id={id}
        value={tab}
        onChange={event => onChange(portfolioTabFromValue(event.target.value))}
        className="min-h-11 w-full min-w-0 rounded-xl border border-white/25 bg-[#0e1721] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
      >
        <optgroup label="Daily tasks">
          {primary.map(item=><option key={item.id} value={item.id}>{`Go to ${item.label}`}</option>)}
        </optgroup>
        <optgroup label="Research tools">
          {advanced.map(item=><option key={item.id} value={item.id}>{`Go to ${item.label}`}</option>)}
        </optgroup>
      </select>
      <nav aria-label="Portfolio workspaces" className="hidden space-y-3 md:block">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {primary.map((item,index)=><button
            type="button"
            key={item.id}
            onClick={()=>onChange(item.id)}
            aria-label={item.label}
            aria-current={tab===item.id?'page':undefined}
            aria-pressed={tab===item.id}
            className={tabClass(tab===item.id)}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300/70">{String(index+1).padStart(2,'0')}</span>
            <span className="text-sm font-semibold">{item.label}</span>
            <span className="text-xs leading-relaxed text-slate-400">{item.description}</span>
          </button>)}
        </div>
        <details open className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            <FlaskConical aria-hidden="true" className="h-4 w-4 text-cyan-300"/>
            Research tools
            <span className="ml-auto text-xs text-slate-400">{advanced.length} workspaces</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 text-slate-400"/>
          </summary>
          <div className="grid gap-2 pb-1 pt-3 sm:grid-cols-2 xl:grid-cols-3">
            {advanced.map(item=><button
              type="button"
              key={item.id}
              onClick={()=>onChange(item.id)}
              aria-label={item.label}
              aria-current={tab===item.id?'page':undefined}
              aria-pressed={tab===item.id}
              className={tabClass(tab===item.id)}
            >
              <span className="text-sm font-semibold">{item.label}</span>
              <span className="text-xs leading-relaxed text-slate-400">{item.description}</span>
            </button>)}
          </div>
        </details>
      </nav>
      <p className="mt-3 text-xs leading-relaxed text-slate-400" data-testid="portfolio-current-section">
        <span className="font-semibold text-slate-200">{selected.label}:</span> {selected.description}
      </p>
    </div>
  </div>;
}
