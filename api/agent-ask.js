import { requireAccess } from './_access-auth.js';
import { sourceQualityDevelopmentEnabled, sourceQualityPayload, sourceQualityEnvelope, sourceQualityResponseText } from '../server/services/sourceQualityInput.js';
import {councilDevelopmentProxy} from '../server/services/portfolioCouncilTransport.js';
import { agentBackendOrigin } from '../server/services/trustedBackendOrigin.js';

const DEFAULT_TIMEOUT_MS = 55000;
const rateState = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 12;

function rateLimited(req) {
  const ip = String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const current = rateState.get(ip);
  if (!current || now >= current.resetAt) {
    rateState.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

export function agentBackendToken(env = process.env) {
  // Keep this precedence in sync with app.config.settings.AGENT_API_TOKEN.
  return String(
    env.AI_INFRA_AGENT_TOKEN || env.AIW_ACCESS_TOKEN || env.AGENT_API_TOKEN || env.CRON_SECRET || ''
  ).trim();
}

function backendHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = agentBackendToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  return AbortSignal.timeout(ms);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (!requireAccess(req, res)) return;
  if(req.query?.task==='council'){
    if(rateLimited(req))return res.status(429).json({error:'Review request limit reached'});
    return councilDevelopmentProxy(req,res,agentBackendToken());
  }
  if(req.query?.task!=null){
    if(req.query.task!=='source-quality')return res.status(400).json({error:'Unknown research task'});
    if(!sourceQualityDevelopmentEnabled())return res.status(404).json({error:'Development review unavailable'});
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'POST required'});}
    if(rateLimited(req))return res.status(429).json({error:'Review request limit reached'});
    const payload=sourceQualityPayload(req.body);
    if(!payload)return res.status(400).json({error:'Invalid source-quality request'});
    // The development-only role may contact only an explicitly configured
    // loopback backend. Never derive this target from an incoming Host header.
    const configured=String(process.env.AI_INFRA_AGENT_URL||'').trim();
    let target;
    try{
      target=new URL(configured);
      if(target.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error();
    }catch{return res.status(503).json({error:'Development review unavailable'});}
    try{
      const upstream=await fetch(new URL('/api/agent-python?task=source-quality',target),{method:'POST',headers:backendHeaders(),body:JSON.stringify(payload),signal:withTimeout(8000),redirect:'error'});
      if(!upstream.ok)return res.status(upstream.status===429?429:503).json({error:'Source-quality review unavailable'});
      const raw=await sourceQualityResponseText(upstream);
      const data=JSON.parse(raw);
      if(!sourceQualityEnvelope(data,payload.run_id))throw new Error();
      return res.status(200).json(data);
    }catch{return res.status(503).json({error:'Source-quality review unavailable'});}
  }
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (rateLimited(req)) {
    res.status(429).json({ ok: false, error: 'Too many autonomous research requests' });
    return;
  }
  const base = agentBackendOrigin();

  if (!base) {
    res.status(503).json({
      ok: false,
      error: 'Autonomous backend is not configured',
      hint: 'Use an explicit trusted AI_INFRA_AGENT_URL origin, or the current deployment VERCEL_URL supplied by Vercel. Request headers cannot configure a backend.',
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
        redirect: 'error',
      });
      if (upstream.redirected || (upstream.status >= 300 && upstream.status < 400)) throw new Error('Redirect rejected');
      const body = await upstream.json().catch(() => ({}));
      res.status(upstream.status).json(body);
    } catch {
      res.status(502).json({
        ok: false,
        error: 'Autonomous backend health check failed',
      });
    }
    return;
  }

  try {
    const upstream = await fetch(`${base}/api/agent-python`, {
      method: 'POST',
      headers: backendHeaders(),
      body: JSON.stringify(req.body || {}),
      signal: withTimeout(),
      redirect: 'error',
    });
    if (upstream.redirected || (upstream.status >= 300 && upstream.status < 400)) throw new Error('Redirect rejected');

    const body = await upstream.json().catch(() => ({
      ok: false,
      error: 'Autonomous backend returned a non-JSON response',
    }));

    res.status(upstream.status).json(body);
  } catch {
    res.status(502).json({
      ok: false,
      error: 'Autonomous backend request failed',
    });
  }
}
