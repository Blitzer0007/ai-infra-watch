import { WatchlistItem } from './types';

export interface AppConfig {
  finnhubKey: string;
  watchlist: string[];
  alerts: { symbol: string; targetPrice: number; type: 'above' | 'below'; active: boolean }[];
}

const CONFIG_KEY = 'aiw_config_v1';

export const DEFAULT_CONFIG: AppConfig = {
  finnhubKey: '',
  watchlist: ['NVDA', 'NBIS', 'DGXX', 'MU', 'AMD'],
  alerts: [
    { symbol: 'DGXX', targetPrice: 5.0, type: 'above', active: true },
    { symbol: 'NBIS', targetPrice: 20.0, type: 'below', active: false }
  ]
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

// Simulated real-time fluctuating price provider when no API key is supplied
const SIM_PRICES: Record<string, { price: number; changePct: number; low: number; high: number; prevClose: number }> = {
  NVDA: { price: 192.53, changePct: -1.64, low: 189.20, high: 196.40, prevClose: 195.74 },
  NBIS: { price: 240.30, changePct: -6.36, low: 235.00, high: 248.50, prevClose: 256.62 },
  DGXX: { price: 4.50, changePct: 12.50, low: 3.90, high: 4.80, prevClose: 4.00 },
  MU: { price: 132.00, changePct: -0.45, low: 130.20, high: 134.50, prevClose: 132.60 },
  AMD: { price: 178.50, changePct: 1.80, low: 174.10, high: 180.20, prevClose: 175.35 },
  META: { price: 550.00, changePct: 0.65, low: 544.10, high: 553.40, prevClose: 546.45 },
  MSFT: { price: 372.97, changePct: 5.71, low: 350.50, high: 375.00, prevClose: 352.82 },
  GOOG: { price: 334.69, changePct: -2.19, low: 330.10, high: 342.50, prevClose: 342.18 },
  CERE: { price: 28.50, changePct: 6.70, low: 26.20, high: 29.80, prevClose: 26.70 },
  NOW: { price: 98.34, changePct: 9.85, low: 88.50, high: 99.40, prevClose: 89.52 },
  SUBQ: { price: 3.10, changePct: 8.40, low: 2.85, high: 3.25, prevClose: 2.86 },
  SNDK: { price: 2090.71, changePct: -10.46, low: 2050.00, high: 2200.00, prevClose: 2335.00 },
  AMPG: { price: 6.55, changePct: -6.16, low: 6.40, high: 7.10, prevClose: 6.98 }
};

export async function fetchLiveQuote(symbol: string, apiKey: string): Promise<{
  price: number;
  changePct: number;
  low: number;
  high: number;
  prevClose: number;
  source: 'live' | 'simulated';
}> {
  if (!apiKey) {
    // Add small random fluctuation for realistic simulated tracking
    const base = SIM_PRICES[symbol] || { price: 10.0, changePct: 0, low: 9.5, high: 10.5, prevClose: 10.0 };
    const randomShift = (Math.random() - 0.5) * 0.004 * base.price; // up to 0.2% fluctuation
    const newPrice = base.price + randomShift;
    const newChangePct = ((newPrice - base.prevClose) / base.prevClose) * 100;
    return {
      price: newPrice,
      changePct: newChangePct,
      low: Math.min(base.low, newPrice),
      high: Math.max(base.high, newPrice),
      prevClose: base.prevClose,
      source: 'simulated'
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
      source: 'live'
    };
  } catch (err) {
    // Fall back to simulated on rate limit or network error
    const base = SIM_PRICES[symbol] || { price: 10.0, changePct: 0, low: 9.5, high: 10.5, prevClose: 10.0 };
    return {
      price: base.price,
      changePct: base.changePct,
      low: base.low,
      high: base.high,
      prevClose: base.prevClose,
      source: 'simulated'
    };
  }
}
