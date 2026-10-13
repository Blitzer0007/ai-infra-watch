import { requireAccess } from '../../api/_access-auth.js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BENCHMARKS = ['SPY', 'QQQ'];
const MAX_ROWS = 20;

function dbHeaders() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  };
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...dbHeaders(), ...(options.headers || {}) },
    signal: options.signal || AbortSignal.timeout(10000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error('Paper proposal ledger request failed: HTTP ' + response.status + (body ? ' ' + body.slice(0, 300) : ''));
  if (!body) return null;
  try { return JSON.parse(body); } catch { return body; }
}

function validateProposal(input) {
  const clientId = String(input?.clientId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(clientId)) throw new Error('A valid proposal clientId is required.');
  if (input?.mode !== 'paper') throw new Error('Only paper-mode proposals are accepted.');
  const capital = Number(input?.capital);
  const costBps = Number(input?.costBps);
  if (!Number.isFinite(capital) || capital <= 0) throw new Error('Starting capital must be positive.');
  if (!Number.isFinite(costBps) || costBps < 0 || costBps > 500) throw new Error('Transaction cost must be between 0 and 500 basis points.');
  if (input?.universe !== 'US' || input?.reviewFrequency !== 'weekly') throw new Error('The lab is configured for weekly US-equity reviews.');
  if (!Array.isArray(input?.benchmarks) || BENCHMARKS.some(symbol => !input.benchmarks.includes(symbol)) || input.benchmarks.length !== 2) {
    throw new Error('SPY and QQQ must remain the two benchmarks.');
  }
  if (!Array.isArray(input?.target) || input.target.length < 1 || input.target.length > 20) throw new Error('Select between 1 and 20 holdings.');
  const seen = new Set();
  const sectors = new Map();
  let invested = 0;
  const target = input.target.map(item => {
    const symbol = String(item?.symbol || '').trim().toUpperCase();
    const sector = String(item?.sector || '').trim().toLowerCase();
    const weight = Number(item?.weight);
    if (!/^[A-Z][A-Z0-9.^-]{0,9}$/.test(symbol) || !sector || seen.has(symbol)) throw new Error('Holdings require unique valid symbols and sectors.');
    if (!Number.isFinite(weight) || weight < 0 || weight > 0.15 + 1e-9) throw new Error('Position limit exceeded (15% maximum).');
    seen.add(symbol);
    invested += weight;
    sectors.set(sector, (sectors.get(sector) || 0) + weight);
    return { symbol, sector, weight };
  });
  if ([...sectors.values()].some(weight => weight > 0.35 + 1e-9)) throw new Error('Sector concentration limit exceeded (35% maximum).');
  if (invested > 0.95 + 1e-9) throw new Error('Minimum 5% cash reserve breached.');
  const evidenceStatus = ['insufficient','partial','usable','strong'].includes(input?.evidenceStatus) ? input.evidenceStatus : 'insufficient';
  return {
    client_id: clientId,
    mode: 'paper',
    universe: 'US',
    review_frequency: 'weekly',
    capital,
    cost_bps: costBps,
    target,
    benchmarks: BENCHMARKS,
    preview: input.preview && typeof input.preview === 'object' ? input.preview : {},
    research_snapshot: input.researchSnapshot && typeof input.researchSnapshot === 'object' ? input.researchSnapshot : {},
    backtest_snapshot: input.backtestSnapshot && typeof input.backtestSnapshot === 'object' ? input.backtestSnapshot : {},
    evidence_status: evidenceStatus,
    status: 'manual-review',
    updated_at: new Date().toISOString(),
  };
}

async function latestProposals(limit) {
  return supabase('jev_paper_proposals?select=id,client_id,created_at,updated_at,mode,universe,review_frequency,capital,cost_bps,target,benchmarks,preview,research_snapshot,backtest_snapshot,evidence_status,status&order=created_at.desc&limit=' + limit);
}

