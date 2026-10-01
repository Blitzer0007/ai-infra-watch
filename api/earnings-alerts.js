import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { history as loadMarketHistory, providerSymbol } from './_market-data.js';

const DEFAULT_LEAD_DAYS = 1;
const DEFAULT_LOOKAHEAD_DAYS = 14;
const VIVO_ALIAS = 'VVPR';

const SYMBOL_ALIASES = {
  VIVO: VIVO_ALIAS,
  GOOG: 'GOOGL',
};

const SPECIFIC_IMPACT_CHANNELS = {
  DGXX: [
    'Power and data-center build-out / utilization',
    'AI hosting contract revenue and customer concentration',
    'Capital spending and financing required to deploy capacity',
  ],
  DRAM: [
    'Memory-sector earnings read-through, especially HBM/DRAM/NAND demand',
    'AI-server memory pricing and supply conditions',
    'Broad semiconductor beta because this is an ETF rather than an operating company',
  ],
  SOXL: [
    'Broad semiconductor earnings and guidance across the basket',
    'AI accelerator, memory and foundry demand signals',
    'Amplified daily exposure can make post-earnings sector moves more pronounced',
  ],
  NVDA: [
    'AI accelerator demand, cloud capex and product mix',
    'Gross-margin / supply-ramp commentary for current and next-generation systems',
    'Export-control and Taiwan-linked supply or demand commentary',
  ],
  MSFT: [
    'Azure growth, AI infrastructure consumption and cloud demand',
    'AI monetization / Copilot adoption versus infrastructure investment',
    'Forward guidance and margin commentary as capex scales',
  ],
  NBIS: [
    'GPU capacity deployment, utilization and contracted revenue',
    'Data-center power / site execution and customer concentration',
    'Capital requirements for expanding AI compute capacity',
  ],
  VIVO: [
    'Power and data-center project execution',
    'Customer pipeline, utilization and infrastructure deployment',
    'Capital needs and financing for capacity expansion',
  ],
  META: [
    'AI capex intensity versus monetization and advertising growth',
    'Training / inference capacity needs and infrastructure efficiency',
    'Forward guidance on spending and operating margins',
  ],
  NOW: [
    'Enterprise software demand, subscription growth and renewals',
    'AI-agent / GenAI monetization and expansion within customers',
    'Forward guidance, remaining performance obligations and margins',
  ],
  PHVS: [
    'Clinical-program progress and regulatory milestones',
    'Cash runway / R&D investment and commercialization timing',
    'Pipeline or launch guidance that can change future expectations',
  ],
  MU: [
    'HBM / DRAM pricing, supply and AI-server demand',
    'HBM capacity ramp, customer mix and memory margins',
    'AI infrastructure capex signals that can read through to memory peers',
  ],
};

const GROUP_IMPACT_CHANNELS = {
  Memory: [
    'Memory pricing and AI-server demand',
    'HBM / DRAM supply, capacity and margins',
    'Read-through to other memory and accelerator suppliers',
  ],
  Semiconductors: [
    'AI / semiconductor demand and product mix',
    'Supply-chain capacity, margins and customer spending',
    'Read-through to semiconductor peers and related ETFs',
  ],
  'AI Compute': [
    'Accelerator demand, utilization and product roadmap',
    'Cloud / data-center capex and capacity deployment',
    'Customer concentration, margins and forward guidance',
  ],
  'AI Infrastructure': [
    'Compute capacity deployment and utilization',
    'Power, data-center execution and customer demand',
    'Capital intensity, financing and forward guidance',
  ],
  'AI Platform': [
    'Cloud / AI capex and infrastructure consumption',
    'AI monetization, customer demand and operating leverage',
    'Forward guidance and margin / spending trajectory',
  ],
  'Enterprise Software': [
    'Enterprise IT spending, subscription growth and renewals',
    'AI monetization / product adoption',
    'Forward guidance, bookings / backlog and margins',
  ],
  'Healthcare': [
    'Clinical / regulatory milestones and commercialization timing',
    'R&D spend and cash runway',
    'Pipeline updates that can change future expectations',
  ],
};

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function canonicalSymbol(symbol) {
  return SYMBOL_ALIASES[cleanSymbol(symbol)] || cleanSymbol(symbol);
}

function loadJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function loadTrackedUniverse() {
  const portfolio = loadJson(
    join(process.cwd(), 'data', 'portfolio_snapshot.json'),
    { positions: [] },
  );
  const watchlist = loadJson(
    join(process.cwd(), 'data', 'stock_watchlist.json'),
    { watchlist: [] },
  );

  const portfolioRows = Array.isArray(portfolio.positions) ? portfolio.positions : [];
  const watchRows = Array.isArray(watchlist.watchlist) ? watchlist.watchlist : [];

  const profiles = new Map();
  const portfolioSymbols = new Set();

  for (const row of portfolioRows) {
    const raw = cleanSymbol(row?.symbol);
    if (!raw) continue;
    const symbol = canonicalSymbol(raw);
    portfolioSymbols.add(raw);
    profiles.set(symbol, {
      symbol,
      name: row?.name || symbol,
      group: row?.group || '',
      theme: row?.theme || '',
      peers: Array.isArray(row?.peers) ? row.peers.map(cleanSymbol).filter(Boolean) : [],
      geo: row?.geo || '',
      directHolding: true,
      portfolioSymbol: raw,
    });
  }

  for (const row of watchRows) {
    const raw = cleanSymbol(row?.symbol);
    if (!raw) continue;
    const symbol = canonicalSymbol(raw);
    const existing = profiles.get(symbol) || { symbol };
    profiles.set(symbol, {
      ...existing,
      symbol,
      name: existing.name || row?.name || symbol,
      group: existing.group || row?.group || '',
      theme: existing.theme || row?.theme || '',
      peers: existing.peers?.length
        ? existing.peers
        : (Array.isArray(row?.peers) ? row.peers.map(cleanSymbol).filter(Boolean) : []),
      geo: existing.geo || row?.geo || '',
      directHolding: Boolean(existing.directHolding),
      portfolioSymbol: existing.portfolioSymbol || null,
    });
  }

  const envSymbols = String(process.env.EARNINGS_ALERT_SYMBOLS || '')
    .split(',')
    .map(cleanSymbol)
    .filter(Boolean);

  if (envSymbols.length) {
    for (const raw of envSymbols) {
      const symbol = canonicalSymbol(raw);
      if (!profiles.has(symbol)) profiles.set(symbol, {
        symbol,
        name: symbol,
        group: '',
        theme: '',
        peers: [],
        geo: '',
        directHolding: portfolioSymbols.has(raw),
        portfolioSymbol: portfolioSymbols.has(raw) ? raw : null,
      });
    }
  }

  return { profiles, portfolioSymbols };
}

function impactChannels(symbol, profile) {
  return SPECIFIC_IMPACT_CHANNELS[symbol]
    || GROUP_IMPACT_CHANNELS[profile?.group]
    || [
      profile?.theme ? profile.theme + ' demand and execution' : 'Revenue and earnings versus expectations',
      profile?.geo ? profile.geo + ' supply / operating conditions' : 'Guidance, margins and forward expectations',
      'Peer and sector read-through from management commentary',
    ];
}

function trackedExposure(symbol, profile, profiles) {
  const direct = [];
  const linked = [];
  if (profile?.directHolding && profile?.portfolioSymbol) direct.push(profile.portfolioSymbol);
  for (const peer of profile?.peers || []) {
    const peerCanonical = canonicalSymbol(peer);
    const peerProfile = profiles.get(peerCanonical);
    if (peerProfile?.directHolding && peerProfile.portfolioSymbol && !direct.includes(peerProfile.portfolioSymbol)) {
      linked.push(peerProfile.portfolioSymbol);
    }
  }
  return { direct, linked };
}

