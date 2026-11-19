import { ArrowUpRight, Compass, Layers3 } from 'lucide-react';
import { WORKSPACE_VIEWS, workspaceById, workspaceGroupById } from '../../utils/workspaceNavigation';

export default function WorkspaceHeader({view, onNavigate}: {
  view: string; onNavigate: (view: string) => void;
}) {
  const selected = workspaceById(view);
  const group = workspaceGroupById(selected.group);
  const next = selected.related
    .map(id => WORKSPACE_VIEWS.find(item => item.id === id))
    .filter((item): item is typeof WORKSPACE_VIEWS[number] => Boolean(item))
    .slice(0, 3);
  return <header className={'aiw-workspace-header aiw-workspace-header--' + selected.group}
    data-testid="workspace-context">
    <div className="aiw-workspace-header-top flex min-w-0 flex-wrap items-center justify-between gap-2">
      <nav aria-label="Workspace location" className="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-400">
        <Compass aria-hidden="true" size={15} className="text-cyan-300"/>
        <span>AI Infra Watch</span>
        <span aria-hidden="true" className="text-slate-600">/</span>
        <span className="text-slate-200">{group.label}</span>
      </nav>
      <span className="aiw-workspace-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-slate-300">
        <Layers3 aria-hidden="true" size={13}/>
        {group.description}
      </span>
    </div>
    <div className="mt-5 flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <p data-testid="workspace-title"
          className="aiw-workspace-title break-words text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {selected.label}
        </p>
        <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-slate-300">
          {selected.description}
        </p>
      </div>
      <nav aria-label="Suggested next workspaces"
        className="flex min-w-0 flex-wrap gap-2 xl:max-w-[42%] xl:justify-end">
        {next.map(item => <button key={item.id} type="button"
          onClick={() => onNavigate(item.id)}
          className="aiw-workspace-shortcut inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold">
          <span>Go to {item.label}</span>
          <ArrowUpRight aria-hidden="true" size={13}/>
        </button>)}
      </nav>
    </div>
  </header>;
}
