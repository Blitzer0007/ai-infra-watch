import { createPublicKey, createVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requireAccess } from '../../api/_access-auth.js';
import { getTickerValidationContext } from '../utils/forecastValidation.js';
import { getMarketSessionInfo, shouldEmitLargeMoveSummary, shouldEvaluateLargeMove } from '../utils/serverAlertSession.js';

const LARGE_MOVE_CRITICAL_MULTIPLIER = 2;
const MAX_SMART_ALERTS_PER_SCAN = 10;
const CATALYST_LOOKBACK_DAYS = 7;

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS_URL = GITHUB_OIDC_ISSUER + '/.well-known/jwks';
const GITHUB_REPOSITORY = 'Blitzer0007/ai-infra-watch';
const GITHUB_WORKFLOW = '.github/workflows/server-smart-alerts.yml';
let githubJwksCache = { expiresAt: 0, keys: [] };

function loadDashboardUniverse() {
  try {
    const payload = JSON.parse(readFileSync(join(process.cwd(), 'data', 'stock_watchlist.json'), 'utf8'));
    return Array.isArray(payload?.watchlist)
      ? payload.watchlist.map(item => String(item?.symbol || '').trim().toUpperCase()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

const DASHBOARD_UNIVERSE = loadDashboardUniverse();

function base64UrlJson(segment) {
  try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); } catch { return null; }
}

async function githubOidcVerified(req) {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.startsWith('Bearer ')) return false;
  const token = authorization.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || !header.kid) return false;
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== GITHUB_OIDC_ISSUER) return false;
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes('ai-infra-watch')) return false;
  if (claims.repository !== GITHUB_REPOSITORY || claims.ref !== 'refs/heads/main') return false;
  const workflowRef = String(claims.job_workflow_ref || '');
  const workflowPath = workflowRef.startsWith(GITHUB_REPOSITORY + '/') ? workflowRef.slice(GITHUB_REPOSITORY.length + 1).split('@')[0] : '';
  if (workflowPath !== GITHUB_WORKFLOW || Number(claims.exp) <= now) return false;
  try {
    if (githubJwksCache.expiresAt <= Date.now()) {
      const response = await fetch(GITHUB_OIDC_JWKS_URL, { headers: { 'User-Agent': 'ai-infra-watch-github-oidc/1.0' }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) return false;
      const body = await response.json();
      if (!Array.isArray(body?.keys)) return false;
      githubJwksCache = { expiresAt: Date.now() + 5 * 60 * 1000, keys: body.keys };
    }
    const jwk = githubJwksCache.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) return false;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(parts[0] + '.' + parts[1]);
    verifier.end();
    return verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch { return false; }
}

async function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret && req.headers?.authorization === 'Bearer ' + secret) return true;
  return githubOidcVerified(req);
}

async function authorize(req, res) {
  if (await isCron(req)) return true;
  return requireAccess(req, res);
}

function supabaseHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
}

async function readJson(path) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: supabaseHeaders() });
  if (!response.ok) throw new Error('Supabase read failed: HTTP ' + response.status);
  return response.json();
}

async function upsertRows(path, rows) {
  if (!rows.length) return;
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    method: 'POST',
    headers: { ...supabaseHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error('Supabase write failed: HTTP ' + response.status + (detail ? ' ' + detail.slice(0, 300) : ''));
  }
}

async function getConfig() {
  const rows = await readJson('server_alert_config?select=watchlist,alerts,large_move_enabled,large_move_pct,catalyst_alerts&id=eq.default&limit=1');
  return rows?.[0] || {
    watchlist: [],
    alerts: [],
    large_move_enabled: false,
    large_move_pct: 5,
    catalyst_alerts: false,
  };
}

async function getPortfolioSymbols() {
  try {
    const rows = await readJson('portfolio_holdings?select=symbol');
    return (rows || []).map(row => String(row?.symbol || '').trim().toUpperCase()).filter(Boolean);
  } catch {
    return [];
  }
}

async function getStates() {
  const rows = await readJson('server_alert_state?select=event_key,active,last_seen_at,last_triggered_at,metadata&limit=5000');
  return new Map((rows || []).map(row => [String(row.event_key), row]));
}