function dateOnlyUtc(value) {
  const d = new Date(value);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetweenUtc(a, b) {
  return Math.round((dateOnlyUtc(b).getTime() - dateOnlyUtc(a).getTime()) / 86400000);
}

function formatEstimate(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'n/a';
}

function formatMoney(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'n/a';
  if (Math.abs(value) >= 1e9) return '$' + (value / 1e9).toFixed(1) + 'B';
  if (Math.abs(value) >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
  return '$' + value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function earningsLabel(event) {
  if (event.hour === 'bmo') return 'Before market open';
  if (event.hour === 'amc') return 'After market close';
  if (event.hour === 'dmh') return 'During market hours';
  return 'Timing not specified';
}

function buildAlert(event, profile, profiles, today) {
  const symbol = canonicalSymbol(event.symbol);
  const daysUntil = daysBetweenUtc(today, event.date);
  const { direct, linked } = trackedExposure(symbol, profile, profiles);
  const reasons = impactChannels(symbol, profile);

  const exposureParts = [];
  if (direct.length) exposureParts.push('Direct holding: ' + direct.join(', '));
  if (linked.length) exposureParts.push('Linked holdings: ' + linked.join(', '));

  const lines = [
    'Earnings report: ' + symbol,
    'Announcement date: ' + event.date + ' · ' + earningsLabel(event),
    'Lead time: ' + daysUntil + ' day' + (daysUntil === 1 ? '' : 's'),
    'Consensus EPS estimate: ' + formatEstimate(event.epsEstimate),
    'Consensus revenue estimate: ' + formatMoney(event.revenueEstimate),
    '',
    'Potential impact channels:',
    ...reasons.map(reason => '• ' + reason),
  ];

  if (exposureParts.length) {
    lines.push('', ...exposureParts.map(item => '• ' + item));
  }

  lines.push('', 'Source: Finnhub earnings calendar', 'Information alert only; no trade instruction is inferred.');

  return {
    id: 'earnings:' + symbol + ':' + event.date,
    symbol,
    date: event.date,
    hour: event.hour || null,
    when: daysUntil > 0 ? 'upcoming' : 'today',
    days_until: daysUntil,
    title: symbol + ' earnings in ' + daysUntil + ' day' + (daysUntil === 1 ? '' : 's'),
    message: lines.join('\n'),
    impact_reasons: reasons,
    direct_holdings: direct,
    linked_holdings: linked,
    profile: {
      name: profile?.name || symbol,
      group: profile?.group || null,
      theme: profile?.theme || null,
      geo: profile?.geo || null,
    },
    consensus: {
      eps_estimate: typeof event.epsEstimate === 'number' ? event.epsEstimate : null,
      revenue_estimate: typeof event.revenueEstimate === 'number' ? event.revenueEstimate : null,
    },
    source: 'finnhub',
  };
}

async function fetchFinnhubCalendar(fromDate, toDate) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'FINNHUB_API_KEY is not configured on the Vercel project.',
      events: [],
    };
  }

  const url = new URL('https://finnhub.io/api/v1/calendar/earnings');
  url.searchParams.set('from', fromDate);
  url.searchParams.set('to', toDate);
  url.searchParams.set('international', 'false');
  url.searchParams.set('token', apiKey);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'AI Infra Watch/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      return {
        ok: false,
        error: 'Finnhub earnings calendar returned HTTP ' + response.status + '.',
        events: [],
      };
    }
    const payload = await response.json();
    return {
      ok: true,
      events: Array.isArray(payload?.earningsCalendar) ? payload.earningsCalendar : [],
    };
  } catch (error) {
    return {
      ok: false,
      error: 'Finnhub earnings calendar request failed: ' + String(error?.message || error),
      events: [],
    };
  }
}

