import { requireAccess } from '../../api/_access-auth.js';
import { buildForecastValidationSummary, buildForecastLearningSummary } from '../utils/forecastValidation.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const MAX_ROWS = 2000;

function headers() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service configuration is missing');
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
}

async function loadVerifiedForecasts({ ticker, horizon, createdSource = 'auto_portfolio' } = {}) {
  const params = new URLSearchParams();
  params.set('select', 'ticker,horizon,status,median,p25,p75,p10,p90,actual_return,median_error,verified_at,evidence_snapshot,created_source');
  params.set('status', 'eq.verified');
  if (createdSource) params.set('created_source', 'eq.' + encodeURIComponent(createdSource));
  params.set('order', 'verified_at.desc');
  params.set('limit', String(MAX_ROWS));
  if (ticker) params.set('ticker', 'eq.' + String(ticker).trim().toUpperCase());
  if (Number.isFinite(Number(horizon))) params.set('horizon', 'eq.' + String(Number(horizon)));

  const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?' + params.toString(), {
    headers: headers(),
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(data?.message || 'Failed to load verified forecast history.');
  }
  return Array.isArray(data) ? data : [];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  if (!requireAccess(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const ticker = String(req.query?.ticker || '').trim().toUpperCase();
    const horizonValue = Number(req.query?.horizon);
    const horizon = Number.isFinite(horizonValue) ? horizonValue : null;
    if (ticker && !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
      return res.status(400).json({ ok: false, error: 'Invalid ticker.' });
    }

    const rows = await loadVerifiedForecasts({ ticker: ticker || null, horizon });
    const summary = buildForecastValidationSummary(rows);
    const learning = buildForecastLearningSummary(rows);
    let globalValidationGate = summary.validationGate;
    if (ticker || horizon != null) {
      const globalRows = await loadVerifiedForecasts({ horizon: horizon ?? 20 });
      globalValidationGate = buildForecastValidationSummary(globalRows).validationGate;
    }

    return res.status(200).json({
      ok: true,
      scope: {
        ticker: ticker || null,
        horizon,
        rowLimit: MAX_ROWS,
        truncated: rows.length >= MAX_ROWS,
      },
      ...summary,
      learning,
      globalValidationGate,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Forecast validation request failed.',
    });
  }
}
