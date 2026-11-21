import { ArrowUpRight } from 'lucide-react';
import { WORKSPACE_VIEWS, workspaceById } from '../../utils/workspaceNavigation';

export default function WorkspaceHeader({view, onNavigate}: {
  view: string; onNavigate: (view: string) => void;
}) {
  const selected = workspaceById(view);
  const next = selected.related
    .map(id => WORKSPACE_VIEWS.find(item => item.id === id))
    .filter((item): item is typeof WORKSPACE_VIEWS[number] => Boolean(item))
    .slice(0, 3);
  return <header className="aiw-workspace-header" data-testid="workspace-context">
    <div className="min-w-0">
      <p data-testid="workspace-title" className="aiw-workspace-title">{selected.label}</p>
      <p className="aiw-workspace-description">{selected.description}</p>
    </div>
    <nav aria-label="Suggested next workspaces" className="aiw-related-workspaces">
      {next.map(item => <button key={item.id} type="button"
        aria-label={'Go to ' + item.label}
        onClick={() => onNavigate(item.id)} className="aiw-workspace-shortcut">
        <span>{item.label}</span><ArrowUpRight aria-hidden="true" size={14}/>
      </button>)}
    </nav>
  </header>;
}
