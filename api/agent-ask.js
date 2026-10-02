import { requireAccess } from './_access-auth.js';

const DEFAULT_TIMEOUT_MS = 55000;

function backendUrl(req) {
  const configured = String(process.env.AI_INFRA_AGENT_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const host = String(req.headers?.host || '').trim();
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

function backendHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  // Native Vercel deployments authenticate the Python agent with AGENT_API_TOKEN.
  // Keep AI_INFRA_AGENT_TOKEN for separate-backend deployments, but fall back to
  // the native token so /api/agent-ask -> /api/agent-python does not self-401.
  const token = String(
    process.env.AGENT_API_TOKEN || process.env.AI_INFRA_AGENT_TOKEN || ''
  ).trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

export default async function handler(req, res) {
  if (!requireAccess(req, res)) return;
  const base = backendUrl(req);

  if (!base) {
    res.status(503).json({
      ok: false,
      error: 'Autonomous backend is not configured',
      hint: 'Configure AI_INFRA_AGENT_URL only when using a separate backend; the production Vercel deployment can use its native /api/agent-python route automatically.',
    });
    return;
  }

  if (req.method === 'GET') {
    try {
      const probe = String(req.query?.probe_mcp || '').trim();
      const healthUrl = probe
        ? `${base}/api/agent-python?probe_mcp=${encodeURIComponent(probe)}`
        : `${base}/api/agent-python`;
      const upstream = await fetch(healthUrl, {
        method: 'GET',
        headers: backendHeaders(),
        signal: withTimeout(8000),
      });
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
    } catch (error) {
      res.status(502).json({
        ok: false,
        error: 'Autonomous backend health check failed',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const upstream = await fetch(`${base}/api/agent-python`, {
      method: 'POST',
      headers: backendHeaders(),
      body: JSON.stringify(req.body || {}),
      signal: withTimeout(),
    });

    const body = await upstream.json().catch(() => ({
      ok: false,
      error: 'Autonomous backend returned a non-JSON response',
    }));

    res.status(upstream.status).json(body);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: 'Autonomous backend request failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
