import {
  Activity, BadgePercent, BookOpen, Bot, Calendar, Database, FileText,
  Grid, Search, Settings, ShieldAlert, TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  WORKSPACE_GROUPS, WORKSPACE_VIEWS, type WorkspaceId,
} from '../../utils/workspaceNavigation';

const ICONS: Record<WorkspaceId, LucideIcon> = {
  overview: Grid,
  opportunities: Search,
  calendar: Calendar,
  alerts: ShieldAlert,
  portfolio: TrendingUp,
  watchlist: Activity,
  'jev-lab': Bot,
  outlook: TrendingUp,
  contracts: FileText,
  tracker: Calendar,
  congress: BadgePercent,
  macro: ShieldAlert,
  research: Search,
  quality: Bot,
  health: Database,
  guide: BookOpen,
  settings: Settings,
};

type Props = {
  activeView: string;
  onNavigate: (view: string) => void;
  variant: 'desktop' | 'mobile';
};

export default function WorkspaceNavigation({activeView, onNavigate, variant}: Props) {
  return <nav aria-label={variant === 'desktop' ? 'Application navigation' : 'Mobile application navigation'}
    className="aiw-nav-list flex min-w-0 flex-col gap-5"
    data-testid={variant === 'desktop' ? 'app-navigation-desktop' : 'app-navigation-mobile'}>
    {WORKSPACE_GROUPS.map(group => {
      const pages = WORKSPACE_VIEWS.filter(item => item.group === group.id);
      return <section key={group.id} aria-label={group.label + ' workspaces'} className="aiw-nav-group min-w-0">
        <div className="aiw-nav-group-label flex items-center justify-between gap-2 px-3 pb-2">
          <span>{group.label}</span>
        </div>
        <div className="space-y-1">
          {pages.map(page => {
            const Icon = ICONS[page.id];
            const selected = activeView === page.id;
            return <button key={page.id} type="button"
              data-testid={variant === 'desktop' ? 'nav-' + page.id : 'mobile-nav-' + page.id}
              title={page.description} aria-current={selected ? 'page' : undefined}
              onClick={() => onNavigate(page.id)}
              className={'aiw-nav-entry flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors ' +
                (selected ? 'aiw-nav-entry--active' : '')}>
              <Icon aria-hidden="true" size={18} className="shrink-0 opacity-80"/>
              <span className="min-w-0 flex-1">{page.label}</span>
            </button>;
          })}
        </div>
      </section>;
    })}
  </nav>;
}
