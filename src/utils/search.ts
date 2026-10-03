export type SearchableEntity = {
  symbol?: string;
  ticker?: string;
  name?: string;
  title?: string;
  aliases?: string[];
  [key: string]: unknown;
};

export function normalizeSearchQuery(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function scoreSearchMatch(entity: SearchableEntity, query: string): number {
  const q = normalizeSearchQuery(query);
  if (!q) return 0;
  const ticker = normalizeSearchQuery(entity.ticker ?? entity.symbol);
  const name = normalizeSearchQuery(entity.name ?? entity.title);
  const aliases = Array.isArray(entity.aliases) ? entity.aliases.map(normalizeSearchQuery) : [];

  if (ticker === q) return 1000;
  if (name === q) return 900;
  if (aliases.includes(q)) return 850;
  if (ticker.startsWith(q)) return 800;
  if (name.startsWith(q)) return 700;
  if (aliases.some(alias => alias.startsWith(q))) return 650;
  if (ticker.includes(q)) return 600;
  if (name.includes(q)) return 500;
  const tokens = q.split(' ').filter(Boolean);
  const haystack = [name, ...aliases].join(' ');
  const matched = tokens.filter(token => haystack.includes(token)).length;
  return matched ? 300 + matched * 25 : 0;
}

export function rankSearchResults<T extends SearchableEntity>(items: T[], query: string): T[] {
  return items
    .map((item, index) => ({ item, score: scoreSearchMatch(item, query), index }))
    .filter(row => row.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(row => row.item);
}
