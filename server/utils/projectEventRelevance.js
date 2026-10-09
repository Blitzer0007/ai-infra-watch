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

function mentionsIdentity(rawText, symbol, profile = {}) {
  const text = String(rawText || '');
  const normalizedText = ' ' + normalizeEntityText(text) + ' ';
  const ticker = String(symbol || '').trim().toUpperCase();
  const normalizedTicker = normalizeEntityText(ticker);
  const aliases = [profile.name, ...(Array.isArray(profile.aliases) ? profile.aliases : [])]
    .map(normalizeEntityText)
    .filter(alias => alias.length >= 3 && alias !== normalizedTicker);
  if (aliases.some(alias => normalizedText.includes(' ' + alias + ' '))) return true;

  // Ticker mentions must be explicit uppercase tokens so ordinary words like
  // "now" don't count as the NOW ticker.
  return ticker.length > 0 &&
    new RegExp('(?:^|[^A-Za-z0-9])' + escapeRegExp(ticker) + '(?:$|[^A-Za-z0-9])').test(text);
}

export function isProjectEventRelevant(symbol, row, profile = {}, knownProfiles = {}) {
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

  const targetInTitle = mentionsIdentity(title, ticker, profile);
  const targetInBody = mentionsIdentity(snippet, ticker, profile);
  if (!targetInTitle && !targetInBody) return false;

  // Search snippets can mention the requested ticker in passing while the
  // article is actually about another company. If a known issuer is named in
  // the headline, require the tracked issuer to be named in the headline too.
  const competingHeadlineEntity = Object.entries(knownProfiles || {}).some(([otherSymbol, otherProfile]) => {
    if (String(otherSymbol).toUpperCase() === ticker) return false;
    return mentionsIdentity(title, otherSymbol, otherProfile);
  });
  if (competingHeadlineEntity && !targetInTitle) return false;

  return true;
}
