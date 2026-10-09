function normalizeEntityText(value) {
  return String(value || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isProjectEventRelevant(symbol, row, profile = {}) {
  const ticker = String(symbol || '').trim().toUpperCase();
  const title = String(row?.title || '').trim();
  const snippet = String(row?.snippet || row?.description || row?.content || '').trim();
  const url = String(row?.url || '').trim();
  if (!ticker || (!title && !snippet)) return false;

  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // A source without a parseable URL cannot qualify as an official-domain match.
  }

  const officialDomains = Array.isArray(profile.domains) ? profile.domains : [];
  if (officialDomains.some(domain => {
    const normalizedDomain = String(domain || '').trim().toLowerCase().replace(/^www\./, '');
    return normalizedDomain && (host === normalizedDomain || host.endsWith('.' + normalizedDomain));
  })) return true;

  const haystack = normalizeEntityText(title + ' ' + snippet);
  const normalizedTicker = normalizeEntityText(ticker);
  const aliases = [profile.name, ...(Array.isArray(profile.aliases) ? profile.aliases : [])]
    .map(normalizeEntityText)
    .filter(alias => alias.length >= 3 && alias !== normalizedTicker);
  if (aliases.some(alias => (' ' + haystack + ' ').includes(' ' + alias + ' '))) return true;

  // Tickers are only matched in their uppercase ticker form. This avoids false
  // positives for short symbols such as NOW, MU, or AMD used as ordinary words.
  const rawText = title + ' ' + snippet;
  return new RegExp('(?:^|[^A-Za-z0-9])' + escapeRegExp(ticker) + '(?:$|[^A-Za-z0-9])').test(rawText);
}