async function sendWebhook(alerts) {
  const url = String(process.env.NOTIFY_WEBHOOK_URL || '').trim();
  if (!url) {
    return {
      configured: false,
      attempted: alerts.length > 0,
      sent: 0,
      error: 'NOTIFY_WEBHOOK_URL is not configured.',
    };
  }

  if (!alerts.length) {
    return { configured: true, attempted: false, sent: 0, error: null };
  }

  const text = alerts.map(alert => '🔔 AI Infra Watch\n' + alert.message).join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
  const payload = {
    text,
    content: text,
    alerts,
    source: 'ai-infra-watch/earnings-alerts',
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      return {
        configured: true,
        attempted: true,
        sent: 0,
        error: 'Notification webhook returned HTTP ' + response.status + '.',
      };
    }
    return { configured: true, attempted: true, sent: alerts.length, error: null };
  } catch (error) {
    return {
      configured: true,
      attempted: true,
      sent: 0,
      error: 'Notification webhook request failed: ' + String(error?.message || error),
    };
  }
}


const HISTORY_MAX_SYMBOLS = 12;
const HISTORY_DEFAULT_LIMIT = 6;
const HISTORY_CACHE_MS = 5 * 60 * 1000;
const historyCache = new Map();

function validHistorySymbol(symbol) {
  return /^[A-Z0-9.^=-]{1,20}$/.test(symbol);
}

function historyPct(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return ((to - from) / from) * 100;
}

function enrichHistoryReaction(points, eventDate) {
  if (!Array.isArray(points) || !points.length) return null;
  const eventIndex = points.findIndex(point => point.date >= eventDate);
  if (eventIndex < 0) return null;
  const before = points[eventIndex - 1];
  const event = points[eventIndex];
  if (!before || !Number.isFinite(before.price) || !Number.isFinite(event.price)) return null;
  return {
    anchorDate: before.date,
    anchorPrice: before.price,
    eventTradingDate: event.date,
    eventPrice: event.price,
    t1: historyPct(event.price, points[eventIndex + 1]?.price),
    t5: historyPct(event.price, points[eventIndex + 5]?.price),
    t20: historyPct(event.price, points[eventIndex + 20]?.price),
  };
}

async function fetchFinnhubHistory(symbol) {
  const apiKey = String(process.env.FINNHUB_API_KEY || '').trim();
  if (!apiKey) throw new Error('FINNHUB_API_KEY is not configured');
  const url = new URL('https://finnhub.io/api/v1/stock/earnings');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('limit', '8');
  url.searchParams.set('token', apiKey);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AI Infra Watch/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Finnhub earnings history returned HTTP ' + response.status);
  const payload = await response.json();
  return Array.isArray(payload) ? payload : [];
}

async function getEarningsHistory(symbol, limit) {
  const cacheKey = symbol + ':' + limit;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.at < HISTORY_CACHE_MS) {
    return { ...cached.value, cached: true };
  }

  const [earningsRows, market] = await Promise.all([
    fetchFinnhubHistory(symbol),
    loadMarketHistory(symbol, '2y'),
  ]);

  const rows = earningsRows
    .filter(row => row?.period && row?.actual != null && row?.date)
    .slice(0, Math.max(1, Math.min(Number(limit) || HISTORY_DEFAULT_LIMIT, 8)));

  const historical = rows.map(row => ({
    symbol,
    period: String(row.period),
    reportDate: String(row.date),
    hour: row.hour || null,
    epsActual: Number.isFinite(Number(row.actual)) ? Number(row.actual) : null,
    epsEstimate: Number.isFinite(Number(row.estimate)) ? Number(row.estimate) : null,
    surprise: Number.isFinite(Number(row.surprise)) ? Number(row.surprise) : null,
    surprisePercent: Number.isFinite(Number(row.surprisePercent)) ? Number(row.surprisePercent) : null,
    reaction: enrichHistoryReaction(market?.points, String(row.date)),
  }));

  const value = {
    symbol,
    yahooSymbol: providerSymbol(symbol),
    source: 'finnhub',
    marketSource: market?.source || null,
    historical,
  };
  historyCache.set(cacheKey, { at: Date.now(), value });
  return { ...value, cached: false };
}

