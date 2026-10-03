import { requireAccess } from '../../api/_access-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function headers() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service configuration is missing');
  }
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };
}

function normalizeConfig(input = {}) {
  const watchlist = Array.isArray(input.watchlist)
    ? [...new Set(input.watchlist.map(value => String(value).trim().toUpperCase()).filter(Boolean))].slice(0, 50)
    : [];

  const alerts = Array.isArray(input.alerts)
    ? input.alerts.map(alert => ({
        symbol: String(alert?.symbol || '').trim().toUpperCase(),
        targetPrice: Number(alert?.targetPrice),
        type: alert?.type === 'below' ? 'below' : 'above',
        active: alert?.active === true,
      })).filter(alert =>
        /^[A-Z0-9.^=-]{1,20}$/.test(alert.symbol)
        && Number.isFinite(alert.targetPrice)
        && alert.targetPrice >= 0
      ).slice(0, 100)
    : [];

  const largeMovePct = Number(input.largeMovePct);
  return {
    id: 'default',
    watchlist,
    alerts,
    large_move_enabled: input.largeMoveEnabled === true,
    large_move_pct: Number.isFinite(largeMovePct) ? Math.min(100, Math.max(0.1, largeMovePct)) : 5,
    catalyst_alerts: input.catalystAlerts === true,
  };
}

async function readConfig() {
  const response = await fetch(
    SUPABASE_URL + '/rest/v1/server_alert_config?select=id,watchlist,alerts,large_move_enabled,large_move_pct,catalyst_alerts,updated_at&id=eq.default&limit=1',
    { headers: headers() },
  );
  if (!response.ok) throw new Error('Supabase alert config read failed: HTTP ' + response.status);
  const rows = await response.json();
  return rows?.[0] || null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!requireAccess(req, res)) return;

  try {
    if (req.method === 'GET') {
      const config = await readConfig();
      return res.status(200).json({ ok: true, configured: Boolean(config), config });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const config = normalizeConfig(req.body || {});
    const response = await fetch(SUPABASE_URL + '/rest/v1/server_alert_config', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return res.status(502).json({ ok: false, error: 'Supabase alert config write failed: HTTP ' + response.status + (detail ? ' ' + detail.slice(0, 300) : '') });
    }

    return res.status(200).json({ ok: true, synced: true, updated_at: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Alert config request failed' });
  }
}
