import { WatchlistItem } from './types';
import { parseQuoteObservation } from './utils/quoteObservation';
import { quoteSourceMetadata, providerObservationInstant } from './utils/quoteSourceMetadata';

export interface AppConfig {
  finnhubKey: string;
  // Stocks monitored for alerts and watchlist attention.
  watchlist: string[];
  // Stocks pinned to the three Overview favorite cards.
  overviewFavorites: string[];
  alerts: { symbol: string; targetPrice: number; type: 'above' | 'below'; active: boolean }[];
  largeMoveEnabled: boolean;
  largeMovePct: number;
  browserNotifications: boolean;
  catalystAlerts: boolean;
}

const CONFIG_KEY = 'aiw_config_v1';

export const DEFAULT_CONFIG: AppConfig = {
  finnhubKey: '',
  watchlist: ['NVDA', 'NBIS', 'DGXX', 'MU', 'AMD'],
  overviewFavorites: ['NVDA', 'NBIS', 'DGXX'],
  alerts: [
    { symbol: 'DGXX', targetPrice: 5.0, type: 'above', active: true },
    { symbol: 'NBIS', targetPrice: 20.0, type: 'below', active: false }
  ],
  largeMoveEnabled: true,
  largeMovePct: 5,
  browserNotifications: false,
  catalystAlerts: true
};

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    const legacyFavorites = Array.isArray(parsed?.overviewFavorites)
      ? parsed.overviewFavorites
      : Array.isArray(parsed?.watchlist)
        ? parsed.watchlist.slice(0, 3)
        : DEFAULT_CONFIG.overviewFavorites;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      watchlist: Array.isArray(parsed?.watchlist) ? parsed.watchlist : DEFAULT_CONFIG.watchlist,
      overviewFavorites: [...new Set(legacyFavorites.map((value: unknown) => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 3),
    };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

export function getOverviewFavorites(config: AppConfig): string[] {
  const favorites = Array.isArray(config.overviewFavorites) ? config.overviewFavorites : [];
  return [...new Set(favorites.map(value => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 3);
}

export function saveConfig(cfg: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  try {
    window.dispatchEvent(new CustomEvent('aiw-config-changed', { detail: cfg }));
  } catch {
    // Server synchronization is handled by the authenticated app shell.
  }
}

export function formatPrice(p: number | undefined): string {
  if (p === undefined || isNaN(p)) return '—';
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPct(p: number | undefined): string {
  if (p === undefined || isNaN(p)) return '—';
  const prefix = p >= 0 ? '+' : '';
  return `${prefix}${p.toFixed(2)}%`;
}

export async function fetchLiveQuote(symbol: string, apiKey: string, forceRefresh = false): Promise<{
  price: number;
  changePct: number;
  low: number | null;
  high: number | null;
  prevClose: number | null;
  source: 'live';
  provider?: string;
  retrievedAt?: string;
  currency?: string | null;
  isMarketSessionOpen?: boolean | null;
  status?: string;
  simulated?: boolean;
  fallbackUsed?: boolean;
  marketTime?: string | null;
  asOf?: string | null;
  stale?: boolean;
  cached?: boolean;
} & ReturnType<typeof quoteSourceMetadata>> {
  if (!apiKey) {
    const res = await fetch(
      '/api/quote?symbol=' + encodeURIComponent(symbol) + (forceRefresh ? '&refresh=true' : ''),
      { cache: forceRefresh ? 'no-store' : 'default' }
    );
    if (!res.ok) throw new Error('Server quote request failed: HTTP ' + res.status);
    const data = await res.json();
    const observed = parseQuoteObservation(data, symbol);
    if (!observed) throw new Error('Server quote returned no usable price and daily move');
    return {
      ...quoteSourceMetadata(data),
      ...observed,
      source: 'live',
      provider: data.provider,
      retrievedAt: data.retrievedAt,
      currency: data.currency,
      isMarketSessionOpen: data.isMarketSessionOpen,
      status: data.status,
      simulated: data.simulated,
      fallbackUsed: data.fallbackUsed,
      marketTime: data.marketTime,
      asOf: data.asOf,
      stale: data.stale === true,
      cached: data.cached === true
    };
  }

  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
    if (!res.ok) throw new Error('Network error from Finnhub API');
    const data = await res.json();
    
    // Finnhub fields: c=current, d=change, dp=percent change, h=high, l=low, o=open, pc=prev close
    const observed = parseQuoteObservation({price:data.c,changePct:data.dp,low:data.l,high:data.h,prevClose:data.pc}, symbol);
    if (!observed) {
      throw new Error(`Symbol ${symbol} not found or rate limit hit.`);
    }
    
    return {
      ...quoteSourceMetadata({sourceMode:'live',adjustedBasis:'raw'}),
      ...observed,
      source: 'live',
      provider: 'Finnhub',
      retrievedAt: new Date().toISOString(),
      marketTime: providerObservationInstant(data.t),
      asOf: providerObservationInstant(data.t),
      stale: false,
      cached: false
    };
  } catch (err) {
    try {
      const res = await fetch(
        '/api/quote?symbol=' + encodeURIComponent(symbol) + (forceRefresh ? '&refresh=true' : ''),
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Server quote fallback failed: HTTP ' + res.status);
      const data = await res.json();
      const observed = parseQuoteObservation(data, symbol);
      if (!observed) throw new Error('No usable price and daily move available');
      return {
        ...quoteSourceMetadata(data),
        ...observed,
        source: 'live',
        provider: data.provider,
        retrievedAt: data.retrievedAt,
        currency: data.currency,
        isMarketSessionOpen: data.isMarketSessionOpen,
        status: data.status,
        simulated: data.simulated,
        fallbackUsed: data.fallbackUsed,
        marketTime: data.marketTime,
        asOf: data.asOf,
        stale: data.stale === true,
        cached: data.cached === true
      };
    } catch {
      throw err;
    }
  }
}