async function weeklyReview(req, res) {
  const proposals = await latestProposals(1);
  const proposal = proposals?.[0];
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) return res.status(503).json({ ok: false, error: 'Telegram is not configured.' });
  if (!proposal) return res.status(200).json({ ok: true, skipped: true, reason: 'No saved paper proposal exists yet.' });

  const dedupeKey = 'jev-weekly-review:' + new Date().toISOString().slice(0, 10);
  const eventKey = 'notification:' + dedupeKey;
  const existing = await supabase('server_alert_state?event_key=eq.' + encodeURIComponent(eventKey) + '&select=last_triggered_at&limit=1');
  const last = Date.parse(existing?.[0]?.last_triggered_at || '');
  if (Number.isFinite(last) && Date.now() - last < 6 * 24 * 60 * 60 * 1000) {
    return res.status(200).json({ ok: true, suppressed: true, reason: 'Weekly review alert already sent recently.' });
  }

  const targetSymbols = (proposal.target || []).map(item => item.symbol).join(', ');
  const backtest = proposal.backtest_snapshot || {};
  const research = proposal.research_snapshot || {};
  const lines = [
    '🧪 AI Infra Watch · JEV Weekly Paper Review',
    '',
    'Latest saved proposal: ' + targetSymbols,
    'Capital: $' + Number(proposal.capital).toFixed(2) + ' · Transaction cost: ' + proposal.cost_bps + ' bps',
    'Evidence status: ' + (proposal.evidence_status || 'insufficient'),
    'SPY / QQQ benchmarks · manual approval only · no broker orders',
    backtest.observations ? ('Stored exploratory backtest: ' + backtest.observations + ' sessions; strategy ' + Number(backtest.strategyNetReturnPct || 0).toFixed(2) + '%; SPY ' + Number(backtest.spyReturnPct || 0).toFixed(2) + '%; QQQ ' + Number(backtest.qqqReturnPct || 0).toFixed(2) + '%') : 'No saved backtest snapshot; refresh historical data from the lab.',
    research.summary ? ('Latest research: ' + String(research.summary).slice(0, 400)) : 'No saved candidate research summary; run JEV research before changing allocations.',
    '',
    'Reminder: review fresh evidence, conflicts, concentration and data availability before approving any paper changes.',
  ];
  const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n') }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.ok === false) return res.status(502).json({ ok: false, error: body?.description || 'Telegram delivery failed.' });

  await supabase('server_alert_state?on_conflict=event_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      event_key: eventKey,
      active: true,
      last_seen_at: new Date().toISOString(),
      last_triggered_at: new Date().toISOString(),
      metadata: { source: 'jev-lab-weekly-review', proposalId: proposal.id, symbols: targetSymbols },
    }]),
  });
  return res.status(200).json({ ok: true, sent: 1, proposalId: proposal.id });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  if (!requireAccess(req, res)) return;

  if (req.method === 'GET') {
    try {
      const requested = Number(req.query?.limit);
      const limit = Number.isFinite(requested) ? Math.max(1, Math.min(MAX_ROWS, Math.floor(requested))) : 10;
      const proposals = await latestProposals(limit);
      return res.status(200).json({ ok: true, proposals: proposals || [], count: proposals?.length || 0 });
    } catch (error) {
      return res.status(503).json({ ok: false, error: error instanceof Error ? error.message : 'Paper proposal ledger unavailable.' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (String(req.body?.action || req.query?.action || '') === 'weekly-review') {
    try { return await weeklyReview(req, res); }
    catch (error) { return res.status(503).json({ ok: false, error: error instanceof Error ? error.message : 'Weekly paper review failed.' }); }
  }

  try {
    const proposal = validateProposal(req.body);
    const saved = await supabase('jev_paper_proposals?on_conflict=client_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([proposal]),
    });
    return res.status(200).json({ ok: true, proposal: Array.isArray(saved) ? saved[0] || null : saved, persisted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Paper proposal could not be saved.';
    const clientError = /required|positive|between|configured for|benchmarks|Select between|Holdings require|Position limit|Sector concentration|cash reserve|Only paper-mode/i.test(message);
    return res.status(clientError ? 400 : 503).json({ ok: false, error: message, persisted: false });
  }
}