async function getForecastValidationContexts(symbols) {
  const unique = [...new Set(symbols.map(symbol => String(symbol || '').trim().toUpperCase()).filter(Boolean))];
  if (!unique.length) return new Map();
  const tickerFilter = unique.map(symbol => encodeURIComponent(symbol)).join(',');
  const path =
    'forecast_snapshots?select=ticker,horizon,status,median,p25,p75,p10,p90,actual_return,median_error,verified_at' +
    '&status=eq.verified&horizon=eq.20&ticker=in.(' + tickerFilter + ')' +
    '&order=verified_at.desc&limit=2000';
  const rows = await readJson(path);
  const contexts = new Map();
  for (const symbol of unique) {
    const context = getTickerValidationContext(rows || [], symbol, 20);
    if (context) contexts.set(symbol, context);
  }
  return contexts;
}

async function quote(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(symbol) + '?range=1d&interval=1d';
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ai-infra-watch/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error('quote HTTP ' + response.status);
  const payload = await response.json();
  const meta = payload?.chart?.result?.[0]?.meta || {};
  const price = Number(meta.regularMarketPrice);
  const prevClose = Number(meta.chartPreviousClose);
  if (!Number.isFinite(price)) throw new Error('no price');
  return {
    price,
    changePct: Number.isFinite(prevClose) && prevClose !== 0 ? (price / prevClose - 1) * 100 : 0,
    marketState: String(meta.marketState || '').trim().toUpperCase(),
  };
}

function normalizeAlert(row) {
  if (!row) return null;
  const symbol = String(row.symbol || '').trim().toUpperCase();
  const targetPrice = Number(row.targetPrice);
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol) || !Number.isFinite(targetPrice) || targetPrice < 0) return null;
  return {
    symbol,
    targetPrice,
    type: row.type === 'below' ? 'below' : 'above',
    active: row.active === true,
  };
}

async function fetchCatalystFeed() {
  const base = String(process.env.AIW_PRODUCTION_URL || 'https://ai-infra-watch-theta.vercel.app').replace(/\/$/, '');
  const response = await fetch(base + '/api/live-data?refresh=true', {
    headers: { Accept: 'application/json', 'User-Agent': 'ai-infra-watch-server-alerts/1.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('live-data HTTP ' + response.status);
  return response.json();
}

function formatSignal(event) {
  const lines = [
    '🚨 AI Infra Watch · Server Smart Alert',
    '',
    event.symbol + ' · ' + event.title,
    event.message,
  ];
  if (event.validationContext) {
    const v = event.validationContext;
    lines.push(
      '',
      'Forecast validation (' + v.horizon + 'D): ' +
        v.count + ' verified · ' +
        v.sampleStatus.replace('-', ' ') +
        (v.directionalAccuracyPct == null ? '' : ' · direction ' + v.directionalAccuracyPct.toFixed(1) + '%') +
        (v.medianAbsoluteError == null ? '' : ' · typical error ' + v.medianAbsoluteError.toFixed(2) + ' pp')
    );
  }
  lines.push(
    '',
    'Type: ' + event.type + ' · Severity: ' + event.severity,
    'Source: ' + event.source,
    'Server-side monitor · information alert only; no trade instruction is inferred.',
  );
  return lines.join('\n');
}

async function sendTelegram(events) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) return { sent: 0, errors: ['Telegram credentials are not configured.'] };

  let sent = 0;
  const sentEventKeys = [];
  const errors = [];
  for (const event of events) {
    try {
      const response = await fetch(
        'https://api.telegram.org/bot' + botToken + '/sendMessage',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: formatSignal(event) }),
          signal: AbortSignal.timeout(10000),
        }
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload?.description || 'Telegram HTTP ' + response.status));
      }
      sent += 1;
      sentEventKeys.push(event.stateKey);
    } catch (error) {
      errors.push(event.symbol + ': ' + String(error?.message || error));
    }
  }
  return { sent, sentEventKeys, errors };
}

function isRecentCatalystDate(value, now) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = now.getTime() - timestamp;
  return ageMs >= -24 * 60 * 60 * 1000 && ageMs <= CATALYST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

