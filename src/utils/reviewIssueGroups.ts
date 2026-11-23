import { ledgerIssueLabels, ledgerDetailLabels } from '../../shared/loadedLedgerReview.js';

type Group = {message: string; symbols: string[]; entries: number};
const record = (v: unknown): Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {};
function add(groups: Map<string, Group>, message: string, symbol: unknown) {
  const group = groups.get(message) ?? {message, symbols: [], entries: 0};
  group.entries++;
  if (typeof symbol === 'string' && /^[A-Z0-9.^=-]{1,20}$/.test(symbol) && !group.symbols.includes(symbol)) group.symbols.push(symbol);
  groups.set(message, group);
}
export function groupAccountingIssues(value: unknown): Group[] {
  const groups = new Map<string, Group>();
  for (const v of Array.isArray(value) ? value.slice(0, 250) : []) {
    const entry = record(v);
    const message = Object.hasOwn(ledgerDetailLabels, entry.detailCode) ? ledgerDetailLabels[entry.detailCode]
      : Object.hasOwn(ledgerIssueLabels, entry.code) ? ledgerIssueLabels[entry.code]
      : entry.code === 'QUOTE_WITHHELD' ? 'A quote was withheld. Check source metadata and the provider diagnostics.'
      : 'An accounting input needs review.';
    add(groups, message, entry.symbol);
  }
  return [...groups.values()];
}
export function groupRuleIssues(value: unknown): Group[] {
  const groups = new Map<string, Group>();
  for (const v of Array.isArray(value) ? value.slice(0, 150) : []) {
    const entry = record(v);
    for (const message of new Set(Array.isArray(entry.issues) ? entry.issues : [])) {
      if (typeof message === 'string' && message.length > 0 && message.length <= 1000) add(groups, message, entry.symbol);
    }
  }
  return [...groups.values()];
}
