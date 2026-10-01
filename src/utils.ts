import { WatchlistItem } from './types';

export interface AppConfig {
  finnhubKey: string;
  watchlist: string[];
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
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(cfg: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
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

export async function fetchLiveQuote(symbol: string, apiKey: string): Promise<{
  price: number;
  changePct: number;
  low: number;
  high: number;
  prevClose: number;
  source: 'live';
  provider?: string;
  retrievedAt?: string;
  stale?: boolean;
  cached?: boolean;
}> {
  if (!apiKey) {
    const res = await fetch('/api/quote?symbol=' + encodeURIComponent(symbol));
    if (!res.ok) throw new Error('Server quote request failed: HTTP ' + res.status);
    const data = await res.json();
    if (!Number.isFinite(data?.price)) throw new Error('Server quote returned no price');
    return {
      price: data.price,
      changePct: Number(data.changePct) || 0,
      low: Number(data.low) || data.price,
      high: Number(data.high) || data.price,
      prevClose: Number(data.prevClose) || data.price,
      source: 'live',
      provider: data.provider,
      retrievedAt: data.retrievedAt,
      stale: data.stale === true,
      cached: data.cached === true
    };
  }

  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
    if (!res.ok) throw new Error('Network error from Finnhub API');
    const data = await res.json();
    
    // Finnhub fields: c=current, d=change, dp=percent change, h=high, l=low, o=open, pc=prev close
    if (data.c === 0 && data.pc === 0) {
      throw new Error(`Symbol ${symbol} not found or rate limit hit.`);
    }
    
    return {
      price: data.c,
      changePct: data.dp,
      low: data.l,
      high: data.h,
      prevClose: data.pc,
      source: 'live',
      provider: data.provider,
      retrievedAt: data.retrievedAt,
      stale: data.stale === true,
      cached: data.cached === true
    };
  } catch (err) {
    try {
      const res = await fetch('/api/quote?symbol=' + encodeURIComponent(symbol));
      if (!res.ok) throw new Error('Server quote fallback failed: HTTP ' + res.status);
      const data = await res.json();
      if (!Number.isFinite(data?.price)) throw new Error('No live quote available');
      return {
        price: data.price,
        changePct: Number(data.changePct) || 0,
        low: Number(data.low) || data.price,
        high: Number(data.high) || data.price,
        prevClose: Number(data.prevClose) || data.price,
        source: 'live',
        provider: data.provider,
        retrievedAt: data.retrievedAt,
        stale: data.stale === true,
        cached: data.cached === true
      };
    } catch {
      throw err;
    }
  }
}
