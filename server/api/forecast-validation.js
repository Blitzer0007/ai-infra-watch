import { requireAccess } from '../../api/_access-auth.js';
import { forecastHorizon } from '../../src/utils/forecastInputs.js';
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

async function loadVerifiedForecasts({ ticker, horizon, horizons = null, createdSource = null } = {}) {
  const params = new URLSearchParams();
  // created_at and target_date are required by independentForecastRows to identify non-overlapping samples.
  params.set('select', 'ticker,horizon,status,created_at,target_date,median,p25,p75,p10,p90,actual_return,median_error,verified_at,evidence_snapshot,created_source');
  params.set('status', 'eq.verified');
  if (createdSource) params.set('created_source', 'eq.' + encodeURIComponent(createdSource));
  params.set('order', 'verified_at.desc');
  params.set('limit', String(MAX_ROWS));
  if (ticker) params.set('ticker', 'eq.' + String(ticker).trim().toUpperCase());
  if (horizons) params.set('horizon', 'in.(' + horizons.join(',') + ')');
  else if (horizon !== null && horizon !== undefined) {
    params.set('horizon', 'eq.' + String(Number(horizon)));
  }

  const response = await fetch(SUPABASE_URL + '/rest/v1/forecast_snapshots?' + params.toString(), {
    headers: headers(),
  });
  if (!response.ok) throw new Error('Verified forecast history is unavailable.');
  let data;
  try { data = await response.json(); } catch { throw new Error('Verified forecast history is unavailable.'); }
  if (!Array.isArray(data) || data.some(row => row === null || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('Verified forecast history is unavailable.');
  }
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  if (!requireAccess(req, res)) return;

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    if (req.query?.ticker !== undefined && typeof req.query.ticker !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid ticker.' });
    }
    const ticker = String(req.query?.ticker || '').trim().toUpperCase();
    const suppliedHorizon = req.query?.horizon;
    const horizon = suppliedHorizon === undefined ? null : forecastHorizon(suppliedHorizon);
    if (suppliedHorizon !== undefined && horizon === null) return res.status(400).json({ ok: false, error: 'Invalid horizon.' });
    if (ticker && !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
      return res.status(400).json({ ok: false, error: 'Invalid ticker.' });
    }

    const rows = await loadVerifiedForecasts({ ticker: ticker || null, horizon });
    const summary = buildForecastValidationSummary(rows);
    const learning = buildForecastLearningSummary(rows);
    const globalRows = ticker || horizon !== null ? await loadVerifiedForecasts({ horizons: [5, 20] }) : rows;
    const globalStreams = globalRows.filter(row => [5, 20].includes(forecastHorizon(row.horizon)));
    const globalValidationGate = buildForecastValidationSummary(globalStreams).validationGate;

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
      globalScope: { horizons: [5, 20], rowLimit: MAX_ROWS, truncated: globalRows.length >= MAX_ROWS },
      contractVersion: 'forecast-summary-v2',
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({
      ok: false,
      error: 'Forecast validation is unavailable.',
    });
  }
}
