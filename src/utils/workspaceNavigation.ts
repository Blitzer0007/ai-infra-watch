// The 17 existing browser routes are grouped by user task, not by implementation.
// This registry is presentation-only: route identifiers and query/history
// semantics remain owned by App and its individual workspaces.
export const WORKSPACE_GROUPS = [
  { id: 'today', label: 'Today', description: 'Start with your next review' },
  { id: 'portfolio', label: 'Portfolio', description: 'Holdings and decisions' },
  { id: 'research', label: 'Research', description: 'Source-backed context' },
  { id: 'operations', label: 'Operations', description: 'Quality and controls' },
] as const;

export type WorkspaceGroupId = typeof WORKSPACE_GROUPS[number]['id'];

export const WORKSPACE_VIEWS = [
  { id: 'overview', label: 'Overview', group: 'today',
    description: 'Your daily command desk for portfolio priorities and market context.',
    related: ['portfolio', 'opportunities', 'health'] },
  { id: 'opportunities', label: 'Opportunities', group: 'today',
    description: 'Review candidates and the evidence still required before acting.',
    related: ['portfolio', 'research', 'quality'] },
  { id: 'calendar', label: 'Catalyst Calendar', group: 'today',
    description: 'Plan around sourced events, confirmed dates, and upcoming reviews.',
    related: ['alerts', 'portfolio', 'watchlist'] },
  { id: 'alerts', label: 'Alert Inbox', group: 'today',
    description: 'Triage actionable notices without losing source and freshness context.',
    related: ['health', 'portfolio', 'calendar'] },
  { id: 'portfolio', label: 'Portfolio Intelligence', group: 'portfolio',
    description: 'Inspect holdings, evidence readiness, review queues, and exposure.',
    related: ['watchlist', 'outlook', 'jev-lab'] },
  { id: 'watchlist', label: 'Watchlist', group: 'portfolio',
    description: 'Monitor selected symbols, rules, and earnings notifications.',
    related: ['calendar', 'portfolio', 'alerts'] },
  { id: 'jev-lab', label: 'JEV Portfolio Lab', group: 'portfolio',
    description: 'Explore paper scenarios and evidence-gated Bull/Bear/Judge reviews.',
    related: ['quality', 'portfolio', 'outlook'] },
  { id: 'outlook', label: 'Forward Outlook', group: 'portfolio',
    description: 'Review forecast ranges, uncertainty, and historical validation.',
    related: ['quality', 'portfolio', 'health'] },
  { id: 'contracts', label: 'Contracts', group: 'research',
    description: 'Trace contracts and infrastructure announcements back to sources.',
    related: ['tracker', 'portfolio', 'research'] },
  { id: 'tracker', label: 'Progress Tracker', group: 'research',
    description: 'Follow company milestones, changes, and supporting evidence.',
    related: ['contracts', 'research', 'calendar'] },
  { id: 'congress', label: 'Congress Trades', group: 'research',
    description: 'Inspect disclosed transactions and their reporting limitations.',
    related: ['macro', 'research', 'tracker'] },
  { id: 'macro', label: 'Macro & Politics', group: 'research',
    description: 'Understand policy, demand, and macro risks around the AI ecosystem.',
    related: ['outlook', 'research', 'portfolio'] },
  { id: 'research', label: 'AI Research', group: 'research',
    description: 'Compare research leads, primary sources, and agent-produced context.',
    related: ['contracts', 'quality', 'tracker'] },
  { id: 'quality', label: 'AI Quality Lab', group: 'operations',
    description: 'Inspect model evaluations, source quality, and unresolved evidence.',
    related: ['health', 'jev-lab', 'research'] },
  { id: 'health', label: 'Data Health', group: 'operations',
    description: 'Audit freshness, provider coverage, fallbacks, and operating status.',
    related: ['quality', 'alerts', 'overview'] },
  { id: 'guide', label: 'How to Use', group: 'operations',
    description: 'Learn the application workflow and definitions of key concepts.',
    related: ['overview', 'settings', 'health'] },
  { id: 'settings', label: 'Settings', group: 'operations',
    description: 'Manage personal preferences, watchlists, and notification controls.',
    related: ['guide', 'health', 'alerts'] },
] as const satisfies ReadonlyArray<{
  id: string; label: string; group: WorkspaceGroupId;
  description: string; related: readonly string[];
}>;

export type WorkspaceId = typeof WORKSPACE_VIEWS[number]['id'];

export function workspaceById(value: unknown) {
  return WORKSPACE_VIEWS.find(item => item.id === value) ?? WORKSPACE_VIEWS[0];
}

export function workspaceGroupById(value: WorkspaceGroupId) {
  return WORKSPACE_GROUPS.find(group => group.id === value) ?? WORKSPACE_GROUPS[0];
}
