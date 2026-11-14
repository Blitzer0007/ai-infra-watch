/** Browser detection only. Pure source admission and transitions; no transport or storage. */
import type { AppConfig } from '../utils';
import type { AlertEvent } from './alertContracts';
import { evaluateQuoteQuality, normalizeDecisionQuote } from './decisionEligibility';
import { validCalendarInstant } from './catalystCalendar';

export const QUOTE_ALERT_STATE_KEY = 'aiw_quote_alert_admission_v1';
export const QUOTE_ALERT_MAX_AGE_MS = 15 * 60_000;
type SymbolState = {
  marketMs: number; price: number; changePct: number | null;
  conditions: Record<string, boolean>;
  largeMove: { day: string; threshold: number; up: boolean; down: boolean } | null;
};
export type QuoteAlertState = { version: 1; symbols: Record<string, SymbolState> };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validSymbol = (v: unknown): v is string => typeof v === 'string' && /^[A-Z0-9.^=-]{1,20}$/.test(v);
const validClock = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v >= 0 && v <= 8_640_000_000_000_000;
const empty = (): QuoteAlertState => ({ version: 1, symbols: {} });

/** Corrupt/legacy receipts rebaseline instead of supplying an invented previous crossing. */
export function readQuoteAlertState(value: unknown): QuoteAlertState {
  if (!object(value) || value.version !== 1 || !object(value.symbols) || Object.keys(value.symbols).length > 500) return empty();
  const symbols: Record<string, SymbolState> = {};
  for (const [symbol, row] of Object.entries(value.symbols)) {
    if (!validSymbol(symbol) || !object(row) || !validClock(row.marketMs) || !finite(row.price) || row.price <= 0 || !(row.changePct === null || finite(row.changePct)) || !object(row.conditions) || Object.keys(row.conditions).length > 200) return empty();
    const conditions: Record<string, boolean> = {};
    for (const [key, flag] of Object.entries(row.conditions)) {
      if (!/^(above|below):\d+(?:\.\d+)?(?:e[+-]?\d+)?$/.test(key) || typeof flag !== 'boolean') return empty();
      conditions[key] = flag;
    }
    const move = row.largeMove;
    let largeMove: SymbolState['largeMove'] = null;
    if (move !== null) {
      if (!object(move) || typeof move.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(move.day) || !finite(move.threshold) || move.threshold <= 0 || typeof move.up !== 'boolean' || typeof move.down !== 'boolean') return empty();
      largeMove = { day: move.day, threshold: move.threshold, up: move.up, down: move.down };
    }
    symbols[symbol] = { marketMs: row.marketMs, price: row.price, changePct: row.changePct as number | null,
      conditions, largeMove };
  }
  return { version: 1, symbols };
}

export function admitBrowserAlertQuote(symbol: string, value: unknown, nowMs: number) {
  const reasons: string[] = [];
  if (!validClock(nowMs) || !validSymbol(symbol) || !object(value)) return { eligible: false, reasons: ['Invalid clock, symbol or quote packet.'], quote: null };
  const q = value;
  if (typeof q.returnedSymbol !== 'string' || q.returnedSymbol.trim().toUpperCase() !== symbol || (q.symbol != null && q.symbol !== symbol)) reasons.push('Provider-returned identity is missing or mismatched.');
  if (q.sourceMode !== 'live') reasons.push('A declared live source mode is required.');
  if (q.adjustedBasis !== 'raw') reasons.push('Absolute price alerts require raw USD quote units.');
  for (const flag of ['stale', 'simulated', 'fallbackUsed']) if (q[flag] != null && typeof q[flag] !== 'boolean') reasons.push('Malformed quality marker: ' + flag + '.');
  if (q.simulated === true || q.stale === true) reasons.push('Simulated or stale quotes cannot trigger browser alerts.');
  if (q.marketTimePrecision !== 'instant' || !validCalendarInstant(q.marketTime) || !validCalendarInstant(q.retrievedAt)) reasons.push('Exact market and retrieval instants are required.');
  if (q.isMarketSessionOpen !== true) reasons.push('Automatic browser alerts require an explicitly open regular session.');
  if (q.independentObservations != null && !Array.isArray(q.independentObservations)) reasons.push('Malformed independent-observation collection.');
  if (Array.isArray(q.independentObservations) && (q.independentObservations.length > 32 || q.independentObservations.some(row =>
    !object(row) || row.symbol !== symbol || typeof row.provider !== 'string' || !row.provider.trim() || row.provider.length > 80
      || !finite(row.price) || row.price <= 0 || row.currency !== 'USD' || row.adjustedBasis !== 'raw'
      || !validCalendarInstant(row.marketTime)))) reasons.push('Independent price-comparison metadata is incomplete or incompatible.');
  if (typeof q.provider !== 'string' || !q.provider.trim() || q.provider.length > 80 || /[\u0000-\u001f\u007f]/.test(q.provider)) reasons.push('A bounded provider label is required.');
  if (reasons.length) return { eligible: false, reasons, quote: null };
  const quote = normalizeDecisionQuote(symbol, q);
  const quality = evaluateQuoteQuality(quote, nowMs);
  reasons.push(...quality.reasons);
  if (nowMs - Date.parse(quote.marketTime!) > QUOTE_ALERT_MAX_AGE_MS || nowMs - Date.parse(quote.retrievedAt!) > QUOTE_ALERT_MAX_AGE_MS) reasons.push('Market observation and retrieval must be at most 15 minutes old for automatic browser alerts.');
  return { eligible: reasons.length === 0, reasons, quote: reasons.length ? null : {
    price: quote.price!, marketMs: Date.parse(quote.marketTime!), provider: quote.provider,
    changePct: finite(q.changePct) ? q.changePct : null,
  } };
}

