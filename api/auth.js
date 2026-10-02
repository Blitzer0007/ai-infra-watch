import { accessConfigured } from './_access-auth.js';

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function expectedToken() {
  return String(process.env.AIW_ACCESS_TOKEN || process.env.AGENT_API_TOKEN || '').trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const configured = expectedToken();
  if (!configured || !accessConfigured()) {
    return res.status(503).json({ ok: false, error: 'Private access is not configured' });
  }

  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.headers?.['x-real-ip'] || 'unknown');
  const now = Date.now();
  const prior = attempts.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > prior.resetAt) {
    prior.count = 0;
    prior.resetAt = now + WINDOW_MS;
  }
  prior.count += 1;
  attempts.set(ip, prior);
  if (prior.count > MAX_ATTEMPTS) {
    return res.status(429).json({ ok: false, error: 'Too many authentication attempts' });
  }

  const token = String(req.body?.token || '').trim();
  if (!token || token !== configured) {
    return res.status(401).json({ ok: false, error: 'Invalid access token' });
  }

  attempts.delete(ip);
  return res.status(200).json({ ok: true, authenticated: true });
}
