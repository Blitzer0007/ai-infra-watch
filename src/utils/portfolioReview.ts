import type { DecisionCardModel, DecisionState } from './decisionCardAdapter';

export type ConfirmedCatalyst = { symbol: string; date: string; source: string; confirmed: boolean };
export type ExplanationLevel = 'simple' | 'advanced';
const priority: Record<DecisionState, number> = { 'RISK REVIEW': 0, 'INSUFFICIENT DATA': 1, 'ADD REVIEW': 2, 'HOLD / WATCH': 3 };

export function filterReviewQueue(positions: DecisionCardModel[], query: string, state: DecisionState | 'all') {
  const term = query.trim().toLowerCase();
  return positions.filter(position => (state === 'all' || position.state === state) &&
    (!term || position.symbol.toLowerCase().includes(term) || position.companyName.toLowerCase().includes(term)))
    .sort((a,b) => priority[a.state] - priority[b.state] || a.symbol.localeCompare(b.symbol));
}

export function selectConfirmedCatalysts(catalysts: ConfirmedCatalyst[], symbols: string[], nowMs: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat('en-US', { year:'numeric', month:'2-digit', day:'2-digit', timeZone }).formatToParts(nowMs);
  const part = (type: string) => parts.find(item => item.type === type)?.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const seen = new Set<string>();
  return catalysts.filter(item => {
    if (!item || item.confirmed !== true || typeof item.source !== 'string' || !item.source.trim() || !symbols.includes(item.symbol)) return false;
    if (typeof item.date !== 'string' || !Number.isFinite(Date.parse(item.date))) return false;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(item.date);
    if (dateOnly && new Date(item.date).toISOString().slice(0,10) !== item.date) return false;
    if (dateOnly ? item.date < today : Date.parse(item.date) < nowMs) return false;
    const key = item.symbol + ':' + item.date + ':' + item.source;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a,b) => Date.parse(a.date) - Date.parse(b.date));
}

export function formatReviewDate(value: string, locale?: string, timeZone?: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Timestamp unavailable';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(timestamp).toLocaleDateString(locale, { timeZone: 'UTC', year:'numeric', month:'short', day:'numeric' }) + ' · time not supplied';
  }
  return new Date(timestamp).toLocaleString(locale, { timeZone });
}
