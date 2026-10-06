import { createPublicKey, createVerify } from 'node:crypto';
import { history as routedHistory, quote as routedQuote } from '../../api/_market-data.js';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS_URL = GITHUB_OIDC_ISSUER + '/.well-known/jwks';
const GITHUB_REPOSITORY = 'Blitzer0007/ai-infra-watch';
let githubJwksCache = { expiresAt: 0, keys: [] };

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
  if (workflowPath !== '.github/workflows/forecast-auto-tracker.yml') return false;
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now) return false;
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
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(parts[0] + '.' + parts[1]);
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(parts[2], 'base64url'));
  } catch { return false; }
}

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function headers(prefer = 'return=representation') {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: prefer,
  };
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase forecast automation configuration is missing');
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = [];
  try { data = text ? JSON.parse(text) : []; } catch { data = text; }
  if (!response.ok) throw new Error('Supabase forecast automation request failed: HTTP ' + response.status);
  return data;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map(value => (value - m) ** 2)));
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const x = (sorted.length - 1) * p;
  const low = Math.floor(x);
  const high = Math.ceil(x);
  return low === high ? sorted[low] : sorted[low] + (sorted[high] - sorted[low]) * (x - low);
}

function features(series, index) {
  const price = series[index]?.price;
  if (!(price > 0) || index < 20) return null;
  const ret = (days) => {
    if (index < days) return 0;
    const prior = series[index - days]?.price;
    return prior > 0 ? (price / prior - 1) * 100 : 0;
  };
  const daily = [];
  for (let j = Math.max(1, index - 20); j <= index; j++) {
    const prior = series[j - 1]?.price;
    const current = series[j]?.price;
    if (prior > 0 && current > 0) daily.push((current / prior - 1) * 100);
  }
  return {
    m20: ret(20),
    m60: ret(60),
    m252: ret(252),
    vol: stdev(daily) * Math.sqrt(252),
  };
}