async function handleEarningsHistory(req, res) {
  const symbols = String(req.query?.symbols || req.query?.symbol || '')
    .split(',')
    .map(cleanSymbol)
    .filter(Boolean)
    .slice(0, HISTORY_MAX_SYMBOLS);
  const limit = Math.max(1, Math.min(Number(req.query?.limit) || HISTORY_DEFAULT_LIMIT, 8));

  if (!symbols.length || symbols.some(symbol => !validHistorySymbol(symbol))) {
    return res.status(400).json({ error: 'One or more valid stock symbols are required.' });
  }

  try {
    const settled = await Promise.allSettled(symbols.map(symbol => getEarningsHistory(symbol, limit)));
    const historical = {};
    const errors = [];

    settled.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') historical[symbol] = result.value.historical;
      else errors.push({ symbol, error: String(result.reason?.message || result.reason) });
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
    return res.status(Object.keys(historical).length ? 200 : 503).json({
      ok: Object.keys(historical).length > 0,
      as_of: new Date().toISOString(),
      symbols,
      limit,
      historical,
      errors,
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
      ok: false,
      historical: {},
      errors: [{ symbol: 'ALL', error: String(error?.message || error) }],
    });
  }
}

function authorizedForNotify(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret) {
    return req.headers.authorization === 'Bearer ' + secret;
  }
  const userAgent = String(req.headers['user-agent'] || '');
  return userAgent.includes('vercel-cron/1.0');
}

export default async function handler(req, res) {
  if (String(req.query?.history || '') === '1') {
    return handleEarningsHistory(req, res);
  }

  const { profiles } = loadTrackedUniverse();
  const leadDays = Math.max(1, Math.min(Number(process.env.EARNINGS_ALERT_LEAD_DAYS) || DEFAULT_LEAD_DAYS, 7));
  const lookaheadDays = Math.max(1, Math.min(Number(req.query?.days) || DEFAULT_LOOKAHEAD_DAYS, 30));
  const today = dateOnlyUtc(new Date());

  const from = today.toISOString().slice(0, 10);
  const toDate = new Date(today.getTime() + lookaheadDays * 86400000);
  const to = toDate.toISOString().slice(0, 10);

  const calendar = await fetchFinnhubCalendar(from, to);

  const upcoming = calendar.events
    .filter(event => profiles.has(canonicalSymbol(event?.symbol)))
    .map(event => {
      const symbol = canonicalSymbol(event.symbol);
      const profile = profiles.get(symbol) || { symbol };
      return buildAlert(event, profile, profiles, today);
    })
    .filter(event => event.days_until >= 0 && event.days_until <= lookaheadDays)
    .sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  const isVercelCron = String(req.headers['user-agent'] || '').includes('vercel-cron/1.0');
  const notify = String(req.query?.notify || '') === '1' || isVercelCron;
  let delivered = {
    configured: Boolean(String(process.env.NOTIFY_WEBHOOK_URL || '').trim()),
    attempted: false,
    sent: 0,
    error: null,
  };

  if (notify) {
    if (!authorizedForNotify(req)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized earnings notification trigger.' });
    }
    const due = upcoming.filter(event => event.days_until === leadDays);
    delivered = await sendWebhook(due);
    console.log(JSON.stringify({
      route: '/api/earnings-alerts',
      source: calendar.ok ? 'finnhub' : 'unavailable',
      monitored_events: upcoming.length,
      due_alerts: due.map(event => event.id),
      delivery: delivered,
    }));
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(calendar.ok ? 200 : 503).json({
    ok: calendar.ok,
    source: 'finnhub',
    as_of: new Date().toISOString(),
    lead_days: leadDays,
    lookahead_days: lookaheadDays,
    monitored_symbols: Array.from(profiles.keys()),
    upcoming,
    notification: delivered,
    configuration: {
      finnhub_configured: Boolean(String(process.env.FINNHUB_API_KEY || '').trim()),
      webhook_configured: Boolean(String(process.env.NOTIFY_WEBHOOK_URL || '').trim()),
      cron_secret_configured: Boolean(String(process.env.CRON_SECRET || '').trim()),
    },
    error: calendar.ok ? null : calendar.error,
  });
}