export function evaluateBrowserQuoteAlerts(config: Pick<AppConfig, 'alerts' | 'largeMoveEnabled' | 'largeMovePct'>,
  quotes: Record<string, unknown>, previous: unknown, nowMs: number, bootstrap = false) {
  const state = readQuoteAlertState(previous);
  const events: AlertEvent[] = [];
  const assessments: { symbol: string; eligible: boolean; reasons: string[] }[] = [];
  if (!validClock(nowMs) || !object(quotes) || Object.keys(quotes).length > 500 || !Array.isArray(config?.alerts) || config.alerts.length > 200) return { state, events, assessments, issue: 'Invalid or excessive quote-alert inputs.' };
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const rules = new Map<string, AppConfig['alerts'][number]>();
  for (const alert of config.alerts) if (object(alert) && alert.active === true && validSymbol(alert.symbol) && finite(alert.targetPrice) && alert.targetPrice > 0 && ['above', 'below'].includes(alert.type)) rules.set(`${alert.symbol}:${alert.type}:${alert.targetPrice}`, alert);
  for (const [symbol, raw] of Object.entries(quotes)) {
    const admission = admitBrowserAlertQuote(symbol, raw, nowMs);
    const assessment = { symbol, eligible: admission.eligible, reasons: [...admission.reasons] };
    assessments.push(assessment);
    if (!admission.eligible || !admission.quote) continue;
    const q = admission.quote;
    const old = state.symbols[symbol];
    if (old && (q.marketMs < old.marketMs || (q.marketMs === old.marketMs && (q.price !== old.price || q.changePct !== old.changePct)))) {
      assessment.eligible = false; assessment.reasons.push('Older or revised same-time observations cannot reset or trigger browser alerts.'); continue;
    }
    // Repeated bytes/retrievals do not create a new crossing, rearm, or new-day baseline.
    if (old && q.marketMs === old.marketMs) continue;
    const next: SymbolState = { marketMs: q.marketMs, price: q.price, changePct: q.changePct, conditions: {}, largeMove: null };
    for (const alert of rules.values()) {
      if (alert.symbol !== symbol) continue;
      const key = `${alert.type}:${alert.targetPrice}`;
      const condition = alert.type === 'above' ? q.price >= alert.targetPrice : q.price <= alert.targetPrice;
      next.conditions[key] = condition;
      // First eligible sample for each rule is a baseline, including after invalid startup/config changes.
      if (condition && old?.conditions[key] === false && !bootstrap) events.push({
        id: `price:${symbol}:${key}:${nowMs}`, type: 'price', severity: 'high', symbol,
        title: symbol + ' price target reached',
        message: `${symbol} is ${alert.type} $${alert.targetPrice.toFixed(2)} at $${q.price.toFixed(2)}.`,
        timestamp: nowMs, value: q.price, source: q.provider,
      });
    }
    if (config.largeMoveEnabled === true && finite(config.largeMovePct) && config.largeMovePct > 0 && q.changePct !== null) {
      const threshold = Math.max(0.1, config.largeMovePct);
      const oldMove = old?.largeMove?.day === today && old.largeMove.threshold === threshold ? old.largeMove : null;
      const up = q.changePct >= threshold, down = q.changePct <= -threshold;
      next.largeMove = { day: today, threshold, up: (oldMove?.up ?? false) || up, down: (oldMove?.down ?? false) || down };
      const direction = up ? 'up' : 'down';
      if ((up || down) && oldMove && !oldMove[direction] && !bootstrap) events.push({
        id: `large-move:${symbol}:${today}:${direction}:${nowMs}`, type: 'large-move',
        severity: Math.abs(q.changePct) >= threshold * 2 ? 'critical' : 'high', symbol,
        title: symbol + ' large move detected',
        message: `${symbol} is ${up ? 'up ' : 'down '}${Math.abs(q.changePct).toFixed(2)}% today at $${q.price.toFixed(2)}.`,
        timestamp: nowMs, value: q.changePct, source: q.provider,
      });
    }
    if (!old && Object.keys(state.symbols).length >= 500) { assessment.eligible = false; assessment.reasons.push('Local quote receipt capacity reached.'); continue; }
    state.symbols[symbol] = next;
  }
  return { state, events, assessments, issue: null };
}