async function evaluate() {
  const config = await getConfig();
  const portfolioSymbols = await getPortfolioSymbols();
  const normalizedAlerts = (Array.isArray(config.alerts) ? config.alerts : []).map(normalizeAlert).filter(Boolean);
  const alertSymbols = normalizedAlerts.map(alert => alert.symbol);
  // Keep server-side Smart Move monitoring aligned with the dashboard universe,
  // not just the user's five-item alert watchlist/portfolio. This ensures a move
  // visible in the dashboard can still alert when the browser is closed.
  const watchedSymbols = [...new Set([
    ...DASHBOARD_UNIVERSE,
    ...(Array.isArray(config.watchlist) ? config.watchlist : []),
    ...alertSymbols,
    ...portfolioSymbols,
  ].map(value => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 60);

  const states = await getStates();
  let forecastValidationContexts = new Map();
  const now = new Date();
  const session = getMarketSessionInfo(now);
  const timestamp = now.toISOString();
  const events = [];
  const stateUpdates = [];

  const quotes = new Map();
  await Promise.all(watchedSymbols.map(async symbol => {
    try {
      quotes.set(symbol, await quote(symbol));
    } catch {
      // One unavailable symbol must not block the rest of the alert scan.
    }
  }));

  for (const alert of normalizedAlerts) {
    if (!alert.active) continue;
    const q = quotes.get(alert.symbol);
    if (!q) continue;

    const key = 'price:' + alert.symbol + ':' + alert.type + ':' + alert.targetPrice;
    const previous = states.get(key);
    const condition = alert.type === 'above'
      ? q.price >= alert.targetPrice
      : q.price <= alert.targetPrice;

    if (!condition) {
      stateUpdates.push({
        event_key: key,
        active: false,
        last_seen_at: timestamp,
        last_triggered_at: previous?.last_triggered_at || null,
        metadata: { symbol: alert.symbol, type: alert.type, targetPrice: alert.targetPrice },
      });
      continue;
    }

    if (!previous?.active) {
      events.push({
        stateKey: key,
        type: 'price',
        severity: 'high',
        symbol: alert.symbol,
        title: alert.symbol + ' price target reached',
        message: alert.symbol + ' is ' + alert.type + ' $' + alert.targetPrice.toFixed(2) + ' at $' + q.price.toFixed(2) + '.',
        source: 'Yahoo Finance quote',
      });
    }
  }

  if (config.large_move_enabled && session.isRegularHours) {
    const threshold = Math.max(0.1, Number(config.large_move_pct) || 5);
    for (const symbol of watchedSymbols) {
      const q = quotes.get(symbol);
      const magnitude = Math.abs(q?.changePct ?? 0);

      if (!q || magnitude < threshold || !shouldEvaluateLargeMove(now, q.marketState)) continue;

      const direction = q.changePct >= 0 ? 'up' : 'down';
      const key = 'large-move:' + symbol + ':' + direction + ':' + session.sessionDate;
      const previous = states.get(key);

      // One notification per symbol/direction per regular trading session.
      // The session date in the key replaces the old time-based cooldown, so
      // the same move cannot fire again after market close or the next day.
      if (previous?.active) continue;

      const severity = magnitude >= threshold * LARGE_MOVE_CRITICAL_MULTIPLIER ? 'critical' : 'high';
      events.push({
        stateKey: key,
        type: 'large-move',
        severity,
        symbol,
        title: symbol + ' large move detected',
        message: symbol + ' is ' + (q.changePct >= 0 ? 'up ' : 'down ') + magnitude.toFixed(2) + '% today at 

  let catalystFeed = null;
  if (config.catalyst_alerts) {
    try {
      const minute = now.getUTCMinutes();
      if (minute % 30 === 0 || String(process.env.SMART_ALERT_FORCE || '').toLowerCase() === 'true') {
        catalystFeed = await fetchCatalystFeed();
      }
    } catch {
      catalystFeed = null;
    }

    const allowed = new Set(watchedSymbols);
    for (const contract of Array.isArray(catalystFeed?.contracts) ? catalystFeed.contracts : []) {
      const symbol = String(contract?.company || '').trim().toUpperCase();
      const id = String(contract?.id || '').trim();
      if (!symbol || !allowed.has(symbol) || !id || !isRecentCatalystDate(contract?.dateSigned, now)) continue;
      const key = 'catalyst:contract:' + id;
      if (states.has(key)) continue;
      events.push({
        stateKey: key,
        type: 'catalyst',
        severity: 'high',
        symbol,
        title: symbol + ' SEC agreement detected',
        message: (contract?.client || 'Material definitive agreement') + ' · ' + (contract?.value || 'Value not quantified') + (contract?.dateSigned ? ' · ' + contract.dateSigned : ''),
        source: 'SEC EDGAR',
      });
    }

    for (const trade of Array.isArray(catalystFeed?.congressTrades) ? catalystFeed.congressTrades : []) {
      const symbol = String(trade?.stockSymbol || '').trim().toUpperCase();
      const id = String(trade?.id || '').trim();
      if (!symbol || !allowed.has(symbol) || !id || !isRecentCatalystDate(trade?.date, now)) continue;
      const key = 'catalyst:congress:' + id;
      if (states.has(key)) continue;
      events.push({
        stateKey: key,
        type: 'catalyst',
        severity: 'medium',
        symbol,
        title: symbol + ' congressional trade disclosed',
        message: (trade?.politician || 'Unknown filer') + ' reported a ' + (trade?.transactionType || 'transaction') + ' in the range ' + (trade?.amountRange || 'not disclosed') + (trade?.date ? ' · ' + trade.date : ''),
        source: 'Congressional disclosure feed',
      });
    }
  }

  // Deduplicate before Telegram delivery and state persistence. A feed can contain
  // the same disclosure more than once; sending first and deduplicating later
  // caused duplicate Telegram messages and a PostgreSQL ON CONFLICT failure.
  const uniqueEvents = [];
  const seenEventKeys = new Set();
  for (const event of events) {
    if (!event?.stateKey || seenEventKeys.has(event.stateKey)) continue;
    seenEventKeys.add(event.stateKey);
    uniqueEvents.push(event);
  }
  events.length = 0;
  events.push(...uniqueEvents.slice(0, MAX_SMART_ALERTS_PER_SCAN));

  if (events.length) {
    try {
      forecastValidationContexts = await getForecastValidationContexts([...new Set(events.map(event => event.symbol))]);
      events.forEach(event => {
        event.validationContext = forecastValidationContexts.get(event.symbol) || null;
      });
    } catch {
      forecastValidationContexts = new Map();
    }
  }

  const delivery = await sendTelegram(events);
  const deliveredKeys = new Set(delivery.sentEventKeys || []);

  // Send exactly one end-of-session consolidated summary. It is intentionally
  // evaluated only after regular hours and uses the current session's persisted
  // per-symbol events, so the same summary cannot repeat on later scans.
  const summaryKey = 'large-move-summary:' + session.sessionDate;
  const sessionMoveRows = [...states.entries()]
    .filter(([key, row]) =>
      key.startsWith('large-move:') &&
      key.endsWith(':' + session.sessionDate) &&
      row?.active
    )
    .map(([key, row]) => ({
      key,
      symbol: String(row?.metadata?.symbol || key.split(':')[1] || '').toUpperCase(),
      direction: String(row?.metadata?.direction || key.split(':')[2] || ''),
      changePct: Number(row?.metadata?.changePct),
      price: Number(row?.metadata?.price),
    }));

  const newlyDeliveredMoves = events
    .filter(event => event.type === 'large-move' && deliveredKeys.has(event.stateKey))
    .map(event => ({
      key: event.stateKey,
      symbol: event.symbol,
      direction: event.value >= 0 ? 'up' : 'down',
      changePct: Math.abs(Number(event.value)),
      price: Number(event.message.match(/\\$([0-9.]+)/)?.[1]),
    }));

  const summaryRows = [...sessionMoveRows];
  for (const move of newlyDeliveredMoves) {
    if (!summaryRows.some(row => row.key === move.key)) summaryRows.push(move);
  }

  if (
    config.large_move_enabled &&
    shouldEmitLargeMoveSummary(now) &&
    !states.has(summaryKey) &&
    summaryRows.length
  ) {
    summaryRows.sort((a, b) => (Number(b.changePct) || 0) - (Number(a.changePct) || 0));
    const lines = summaryRows.slice(0, 20).map(row =>
      '• ' + row.symbol + ' ' + (row.direction === 'down' ? '↓' : '↑') +
      ' ' + (Number(row.changePct) || 0).toFixed(2) + '%' +
      (Number.isFinite(row.price) ? ' · 
    const q = quotes.get(symbol);
    if (!q) continue;
    // Quote evaluation itself is observable even when no alert is triggered.
    // Persist only active/triggered states below to keep the state table compact.
  }

  for (const event of events) {
    if (!deliveredKeys.has(event.stateKey)) continue;
    stateUpdates.push({
      event_key: event.stateKey,
      active: true,
      last_seen_at: timestamp,
      last_triggered_at: timestamp,
      metadata: {
        symbol: event.symbol,
        type: event.type,
        title: event.title,
      },
    });
  }

  await upsertRows('server_alert_state', stateUpdates);

  return {
    evaluated_symbols: watchedSymbols.length,
    fresh_quotes: quotes.size,
    configured_price_rules: normalizedAlerts.filter(alert => alert.active).length,
    candidate_events: events.length,
    sent: delivery.sent,
    errors: delivery.errors,
    catalyst_scan: Boolean(catalystFeed),
    forecast_validation_contexts: forecastValidationContexts.size,
    checked_at: timestamp,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorize(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const summary = await evaluate();
    const status = summary.errors.length && !summary.sent ? 502 : 200;
    return res.status(status).json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Server alert evaluation failed' });
  }
}
 + q.price.toFixed(2) + '. ' +
          (severity === 'critical'
            ? 'Move is at least ' + (threshold * LARGE_MOVE_CRITICAL_MULTIPLIER).toFixed(2) + '%.'
            : 'Move crossed the configured ' + threshold.toFixed(2) + '% threshold.'),
        source: 'Yahoo Finance quote',
        sessionDate: session.sessionDate,
      });

      if (events.length >= MAX_SMART_ALERTS_PER_SCAN) break;
    }
  }

  let catalystFeed = null;
  if (config.catalyst_alerts) {
    try {
      const minute = now.getUTCMinutes();
      if (minute % 30 === 0 || String(process.env.SMART_ALERT_FORCE || '').toLowerCase() === 'true') {
        catalystFeed = await fetchCatalystFeed();
      }
    } catch {
      catalystFeed = null;
    }

    const allowed = new Set(watchedSymbols);
    for (const contract of Array.isArray(catalystFeed?.contracts) ? catalystFeed.contracts : []) {
      const symbol = String(contract?.company || '').trim().toUpperCase();
      const id = String(contract?.id || '').trim();
      if (!symbol || !allowed.has(symbol) || !id || !isRecentCatalystDate(contract?.dateSigned, now)) continue;
      const key = 'catalyst:contract:' + id;
      if (states.has(key)) continue;
      events.push({
        stateKey: key,
        type: 'catalyst',
        severity: 'high',
        symbol,
        title: symbol + ' SEC agreement detected',
        message: (contract?.client || 'Material definitive agreement') + ' · ' + (contract?.value || 'Value not quantified') + (contract?.dateSigned ? ' · ' + contract.dateSigned : ''),
        source: 'SEC EDGAR',
      });
    }

    for (const trade of Array.isArray(catalystFeed?.congressTrades) ? catalystFeed.congressTrades : []) {
      const symbol = String(trade?.stockSymbol || '').trim().toUpperCase();
      const id = String(trade?.id || '').trim();
      if (!symbol || !allowed.has(symbol) || !id || !isRecentCatalystDate(trade?.date, now)) continue;
      const key = 'catalyst:congress:' + id;
      if (states.has(key)) continue;
      events.push({
        stateKey: key,
        type: 'catalyst',
        severity: 'medium',
        symbol,
        title: symbol + ' congressional trade disclosed',
        message: (trade?.politician || 'Unknown filer') + ' reported a ' + (trade?.transactionType || 'transaction') + ' in the range ' + (trade?.amountRange || 'not disclosed') + (trade?.date ? ' · ' + trade.date : ''),
        source: 'Congressional disclosure feed',
      });
    }
  }

  // Deduplicate before Telegram delivery and state persistence. A feed can contain
  // the same disclosure more than once; sending first and deduplicating later
  // caused duplicate Telegram messages and a PostgreSQL ON CONFLICT failure.
  const uniqueEvents = [];
  const seenEventKeys = new Set();
  for (const event of events) {
    if (!event?.stateKey || seenEventKeys.has(event.stateKey)) continue;
    seenEventKeys.add(event.stateKey);
    uniqueEvents.push(event);
  }
  events.length = 0;
  events.push(...uniqueEvents.slice(0, MAX_SMART_ALERTS_PER_SCAN));

  if (events.length) {
    try {
      forecastValidationContexts = await getForecastValidationContexts([...new Set(events.map(event => event.symbol))]);
      events.forEach(event => {
        event.validationContext = forecastValidationContexts.get(event.symbol) || null;
      });
    } catch {
      forecastValidationContexts = new Map();
    }
  }

  const delivery = await sendTelegram(events);
  const deliveredKeys = new Set(delivery.sentEventKeys || []);

  for (const symbol of watchedSymbols) {
    const q = quotes.get(symbol);
    if (!q) continue;
    // Quote evaluation itself is observable even when no alert is triggered.
    // Persist only active/triggered states below to keep the state table compact.
  }

  for (const event of events) {
    if (!deliveredKeys.has(event.stateKey)) continue;
    stateUpdates.push({
      event_key: event.stateKey,
      active: true,
      last_seen_at: timestamp,
      last_triggered_at: timestamp,
      metadata: {
        symbol: event.symbol,
        type: event.type,
        title: event.title,
      },
    });
  }

  await upsertRows('server_alert_state', stateUpdates);

  return {
    evaluated_symbols: watchedSymbols.length,
    fresh_quotes: quotes.size,
    configured_price_rules: normalizedAlerts.filter(alert => alert.active).length,
    candidate_events: events.length,
    sent: delivery.sent,
    errors: delivery.errors,
    catalyst_scan: Boolean(catalystFeed),
    forecast_validation_contexts: forecastValidationContexts.size,
    checked_at: timestamp,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorize(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const summary = await evaluate();
    const status = summary.errors.length && !summary.sent ? 502 : 200;
    return res.status(status).json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Server alert evaluation failed' });
  }
}
 + row.price.toFixed(2) : '')
    );

    events.push({
      stateKey: summaryKey,
      type: 'large-move',
      severity: summaryRows.some(row => (Number(row.changePct) || 0) >= (Number(config.large_move_pct) || 5) * LARGE_MOVE_CRITICAL_MULTIPLIER)
        ? 'critical'
        : 'high',
      symbol: 'US MARKET',
      title: 'Large moves consolidated',
      message: 'Regular-session large moves for ' + session.sessionDate + ':\\n' + lines.join('\\n'),
      source: 'Server smart alert session summary',
      sessionDate: session.sessionDate,
    });
  }

  // Deliver the consolidated summary separately so it is included in the same
  // run but still gets its own durable sent-state.
  let summaryDelivery = { sent: 0, sentEventKeys: [], errors: [] };
  const summaryEvent = events.find(event => event.stateKey === summaryKey);
  if (summaryEvent) {
    summaryDelivery = await sendTelegram([summaryEvent]);
    if (summaryDelivery.sent) deliveredKeys.add(summaryKey);
  }

  for (const symbol of watchedSymbols) {
    const q = quotes.get(symbol);
    if (!q) continue;
    // Quote evaluation itself is observable even when no alert is triggered.
    // Persist only active/triggered states below to keep the state table compact.
  }

  for (const event of events) {
    if (!deliveredKeys.has(event.stateKey)) continue;
    stateUpdates.push({
      event_key: event.stateKey,
      active: true,
      last_seen_at: timestamp,
      last_triggered_at: timestamp,
      metadata: {
        symbol: event.symbol,
        type: event.type,
        title: event.title,
      },
    });
  }

  await upsertRows('server_alert_state', stateUpdates);

  return {
    evaluated_symbols: watchedSymbols.length,
    fresh_quotes: quotes.size,
    configured_price_rules: normalizedAlerts.filter(alert => alert.active).length,
    candidate_events: events.length,
    sent: delivery.sent,
    errors: delivery.errors,
    catalyst_scan: Boolean(catalystFeed),
    forecast_validation_contexts: forecastValidationContexts.size,
    checked_at: timestamp,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorize(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const summary = await evaluate();
    const status = summary.errors.length && !summary.sent ? 502 : 200;
    return res.status(status).json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Server alert evaluation failed' });
  }
}
 + q.price.toFixed(2) + '. ' +
          (severity === 'critical'
            ? 'Move is at least ' + (threshold * LARGE_MOVE_CRITICAL_MULTIPLIER).toFixed(2) + '%.'
            : 'Move crossed the configured ' + threshold.toFixed(2) + '% threshold.'),
        source: 'Yahoo Finance quote',
        sessionDate: session.sessionDate,
      });

      if (events.length >= MAX_SMART_ALERTS_PER_SCAN) break;
    }
  }

  let catalystFeed = null;
  if (config.catalyst_alerts) {
    try {
      const minute = now.getUTCMinutes();
      if (minute % 30 === 0 || String(process.env.SMART_ALERT_FORCE || '').toLowerCase() === 'true') {
        catalystFeed = await fetchCatalystFeed();
      }
    } catch {
      catalystFeed = null;
    }

    const allowed = new Set(watchedSymbols);
    for (const contract of Array.isArray(catalystFeed?.contracts) ? catalystFeed.contracts : []) {
      const symbol = String(contract?.company || '').trim().toUpperCase();
      const id = String(contract?.id || '').trim();
      if (!symbol || !allowed.has(symbol) || !id || !isRecentCatalystDate(contract?.dateSigned, now)) continue;
      const key = 'catalyst:contract:' + id;
      if (states.has(key)) continue;
      events.push({
        stateKey: key,
        type: 'catalyst',
        severity: 'high',
        symbol,
        title: symbol + ' SEC agreement detected',
        message: (contract?.client || 'Material definitive agreement') + ' · ' + (contract?.value || 'Value not quantified') + (contract?.dateSigned ? ' · ' + contract.dateSigned : ''),
        source: 'SEC EDGAR',
      });
    }

    for (const trade of Array.isArray(catalystFeed?.congressTrades) ? catalystFeed.congressTrades : []) {
      const symbol = String(trade?.stockSymbol || '').trim().toUpperCase();
      const id = String(trade?.id || '').trim();
      if (!symbol || !allowed.has(symbol) || !id || !isRecentCatalystDate(trade?.date, now)) continue;
      const key = 'catalyst:congress:' + id;
      if (states.has(key)) continue;
      events.push({
        stateKey: key,
        type: 'catalyst',
        severity: 'medium',
        symbol,
        title: symbol + ' congressional trade disclosed',
        message: (trade?.politician || 'Unknown filer') + ' reported a ' + (trade?.transactionType || 'transaction') + ' in the range ' + (trade?.amountRange || 'not disclosed') + (trade?.date ? ' · ' + trade.date : ''),
        source: 'Congressional disclosure feed',
      });
    }
  }

  // Deduplicate before Telegram delivery and state persistence. A feed can contain
  // the same disclosure more than once; sending first and deduplicating later
  // caused duplicate Telegram messages and a PostgreSQL ON CONFLICT failure.
  const uniqueEvents = [];
  const seenEventKeys = new Set();
  for (const event of events) {
    if (!event?.stateKey || seenEventKeys.has(event.stateKey)) continue;
    seenEventKeys.add(event.stateKey);
    uniqueEvents.push(event);
  }
  events.length = 0;
  events.push(...uniqueEvents.slice(0, MAX_SMART_ALERTS_PER_SCAN));

  if (events.length) {
    try {
      forecastValidationContexts = await getForecastValidationContexts([...new Set(events.map(event => event.symbol))]);
      events.forEach(event => {
        event.validationContext = forecastValidationContexts.get(event.symbol) || null;
      });
    } catch {
      forecastValidationContexts = new Map();
    }
  }

  const delivery = await sendTelegram(events);
  const deliveredKeys = new Set(delivery.sentEventKeys || []);

  for (const symbol of watchedSymbols) {
    const q = quotes.get(symbol);
    if (!q) continue;
    // Quote evaluation itself is observable even when no alert is triggered.
    // Persist only active/triggered states below to keep the state table compact.
  }

  for (const event of events) {
    if (!deliveredKeys.has(event.stateKey)) continue;
    stateUpdates.push({
      event_key: event.stateKey,
      active: true,
      last_seen_at: timestamp,
      last_triggered_at: timestamp,
      metadata: {
        symbol: event.symbol,
        type: event.type,
        title: event.title,
      },
    });
  }

  await upsertRows('server_alert_state', stateUpdates);

  return {
    evaluated_symbols: watchedSymbols.length,
    fresh_quotes: quotes.size,
    configured_price_rules: normalizedAlerts.filter(alert => alert.active).length,
    candidate_events: events.length,
    sent: delivery.sent,
    errors: delivery.errors,
    catalyst_scan: Boolean(catalystFeed),
    forecast_validation_contexts: forecastValidationContexts.size,
    checked_at: timestamp,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorize(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const summary = await evaluate();
    const status = summary.errors.length && !summary.sent ? 502 : 200;
    return res.status(status).json({ ok: true, ...summary });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Server alert evaluation failed' });
  }
}
