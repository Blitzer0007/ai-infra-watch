import { AppConfig } from '../utils';
import { authFetch, getAccessToken } from './apiAuth';

import { ALERT_EVENTS_KEY, type AlertEvent, type AlertEventType } from './alertContracts';
import { evaluateBrowserQuoteAlerts, QUOTE_ALERT_STATE_KEY } from './quoteAlertEvaluation';
export { ALERT_EVENTS_KEY } from './alertContracts';
export type { AlertEvent, AlertEventType, AlertSeverity } from './alertContracts';
export const ALERT_STATE_KEY = 'aiw_alert_state_v1';
export const TELEGRAM_ENABLED_KEY = 'aiw_telegram_alerts_enabled_v1';
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

export function isTelegramEnabled(): boolean {
  try {
    return localStorage.getItem(TELEGRAM_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setTelegramEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(TELEGRAM_ENABLED_KEY, 'true');
    else localStorage.removeItem(TELEGRAM_ENABLED_KEY);
  } catch {
    // ignore local storage failures
  }
}

export function evaluateQuoteAlerts(
  config: AppConfig,
  quotes: Record<string, unknown>,
  bootstrap = false,
  nowMs = Date.now(),
): AlertEvent[] {
  // Separate versioned baseline; existing feed/catalyst state and alert history are retained.
  try {
    const raw = localStorage.getItem(QUOTE_ALERT_STATE_KEY);
    let previous: unknown = null;
    if (raw && raw.length <= 1_000_000) { try { previous = JSON.parse(raw); } catch { /* Rebaseline corrupt receipts. */ } }
    const result = evaluateBrowserQuoteAlerts(config, quotes, previous, nowMs, bootstrap);
    const encoded = JSON.stringify(result.state);
    if (encoded !== raw) localStorage.setItem(QUOTE_ALERT_STATE_KEY, encoded);
    if (result.events.length) saveAlertEvents([...result.events, ...loadAlertEvents()]);
    return result.events;
  } catch {
    // Without durable local deduplication, do not return detections to either sender.
    return [];
  }
}

export function requestBrowserNotifications(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied');
  return Notification.requestPermission();
}

export async function notifyTelegram(events: AlertEvent[]): Promise<void> {
  if ((import.meta as any).env?.DEV || (import.meta as any).env?.VITE_QA_MODE === 'true') return;
  if (!events.length || !getAccessToken() || !isTelegramEnabled()) return;

  try {
    const response = await authFetch('/api/alert-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      cache: 'no-store',
    });

    if (!response.ok) {
      // Telegram delivery is optional; local alert state/browser notifications
      // must keep working even when the server relay is not configured.
      return;
    }
  } catch {
    // Keep the dashboard signal engine resilient to notification transport failures.
  }
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
  const hasFeedState = Object.keys(state).some(key => key.startsWith('catalyst:'));
  const seedOnly = bootstrap || !hasFeedState;

  for (const contract of feed.contracts || []) {
    const symbol = contract.company || '';
    if (!symbol || !watched.has(symbol) || !contract.id) continue;
    const key = 'catalyst:contract:' + contract.id;
    if (!state[key] && !seedOnly) {
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
    if (!state[key] && !seedOnly) {
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