function distribution(series, horizon) {
  if (series.length < 220 + horizon) return null;
  const current = features(series, series.length - 1);
  if (!current) return null;
  const candidates = [];
  for (let i = 60; i + horizon < series.length; i++) {
    const base = series[i]?.price;
    const future = series[i + horizon]?.price;
    if (!(base > 0 && future > 0)) continue;
    const f = features(series, i);
    if (!f) continue;
    const distance = Math.abs(f.m20 - current.m20) + Math.abs(f.vol - current.vol) * 0.7;
    candidates.push({ distance, ret: (future / base - 1) * 100 });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const sample = candidates.slice(0, Math.min(25, candidates.length)).map(item => item.ret);
  if (sample.length < 8) return null;
  return {
    sample,
    median: percentile(sample, 0.5),
    p25: percentile(sample, 0.25),
    p75: percentile(sample, 0.75),
    p10: percentile(sample, 0.10),
    p90: percentile(sample, 0.90),
  };
}

function addBusinessDays(start, days) {
  const date = new Date(start);
  let remaining = Math.max(0, Number(days) || 0);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date.toISOString().slice(0, 10);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'auto-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

async function getActiveModel(ticker, horizon) {
  const rows = await supabase(
    'forecast_model_config?select=active_model&ticker=eq.' + encodeURIComponent(ticker) +
    '&horizon=eq.' + encodeURIComponent(String(horizon)) + '&limit=1',
    { method: 'GET' },
  );
  return rows?.[0]?.active_model || 'analogue-v1';
}

async function pendingExists(ticker, horizon, scenarioId, modelVersion) {
  const rows = await supabase(
    'forecast_snapshots?select=id&ticker=eq.' + encodeURIComponent(ticker) +
    '&horizon=eq.' + encodeURIComponent(String(horizon)) +
    '&scenario_id=eq.' + encodeURIComponent(scenarioId) +
    '&model_version=eq.' + encodeURIComponent(modelVersion) +
    '&status=eq.pending&limit=1',
    { method: 'GET' },
  );
  return rows.length > 0;
}

async function buildAutoForecast(holding, horizon = 20) {
  const ticker = String(holding.symbol || '').trim().toUpperCase();
  if (!ticker) return { skipped: true, reason: 'missing ticker' };

  const modelVersion = await getActiveModel(ticker, horizon);
  const scenarioId = 'base';
  if (await pendingExists(ticker, horizon, scenarioId, modelVersion)) {
    return { skipped: true, ticker, reason: 'pending forecast already exists' };
  }

  const [quoteData, marketData] = await Promise.all([
    routedQuote(ticker),
    routedHistory(ticker, '5y'),
  ]);
  if (quoteData.stale) return { skipped: true, ticker, reason: 'quote is stale' };

  const points = marketData.points || [];
  const forecast = distribution(points, horizon);
  if (!forecast) return { skipped: true, ticker, reason: 'insufficient historical data' };

  const capturedAt = new Date().toISOString();
  const row = {
    id: createId(),
    ticker,
    created_at: capturedAt,
    target_date: addBusinessDays(capturedAt, horizon),
    horizon: String(horizon),
    scenario_id: scenarioId,
    entry_price: Number(quoteData.price),
    median: forecast.median,
    p25: forecast.p25,
    p75: forecast.p75,
    p10: forecast.p10,
    p90: forecast.p90,
    status: 'pending',
    created_source: 'auto_portfolio',
    model_version: modelVersion,
    decision_thesis: holding.decision_thesis || '',
    loss_limit_pct: holding.loss_limit_pct == null ? null : Number(holding.loss_limit_pct),
    exit_rule_type: holding.exit_rule_type || null,
    exit_rule_value: holding.exit_rule_value == null ? null : Number(holding.exit_rule_value),
    exit_rule_text: holding.exit_rule_text || '',
    practical_notes: holding.practical_notes || '',
    evidence_snapshot: {
      capturedAt,
      source: 'auto_portfolio',
      ticker,
      quote: {
        price: Number(quoteData.price),
        changePct: Number(quoteData.changePct || 0),
        provider: quoteData.provider || quoteData.source || 'market-router',
      },
      historyThrough: points.at(-1)?.date || null,
      modelVersion,
      counts: { analyst: 0, news: 0, contracts: 0, political: 0, macro: 0 },
    },
  };

  const saved = await supabase('forecast_snapshots', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  return { created: true, ticker, id: saved?.[0]?.id || row.id, targetDate: row.target_date };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = String(process.env.CRON_SECRET || '').trim();
  const auth = String(req.headers?.authorization || '');
  const secretOk = Boolean(secret && auth === 'Bearer ' + secret);
  const oidcOk = !secretOk && await githubOidcVerified(req);
  if (!secretOk && !oidcOk) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  const runId = createId();
  const source = secretOk ? 'supabase_cron' : 'github_actions';
  const slot = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const recordRun = async (patch) => {
    try {
      if (patch === 'start') {
        await supabase('forecast_scheduler_runs', {
          method: 'POST',
          body: JSON.stringify({ id: runId, source, slot, status: 'started', metadata: { userAgent: String(req.headers?.['user-agent'] || '') } }),
        });
      } else {
        await supabase('forecast_scheduler_runs?id=eq.' + encodeURIComponent(runId), {
          method: 'PATCH',
          body: JSON.stringify({ ...patch, finished_at: new Date().toISOString() }),
          headers: { Prefer: 'return=minimal' },
        });
      }
    } catch (error) {
      console.error('forecast scheduler run tracking failed:', error);
    }
  };
  await recordRun('start');

  try {
    const horizons = [5, 20];
    const holdings = await supabase('portfolio_holdings?select=symbol,quantity,average_cost,purchase_date,decision_thesis,loss_limit_pct,exit_rule_type,exit_rule_value,exit_rule_text,practical_notes&quantity=gt.0&order=symbol.asc', { method: 'GET' });
    const results = [];
    for (const horizon of horizons) {
      for (const holding of holdings) {
        try {
          results.push({ horizon, ...(await buildAutoForecast(holding, horizon)) });
        } catch (error) {
          results.push({
            horizon,
            skipped: true,
            ticker: String(holding.symbol || '').toUpperCase(),
            reason: error instanceof Error ? error.message : 'forecast generation failed',
          });
        }
      }
    }

    const created = results.filter(item => item.created).length;
    const skipped = results.filter(item => item.skipped).length;
    const createdByHorizon = Object.fromEntries(horizons.map(horizon => [String(horizon), results.filter(item => item.horizon === horizon && item.created).length]));
    const skippedByHorizon = Object.fromEntries(horizons.map(horizon => [String(horizon), results.filter(item => item.horizon === horizon && item.skipped).length]));
    await recordRun({ status: 'completed', http_status: 200, holdings: holdings.length, created_count: created, skipped_count: skipped, metadata: { horizons, createdByHorizon, skippedByHorizon, results } });
    return res.status(200).json({
      ok: true,
      horizons,
      holdings: holdings.length,
      created,
      skipped,
      createdByHorizon,
      skippedByHorizon,
      results,
      schedulerRunId: runId,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Forecast auto-tracking failed.';
    await recordRun({ status: 'failed', http_status: 500, error: message });
    console.error('forecast auto-track error:', error);
    return res.status(500).json({ ok: false, error: message, schedulerRunId: runId });
  }
}
