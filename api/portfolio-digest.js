import { requireAccess } from './_access-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  return Boolean(secret) && req.headers?.authorization === 'Bearer ' + secret;
}

function authorize(req, res) {
  if (isCron(req)) return true;
  return requireAccess(req, res);
}

function headers() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
}

async function supabase(path) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers: headers() });
  if (!response.ok) throw new Error('Supabase portfolio request failed: HTTP ' + response.status);
  return response.json();
}

async function quote(symbol) {
  const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=1d&interval=1d', {
    headers: { 'User-Agent': 'ai-infra-watch/1.0' },
  });
  if (!response.ok) throw new Error('quote unavailable');
  const body = await response.json();
  const meta = body?.chart?.result?.[0]?.meta || {};
  const price = Number(meta.regularMarketPrice);
  const prev = Number(meta.chartPreviousClose);
  if (!Number.isFinite(price)) throw new Error('quote unavailable');
  return { price, changePct: Number.isFinite(prev) && prev ? (price / prev - 1) * 100 : 0 };
}

async function buildDigest() {
  const holdings = await supabase('portfolio_holdings?select=symbol,quantity,average_cost&order=symbol.asc');
  const rows = await Promise.all(holdings.map(async holding => {
    try {
      const q = await quote(String(holding.symbol).toUpperCase());
      const quantity = Number(holding.quantity);
      const cost = Number(holding.average_cost);
      const value = q.price * quantity;
      const pnl = (q.price - cost) * quantity;
      return { symbol: String(holding.symbol).toUpperCase(), value, pnl, pnlPct: cost ? (q.price / cost - 1) * 100 : 0, changePct: q.changePct };
    } catch {
      return { symbol: String(holding.symbol).toUpperCase(), value: 0, pnl: 0, pnlPct: 0, changePct: null };
    }
  }));
  const valid = rows.filter(row => row.value > 0);
  const totalValue = valid.reduce((sum, row) => sum + row.value, 0);
  const totalPnl = valid.reduce((sum, row) => sum + row.pnl, 0);
  const movers = [...valid].filter(row => row.changePct != null).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 5);
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    'AI Infra Watch — Daily Portfolio Summary',
    date,
    '',
    'Portfolio value: $' + totalValue.toFixed(2),
    'Unrealized P&L: ' + (totalPnl >= 0 ? '+' : '') + '$' + totalPnl.toFixed(2),
    '',
    'Largest daily moves:',
    ...movers.map(row => row.symbol + ': ' + (row.changePct >= 0 ? '+' : '') + row.changePct.toFixed(2) + '% · P&L ' + (row.pnl >= 0 ? '+' : '') + '$' + row.pnl.toFixed(2)),
    '',
    'Measurement only — no trading instructions.'
  ];
  return { date, text: lines.join('\n'), rows: valid, totalValue, totalPnl };
}

async function deliver(digest, channels) {
  const delivered = [];
  const errors = [];

  const webhookUrl = process.env.PORTFOLIO_DIGEST_WEBHOOK_URL;
  if ((channels.includes('webhook') || (!channels.length && webhookUrl)) && webhookUrl) {
    try {
      const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'ai-infra-watch', type: 'portfolio_daily_digest', ...digest }) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      delivered.push('webhook');
    } catch (error) { errors.push('webhook: ' + (error instanceof Error ? error.message : 'delivery failed')); }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if ((channels.includes('telegram') || (!channels.length && botToken && chatId)) && botToken && chatId) {
    try {
      const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: digest.text }) });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      delivered.push('telegram');
    } catch (error) { errors.push('telegram: ' + (error instanceof Error ? error.message : 'delivery failed')); }
  }

  const resendKey = process.env.RESEND_API_KEY;
  const emailTo = process.env.PORTFOLIO_DIGEST_EMAIL;
  if ((channels.includes('email') || (!channels.length && resendKey && emailTo)) && resendKey && emailTo) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.PORTFOLIO_DIGEST_FROM || 'AI Infra Watch <onboarding@resend.dev>', to: [emailTo], subject: 'AI Infra Watch — Daily Portfolio Summary ' + digest.date, text: digest.text }),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      delivered.push('email');
    } catch (error) { errors.push('email: ' + (error instanceof Error ? error.message : 'delivery failed')); }
  }

  return { delivered, errors };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorize(req, res)) return;
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const digest = await buildDigest();
    const requested = req.method === 'POST'
      ? String(req.body?.channels || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
      : [];
    const delivery = await deliver(digest, requested);
    if (req.method === 'GET' && !isCron(req)) return res.status(200).json({ ...digest, delivery: { configured: delivery.delivered, errors: delivery.errors } });
    return res.status(delivery.errors.length && !delivery.delivered.length ? 502 : 200).json({ ok: true, ...digest, delivery });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Portfolio digest failed' });
  }
}
