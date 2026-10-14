export const TRACKER_SYMBOLS_STORAGE_KEY = 'aiw-progress-tracker-symbols-v1';

export function normalizeTicker(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

export function loadTickerShortcuts(defaults: string[] = []): string[] {
  try {
    const raw = localStorage.getItem(TRACKER_SYMBOLS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [...new Set(defaults.map(normalizeTicker).filter(Boolean))];
    return [...new Set(parsed.filter((value): value is string => typeof value === 'string').map(normalizeTicker).filter(Boolean))];
  } catch {
    return [...new Set(defaults.map(normalizeTicker).filter(Boolean))];
  }
}

export function saveTickerShortcuts(symbols: string[]): void {
  try {
    localStorage.setItem(
      TRACKER_SYMBOLS_STORAGE_KEY,
      JSON.stringify([...new Set(symbols.map(normalizeTicker).filter(Boolean))])
    );
  } catch {
    // Browser storage is optional; callers should keep the in-memory state usable.
  }
}

export function addTickerShortcut(symbol: string, defaults: string[] = []): string[] {
  const normalized = normalizeTicker(symbol);
  const next = loadTickerShortcuts(defaults);
  if (normalized && !next.includes(normalized)) next.push(normalized);
  saveTickerShortcuts(next);
  window.dispatchEvent(new CustomEvent('aiw-ticker-shortcuts-changed', { detail: { symbol: normalized } }));
  return next;
}

export function removeTickerShortcut(symbol: string, defaults: string[] = []): string[] {
  const normalized = normalizeTicker(symbol);
  const next = loadTickerShortcuts(defaults).filter(item => item !== normalized);
  saveTickerShortcuts(next);
  window.dispatchEvent(new CustomEvent('aiw-ticker-shortcuts-changed', { detail: { symbol: normalized } }));
  return next;
}
