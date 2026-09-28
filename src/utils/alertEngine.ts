import { AppConfig } from './utils';

export type AlertSeverity = 'info' | 'medium' | 'high' | 'critical';
export type AlertEventType = 'price' | 'large-move' | 'catalyst';

export interface AlertEvent {
  id: string;
  type: AlertEventType;
  severity: AlertSeverity;
  symbol?: string;
  title: string;
  message: string;
  timestamp: number;
  value?: number;
  source?: string;
}

export const ALERT_EVENTS_KEY = 'aiw_alert_events_v1';
export const ALERT_STATE_KEY = 'aiw_alert_state_v1';
const MAX_EVENTS = 100;

export function loadAlertEvents(): AlertEvent[] {
  try {
    const raw = localStorage.getItem(ALERT_EVENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_EVENTS) : [];
  } catch {
    return [];
  }
}

export function saveAlertEvents(events: AlertEvent[]): void {
  localStorage.setItem(ALERT_EVENTS_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
}

function loadAlertState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(ALERT_STATE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveAlertState(state: Record<string, boolean>): void {
  localStorage.setItem(ALERT_STATE_KEY, JSON.stringify(state));
}

function eventId(type: AlertEventType, symbol: string, suffix: string): string {
  return type + ':' + symbol + ':' + suffix;
}

export function evaluateQuoteAlerts(
  config: AppConfig,
  quotes: Record<string, { price: number; changePct: number }>,
  bootstrap = false,
): AlertEvent[] {
  const state = loadAlertState();
  const events: AlertEvent[] = [];
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);

  for (const alert of config.alerts) {
    if (!alert.active) continue;
    const quote = quotes[alert.symbol];
    if (!quote || !Number.isFinite(quote.price)) continue;

    const key = eventId('price', alert.symbol, alert.type + ':' + alert.targetPrice);
    const condition = alert.type === 'above'
      ? quote.price >= alert.targetPrice
      : quote.price <= alert.targetPrice;

    if (!condition) {
      state[key] = false;
      continue;
    }

    if (!state[key] && !bootstrap) {
      events.push({
        id: key + ':' + now,
        type: 'price',
        severity: 'high',
        symbol: alert.symbol,
        title: alert.symbol + ' price target reached',
        message: alert.symbol + ' is ' + alert.type + ' $' + alert.targetPrice.toFixed(2) + ' at $' + quote.price.toFixed(2) + '.',
        timestamp: now,
        value: quote.price,
        source: 'live quote'
      });
    }
    state[key] = true;
  }

  if (config.largeMoveEnabled) {
    const threshold = Math.max(0.1, Number(config.largeMovePct) || 5);
    for (const [symbol, quote] of Object.entries(quotes)) {
      if (!Number.isFinite(quote.changePct) || Math.abs(quote.changePct) < threshold) continue;
      const direction = quote.changePct >= 0 ? 'up' : 'down';
      const key = eventId('large-move', symbol, today + ':' + direction);
      if (!state[key] && !bootstrap) {
        events.push({
          id: key + ':' + now,
          type: 'large-move',
          severity: Math.abs(quote.changePct) >= threshold * 2 ? 'critical' : 'high',
          symbol,
          title: symbol + ' large move detected',
          message: symbol + ' is ' + (quote.changePct >= 0 ? 'up ' : 'down ') + Math.abs(quote.changePct).toFixed(2) + '% today at $' + quote.price.toFixed(2) + '.',
          timestamp: now,
          value: quote.changePct,
          source: 'live quote'
        });
      }
      state[key] = true;
    }
  }

  saveAlertState(state);

  if (events.length) {
    saveAlertEvents([...events, ...loadAlertEvents()]);
  }

  return events;
}

export function requestBrowserNotifications(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied');
  return Notification.requestPermission();
}

export function notifyBrowser(event: AlertEvent): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('AI Infra Watch · ' + event.title, {
    body: event.message,
    tag: event.id
  });
}

export function evaluateFeedAlerts(
  config: AppConfig,
  feed: { contracts?: Array<{ id?: string; company?: string; client?: string; value?: string; dateSigned?: string }>; congressTrades?: Array<{ id?: string; stockSymbol?: string; politician?: string; transactionType?: string; amountRange?: string; date?: string }> },
  bootstrap = false,
): AlertEvent[] {
  if (!config.catalystAlerts) return [];

  const state = loadAlertState();
  const events: AlertEvent[] = [];
  const now = Date.now();
  const watched = new Set([...config.watchlist, ...config.alerts.map(alert => alert.symbol)]);

  for (const contract of feed.contracts || []) {
    const symbol = contract.company || '';
    if (!symbol || !watched.has(symbol) || !contract.id) continue;
    const key = 'catalyst:contract:' + contract.id;
    if (!state[key] && !bootstrap) {
      events.push({
        id: key + ':' + now,
        type: 'catalyst',
        severity: 'high',
        symbol,
        title: symbol + ' SEC agreement detected',
        message: (contract.client || 'Material definitive agreement') + ' · ' + (contract.value || 'Value not quantified') + (contract.dateSigned ? ' · ' + contract.dateSigned : ''),
        timestamp: now,
        source: 'SEC EDGAR'
      });
    }
    state[key] = true;
  }

  for (const trade of feed.congressTrades || []) {
    const symbol = trade.stockSymbol || '';
    if (!symbol || !watched.has(symbol) || !trade.id) continue;
    const key = 'catalyst:congress:' + trade.id;
    if (!state[key] && !bootstrap) {
      events.push({
        id: key + ':' + now,
        type: 'catalyst',
        severity: 'medium',
        symbol,
        title: symbol + ' congressional trade disclosed',
        message: (trade.politician || 'Unknown filer') + ' reported a ' + (trade.transactionType || 'transaction') + ' in the range ' + (trade.amountRange || 'not disclosed') + (trade.date ? ' · ' + trade.date : ''),
        timestamp: now,
        source: 'Congressional disclosure feed'
      });
    }
    state[key] = true;
  }

  saveAlertState(state);
  if (events.length) saveAlertEvents([...events, ...loadAlertEvents()]);
  return events;
}
