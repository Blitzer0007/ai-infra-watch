import type { Milestone } from '../types';

const TRACKER_ALIASES: Record<string, string[]> = {
  DGXX: ['Digi Power X', 'DigiPower X', 'Digihost Technology'],
  NBIS: ['Nebius', 'Nebius Group'],
  NVDA: ['NVIDIA', 'Nvidia Corporation'],
  MU: ['Micron', 'Micron Technology'],
  AMD: ['Advanced Micro Devices'],
  META: ['Meta', 'Meta Platforms'],
  MSFT: ['Microsoft'],
  GOOG: ['Google', 'Alphabet'],
  GOOGL: ['Google', 'Alphabet'],
  NOW: ['ServiceNow'],
  SNDK: ['SanDisk', 'Western Digital'],
  AMPG: ['AmpliTech', 'AmpliTech Group'],
  CERE: ['Cerebras', 'Cerebras Systems'],
  VIVO: ['VivoPower'],
  IREN: ['IREN', 'Iris Energy'],
  CIFR: ['Cipher Mining'],
  TSM: ['TSMC', 'Taiwan Semiconductor'],
  AMZN: ['Amazon', 'AWS'],
  PLTR: ['Palantir'],
  APLD: ['Applied Digital'],
  DELL: ['Dell Technologies'],
  IBM: ['IBM'],
  QCOM: ['Qualcomm'],
  INTC: ['Intel'],
  ONDS: ['Ondas'],
};

const KNOWN_COMPANIES: Record<string, string[]> = {
  ...TRACKER_ALIASES,
  CRM: ['Salesforce'],
  SPXC: ['SPX Technologies'],
};

function normalizeWords(value: string): string {
  return String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.split('').map(character =>
    /[A-Z0-9]/i.test(character) ? character : String.fromCharCode(92) + character
  ).join('');
}

function mentionsTicker(text: string, ticker: string): boolean {
  const normalizedTicker = ticker.trim().toUpperCase();
  return normalizedTicker.length > 0 &&
    new RegExp('(?:^|[^A-Za-z0-9])' + escapeRegExp(normalizedTicker) + '(?:$|[^A-Za-z0-9])').test(text);
}

function mentionsCompany(text: string, ticker: string, companyName = ''): boolean {
  const haystack = ' ' + normalizeWords(text) + ' ';
  const normalizedTicker = normalizeWords(ticker);
  const aliases = [
    ...(TRACKER_ALIASES[ticker] || []),
    companyName,
  ].map(normalizeWords).filter(alias => alias.length >= 3 && alias !== normalizedTicker);

  if (aliases.some(alias => haystack.includes(' ' + alias + ' '))) return true;
  return mentionsTicker(text, ticker);
}

function headlineNamesAnotherCompany(title: string, ticker: string): boolean {
  const normalizedTicker = ticker.toUpperCase();
  const haystack = ' ' + normalizeWords(title) + ' ';
  return Object.entries(KNOWN_COMPANIES).some(([otherTicker, aliases]) => {
    if (otherTicker === normalizedTicker) return false;
    return aliases.some(alias => haystack.includes(' ' + normalizeWords(alias) + ' '));
  });
}

/**
 * Final UI-side safety check for incoming tracker events.
 * The API is also expected to filter by issuer, but incorrect/mis-tagged
 * search results must never be rendered or assigned a price in the browser.
 */
export function isTrackerEventRelevantToTicker(
  event: Pick<Milestone, 'stockSymbol' | 'title' | 'description' | 'sourceType'>,
  ticker: string,
  companyName = '',
): boolean {
  const selectedTicker = String(ticker || '').trim().toUpperCase();
  if (!selectedTicker || String(event.stockSymbol || '').trim().toUpperCase() !== selectedTicker) return false;

  // SEC filings and verified posts from the tracked issuer can be generic in title.
  if (event.sourceType === 'sec-primary' ||
      event.sourceType === 'official-company' ||
      event.sourceType === 'official-social') return true;

  const title = String(event.title || '');
  const description = String(event.description || '');
  const titleMatches = mentionsCompany(title, selectedTicker, companyName);
  const bodyMatches = mentionsCompany(description, selectedTicker, companyName);

  // A missing sourceType is normally reserved for curated milestones. However,
  // some cached/legacy discovery rows lack metadata; never let a clearly
  // different issuer's headline leak into the selected ticker's timeline.
  if (!event.sourceType) {
    if (headlineNamesAnotherCompany(title, selectedTicker) && !titleMatches) return false;
    return true;
  }

  if (!titleMatches && !bodyMatches) return false;

  // If the headline identifies a different known company, a mention buried only
  // in the summary isn't sufficient. Require the tracked ticker/company in title.
  if (headlineNamesAnotherCompany(title, selectedTicker) && !titleMatches) return false;

  return true;
}
