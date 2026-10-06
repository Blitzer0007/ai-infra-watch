import { createPublicKey, createVerify } from 'node:crypto';
import { requireAccess } from '../../api/_access-auth.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;


const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_JWKS_URL = GITHUB_OIDC_ISSUER + '/.well-known/jwks';
const GITHUB_REPOSITORY = 'Blitzer0007/ai-infra-watch';
const GITHUB_WORKFLOWS = new Set([
  '.github/workflows/portfolio-digest-scheduler.yml',
  '.github/workflows/portfolio-digest-fallback-scheduler.yml',
]);
let githubJwksCache = { expiresAt: 0, keys: [] };

function base64UrlJson(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
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
  if (!GITHUB_WORKFLOWS.has(workflowPath)) return false;
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now) return false;

  try {
    if (githubJwksCache.expiresAt <= Date.now()) {
      const response = await fetch(GITHUB_OIDC_JWKS_URL, {
        headers: { 'User-Agent': 'ai-infra-watch-github-oidc/1.0' },
        signal: AbortSignal.timeout(5000),
      });
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
  } catch {
    return false;
  }
}

async function isCron(req) {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (secret && req.headers?.authorization === 'Bearer ' + secret) return true;
  return githubOidcVerified(req);
}

async function authorize(req, res) {
  if (await isCron(req)) return true;
  return requireAccess(req, res);
}

async function loadDecisionJournal() {
  try {
    return await import('./decision-journal.js');
  } catch (error) {
    console.error('decision journal module unavailable:', error);
    return null;
  }
}


function headers() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase service configuration is missing');
  return { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' };
}

async function supabase(path, options = {}) {
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error('Supabase portfolio request failed: HTTP ' + response.status);
  return response.json();
}

function digestSlotKey(req) {
  const explicit = String(req.query?.slot || '').trim();
  if (/^\d{4}-\d{2}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const tz = process.env.PORTFOLIO_DIGEST_TIMEZONE || 'Asia/Kolkata';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = type => parts.find(part => part.type === type)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day') + '-' + get('hour');
}

async function claimDigestSlot(slotKey) {
  const existing = await supabase(
    'portfolio_digest_runs?slot_key=eq.' + encodeURIComponent(slotKey) + '&select=status,started_at&limit=1',
    { method: 'GET' },
  );
  const row = existing?.[0];
  if (row?.status === 'completed') return false;
  if (row?.status === 'running' && Date.parse(row.started_at || '') > Date.now() - 15 * 60 * 1000) return false;

  const payload = {
    slot_key: slotKey,
    started_at: new Date().toISOString(),
    status: 'running',
    completed_at: null,
    delivery: {},
    error: null,
  };

  if (row) {
    await supabase(
      'portfolio_digest_runs?slot_key=eq.' + encodeURIComponent(slotKey),
      { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(payload) },
    );
    return true;
  }

  try {
    const created = await supabase(
      'portfolio_digest_runs',
      { method: 'POST', headers: { Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify(payload) },
    );
    return Array.isArray(created) ? created.length > 0 : true;
  } catch {
    const retry = await supabase(
      'portfolio_digest_runs?slot_key=eq.' + encodeURIComponent(slotKey) + '&select=status&limit=1',
      { method: 'GET' },
    );
    return retry?.[0]?.status !== 'completed';
  }
}

async function finishDigestSlot(slotKey, status, delivery, error) {
  if (!slotKey) return;
  try {
    await supabase(
      'portfolio_digest_runs?slot_key=eq.' + encodeURIComponent(slotKey),
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status,
          completed_at: new Date().toISOString(),
          delivery: delivery || {},
          error: error || null,
        }),
      },
    );
  } catch (updateError) {
    console.error('portfolio digest run update failed:', updateError);
  }
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

const MACRO_RISKS = [
  { title: 'Taiwan advanced-node exposure', level: 'HIGH' },
  { title: 'AI-chip export controls', level: 'HIGH' },
  { title: 'Data-center power availability', level: 'MEDIUM' },
];

function calculateEffectiveHoldings(rows) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return null;
  const hhi = rows.reduce((sum, row) => {
    const weight = row.value / total;
    return sum + weight * weight;
  }, 0);
  return hhi > 0 ? 1 / hhi : null;
}

function signedMoney(value) {
  return (value >= 0 ? '+' : '') + '$' + value.toFixed(2);
}

function signedPct(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

function benchmarkOutcomeLabel(excess, benchmark) {
  if (!Number.isFinite(excess)) return 'comparison unavailable';
  const abs = signedMoney(Math.abs(excess)).replace('+', '');
  return excess > 0
    ? 'Outperformed ' + benchmark + ' by ' + abs
    : excess < 0
      ? 'Underperformed ' + benchmark + ' by ' + abs
      : 'Matched ' + benchmark;
}

async function fetchDecisionCenter() {
  const secrets = [
    process.env.CRON_SECRET,
    process.env.AIW_ACCESS_TOKEN,
    process.env.AGENT_API_TOKEN,
  ].map(value => String(value || '').trim()).filter(Boolean);

  if (!secrets.length) return { decision: null, error: 'No server-side access token is configured' };

  let lastError = 'Decision center request failed';
  for (const secret of secrets) {
    try {
      const response = await fetch('https://ai-infra-watch-theta.vercel.app/api/market?route=decision-center', {
        headers: {
          Authorization: 'Bearer ' + secret,
          'User-Agent': 'ai-infra-watch-daily-digest/4.0',
        },
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) {
        const body = await response.json().catch(() => null);
        if (body?.ok) return { decision: body, error: null };
        lastError = 'Decision center returned an invalid response';
        continue;
      }

      lastError = 'Decision center HTTP ' + response.status;
      // Try the next configured server-side credential. This prevents a stale
      // credential in one slot from breaking the decision layer when another
      // configured credential is valid.
      if (response.status === 401 || response.status === 403) continue;
      return { decision: null, error: lastError };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Decision center request failed';
    }
  }

  return { decision: null, error: lastError };
}

export function buildDecisionFirstText(decision, fallbackDate, weekly, decisionError = null) {
  const lines = [
    'AI Infra Watch · Daily Decision Brief',
    fallbackDate,
    '',
  ];

  if (!decision) {
    lines.push(
      'DECISION LAYER UNAVAILABLE',
      'Showing basic portfolio summary instead. Reason: ' + (decisionError || 'unknown error'),
      'This is a data availability warning, not a clean bill of health.',
      '',
    );
  } else if (decision?.earningsStatus && decision.earningsStatus !== 'ok') {
    lines.push(
      'DATA WARNING · EARNINGS CALENDAR ' + String(decision.earningsStatus).toUpperCase(),
      decision.earningsError ? String(decision.earningsError) : 'The monitored earnings feed could not be verified.',
      '',
    );
  }

  const actions = Array.isArray(decision?.actionItems) ? decision.actionItems.slice(0, 3) : [];
  const actCount = actions.filter(item => item.severity === 'ACT').length;
  const watchCount = actions.filter(item => item.severity === 'WATCH').length;
  const evaluatedRules = Number(decision?.rules?.total || 0);
  const holdingsCount = Number(decision?.portfolio?.holdings || 0);
  const noRuleCount = Number(decision?.rules?.noRule || 0);
  lines.push('ACTION NEEDED · ' + actCount + ' ACT · ' + watchCount + ' WATCH');
  lines.push('SELF-CHECK · checked ' + evaluatedRules + ' rules across ' + holdingsCount + ' holdings' + (noRuleCount ? ' · ' + noRuleCount + ' without active rules' : ' · all holdings have active rules'));
  if (actions.length) {
    actions.forEach((item, index) => {
      const tag = item.severity === 'ACT' ? 'ACT' : 'WATCH';
      lines.push((index + 1) + '. [' + tag + '] ' + item.symbol + ' — ' + item.title + ': ' + item.detail);
    });
  } else if (decision) {
    lines.push('No breach, target, or near-rule action item detected in the available decision data.');
  } else {
    lines.push('Decision-layer actions unavailable because the decision endpoint failed.');
  }

  const earnings = Array.isArray(decision?.earnings) ? decision.earnings.slice(0, 3) : [];
  lines.push('', 'NEXT 7 DAYS');
  if (decision?.earningsStatus && decision.earningsStatus !== 'ok') {
    lines.push('Earnings calendar unavailable · status ' + decision.earningsStatus + (decision.earningsError ? ' · ' + decision.earningsError : ''));
  } else if (earnings.length) {
    earnings.forEach(item => lines.push(item.symbol + ' earnings ' + (item.daysUntil === 0 ? 'today' : 'in ' + item.daysUntil + 'd') + ' · ' + item.date));
  } else {
    lines.push('No monitored earnings event in the next 7 days.');
  }

  const portfolio = decision?.portfolio || {};
  const spy = decision?.benchmark?.SPY;
  const soxx = decision?.benchmark?.SOXX;
  const excessSpy = spy && Number.isFinite(portfolio.cashFlowPnl) && spy.pnl != null && spy.coverage?.status !== 'partial'
    ? portfolio.cashFlowPnl - spy.pnl
    : null;
  const excessSoxx = soxx && Number.isFinite(portfolio.cashFlowPnl) && soxx.pnl != null && soxx.coverage?.status !== 'partial'
    ? portfolio.cashFlowPnl - soxx.pnl
    : null;

  lines.push(
    '',
    'RESULT',
    'Cash-flow P&L: ' + signedMoney(Number(portfolio.cashFlowPnl || 0)),
    'Same cash in SPY: ' + (spy?.pnl == null ? 'unavailable' : signedMoney(Number(spy.pnl))) +
      (spy?.coverage?.status === 'partial' ? ' · partial coverage' : '') +
      (excessSpy == null ? '' : ' · ' + benchmarkOutcomeLabel(excessSpy, 'SPY')),
    'Same cash in SOXX: ' + (soxx?.pnl == null ? 'unavailable' : signedMoney(Number(soxx.pnl))) +
      (soxx?.coverage?.status === 'partial' ? ' · partial coverage' : '') +
      (excessSoxx == null ? '' : ' · ' + benchmarkOutcomeLabel(excessSoxx, 'SOXX')),
  );

  const riskScenarios = Array.isArray(portfolio.riskScenarios)
    ? portfolio.riskScenarios.filter(item => Number.isFinite(Number(item?.shock)))
    : [];
  const scenarioTotal = Number(portfolio.scenarioShockTotal ?? portfolio.semiconductorShock15Pct ?? 0);
  const scenarioComponentTotal = riskScenarios.reduce((sum, item) => sum + Number(item.shock), 0);
  const scenarioReconciliationGap = Number.isFinite(scenarioTotal) && Number.isFinite(scenarioComponentTotal)
    ? scenarioTotal - scenarioComponentTotal
    : null;
  const visibleRiskScenarios = riskScenarios.slice(0, 6);
  const omittedRiskScenarios = riskScenarios.slice(6);
  const omittedStress = omittedRiskScenarios.reduce((sum, item) => sum + Number(item.shock), 0);

  lines.push(
    '',
    'RISK',
    'Scenario model: exposure × beta × leverage × configured shock · illustrative, not a prediction.',
    'Top 3 holdings: ' + (portfolio.concentrationTop3Pct == null ? '—' : portfolio.concentrationTop3Pct.toFixed(1) + '% of value'),
    'Scenario stress total: ' + signedMoney(scenarioTotal) + ' across ' + riskScenarios.length + ' risk groups',
    ...visibleRiskScenarios.map(item =>
      '  ' + String(item.group).toUpperCase() + ': ' + signedMoney(Number(item.shock)) + ' · shock ' +
        (item.effectiveShockPct == null ? '—' : Number(item.effectiveShockPct).toFixed(1) + '%')
    ),
    ...(omittedRiskScenarios.length
      ? ['  OTHER GROUPS: ' + signedMoney(omittedStress) + ' · ' + omittedRiskScenarios.length + ' more']
      : []),
    ...(scenarioReconciliationGap != null && Math.abs(scenarioReconciliationGap) >= 0.01
      ? ['DATA QUALITY · scenario total differs from displayed risk-group sum by ' + signedMoney(scenarioReconciliationGap) + '.']
      : []),
  );

  const forecast = decision?.forecast || {};
  lines.push(
    '',
    'FORECAST VALIDATION',
    (forecast.verified ?? 0) + '/50 verified · ' + (forecast.independentVerified ?? 0) + ' independent · ' + (forecast.pending ?? 0) + ' pending',
    'Independence window: ' + (forecast.independenceWindowBusinessDays ?? 20) + ' business days per ticker.',
  );

  if (weekly) {
    lines.push(
      '',
      'WEEKLY REVIEW',
      weekly.decisions + ' decisions · ' + weekly.outcomes + ' outcome reviews',
      weekly.sampleLabel || ('Decision score: ' + (weekly.averageDecisionScorePct == null ? '—' : signedPct(Number(weekly.averageDecisionScorePct)))),
      'Rule adherence: ' + (weekly.ruleAdherencePct == null ? '—' : Number(weekly.ruleAdherencePct).toFixed(0) + '%'),
      'Forecast error: ' + (weekly.averageForecastErrorPct == null ? '—' : signedPct(Number(weekly.averageForecastErrorPct))),
      'Reflection: ' + weekly.reflection,
    );
  }

  const rules = decision?.rules || {};
  const quiet = [
    (rules.noRule ?? 0) + ' holdings without active rules',
    (rules.breached ?? 0) + ' rule breaches',
    (rules.targetReached ?? 0) + ' targets reached',
    (rules.near ?? 0) + ' close-to-rule holdings',
  ];
  lines.push('', 'STATUS · ' + quiet.join(' · '));
  if (decision?.quoteCoverage?.status === 'partial' || portfolio.quoteCoverage?.status === 'partial') {
    lines.push('DATA QUALITY · quote coverage is partial; totals may include stale fallbacks.');
  }
  lines.push('', 'Review layer only — no automatic trade instruction.');
  return lines.join('\n');
}

async function buildDigest() {
  const holdings = await supabase('portfolio_holdings?select=symbol,quantity,average_cost&order=symbol.asc');
  const rows = await Promise.all(holdings.map(async holding => {
    const symbol = String(holding.symbol).trim().toUpperCase();
    const quantity = Number(holding.quantity);
    const cost = Number(holding.average_cost);
    try {
      const q = await quote(symbol);
      const value = q.price * quantity;
      const pnl = (q.price - cost) * quantity;
      return {
        symbol,
        price: q.price,
        quantity,
        averageCost: cost,
        value,
        pnl,
        pnlPct: cost ? (q.price / cost - 1) * 100 : 0,
        changePct: q.changePct,
        quoteStatus: 'fresh',
      };
    } catch (error) {
      return {
        symbol,
        price: null,
        quantity,
        averageCost: cost,
        value: 0,
        pnl: null,
        pnlPct: null,
        changePct: null,
        quoteStatus: 'unavailable',
        error: error instanceof Error ? error.message : 'quote unavailable',
      };
    }
  }));

  const valid = rows.filter(row => row.quoteStatus === 'fresh' && row.value > 0);
  const unavailable = rows.filter(row => row.quoteStatus !== 'fresh');
  const totalValue = valid.reduce((sum, row) => sum + row.value, 0);
  const totalCost = valid.reduce((sum, row) => sum + row.averageCost * row.quantity, 0);
  const totalPnl = valid.reduce((sum, row) => sum + row.pnl, 0);
  const totalPnlPct = totalCost ? (totalValue / totalCost - 1) * 100 : null;
  const dailyMoves = valid.filter(row => row.changePct != null).map(row => row.changePct);
  const breadthPositive = dailyMoves.filter(value => value > 0).length;
  const breadthTotal = dailyMoves.length;
  const breadthPct = breadthTotal ? (breadthPositive / breadthTotal) * 100 : null;
  const avgDailyMove = dailyMoves.length ? dailyMoves.reduce((sum, value) => sum + value, 0) / dailyMoves.length : null;
  const sortedByValue = [...valid].sort((a, b) => b.value - a.value);
  const largest = sortedByValue[0] || null;
  const top3Value = sortedByValue.slice(0, 3).reduce((sum, row) => sum + row.value, 0);
  const top3Pct = totalValue ? (top3Value / totalValue) * 100 : null;
  const effectiveHoldings = calculateEffectiveHoldings(valid);
  const gainers = [...valid].filter(row => row.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, 3);
  const decliners = [...valid].filter(row => row.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, 3);
  const pnlContributors = [...valid].sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl)).slice(0, 5);
  const attention = [...valid]
    .filter(row => (row.changePct != null && row.changePct <= -3) || (row.pnl < 0 && row.changePct != null && row.changePct < 0))
    .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
    .slice(0, 5);

  const macroHigh = MACRO_RISKS.filter(item => item.level === 'HIGH').length;
  const macroMedium = MACRO_RISKS.filter(item => item.level === 'MEDIUM').length;
  const macroLoad = Math.min(30, macroHigh * 12 + macroMedium * 6);
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: process.env.PORTFOLIO_DIGEST_TIMEZONE || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = localDate;

  const decisionResult = await fetchDecisionCenter();
  const decisionJournal = await loadDecisionJournal();
  const decision = decisionResult.decision;
  const isSunday = new Intl.DateTimeFormat('en-US', { timeZone: process.env.PORTFOLIO_DIGEST_TIMEZONE || 'Asia/Kolkata', weekday: 'short' }).format(new Date()) === 'Sun';
  const weekly = isSunday && decisionJournal?.getWeeklyDecisionReview
    ? await decisionJournal.getWeeklyDecisionReview().catch(() => null)
    : null;

  if (decision) {
    return {
      date: localDate,
      text: buildDecisionFirstText(decision, localDate, weekly, decisionResult.error),
      rows,
      totalValue,
      totalPnl,
      totalPnlPct,
      breadthPct,
      avgDailyMove,
      largestHolding: largest?.symbol || null,
      top3ConcentrationPct: top3Pct,
      effectiveHoldings,
      macroLoad,
      macroHigh,
      macroMedium,
      attention: (decision.actionItems || []).slice(0, 3).map(item => item.symbol),
      quoteCoverage: { fresh: valid.length, total: rows.length, unavailable: unavailable.length },
      decisionFirst: true,
      decisionLayerStatus: decisionResult.error ? 'degraded' : 'available',
      decisionLayerError: decisionResult.error || null,
      earningsStatus: decision?.earningsStatus || null,
      earningsError: decision?.earningsError || null,
    };
  }

  const lines = [
    'AI Infra Watch — Daily Intelligence Brief',
    date,
    '',
    'PORTFOLIO',
    'Value: $' + totalValue.toFixed(2),
    'Unrealized P&L: ' + signedMoney(totalPnl) + (totalPnlPct == null ? '' : ' · ' + signedPct(totalPnlPct)),
    'Breadth: ' + (breadthPct == null ? '—' : breadthPct.toFixed(0) + '% positive') + (avgDailyMove == null ? '' : ' · Avg daily move ' + signedPct(avgDailyMove)),
    'Quote coverage: ' + valid.length + '/' + rows.length + ' fresh' + (unavailable.length ? ' · ' + unavailable.length + ' unavailable' : ''),
    '',
    'EXPOSURE',
    'Largest holding: ' + (largest ? largest.symbol + ' · ' + (largest.value / totalValue * 100).toFixed(1) + '%' : '—'),
    'Top 3 concentration: ' + (top3Pct == null ? '—' : top3Pct.toFixed(1) + '%'),
    'Diversification equivalent: ' + (effectiveHoldings == null ? '—' : effectiveHoldings.toFixed(1) + ' effective positions'),
    '',
    'DAILY LEADERS',
    'Gainers:' + (gainers.length ? ' ' + gainers.map(row => row.symbol + ' ' + signedPct(row.changePct)).join(' · ') : ' none'),
    'Decliners:' + (decliners.length ? ' ' + decliners.map(row => row.symbol + ' ' + signedPct(row.changePct)).join(' · ') : ' none'),
    '',
    'P&L CONTRIBUTORS',
    ...pnlContributors.map(row => row.symbol + ': ' + signedMoney(row.pnl) + ' · ' + signedPct(row.pnlPct)),
    '',
    'MACRO RISK MAP',
    'Load: ' + macroLoad + '/30 · ' + macroHigh + ' high · ' + macroMedium + ' medium · capped at 30',
    'Themes: ' + MACRO_RISKS.map(item => item.title).join(' · '),
    '',
    'ATTENTION',
    ...(attention.length
      ? attention.map(row => row.symbol + ': daily ' + signedPct(row.changePct) + ' · P&L ' + signedMoney(row.pnl))
      : ['No holding met the current daily attention threshold.']),
    ...(unavailable.length ? ['', 'QUOTE UNAVAILABLE', ...unavailable.map(row => row.symbol + ': quote unavailable; excluded from totals and P&L.') ] : []),
    '',
    'Per-holding snapshot',
    ...rows.map(row => row.quoteStatus === 'fresh'
      ? row.symbol + ': $' + row.price.toFixed(2) + ' · ' + signedPct(row.changePct) + ' · P&L ' + signedMoney(row.pnl)
      : row.symbol + ': quote unavailable'),
    '',
    'Measurement only — no trading instructions. Macro risk map is deterministic; it is not a live event score.'
  ];

  return {
    date,
    text: lines.join('\n'),
    rows,
    totalValue,
    totalPnl,
    totalPnlPct,
    breadthPct,
    avgDailyMove,
    largestHolding: largest?.symbol || null,
    top3ConcentrationPct: top3Pct,
    effectiveHoldings,
    macroLoad,
    macroHigh,
    macroMedium,
    attention: attention.map(row => row.symbol),
    quoteCoverage: { fresh: valid.length, total: rows.length, unavailable: unavailable.length },
    decisionLayerStatus: 'unavailable',
    decisionLayerError: decisionResult.error || 'Decision center unavailable',
  };
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
  if (!await authorize(req, res)) return;

  try {
    if (req.method !== 'POST' && req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const cron = await isCron(req);
    const slotKey = cron ? digestSlotKey(req) : null;

    if (cron && !await claimDigestSlot(slotKey)) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'digest slot already completed or another scheduler is running it',
        slotKey,
      });
    }

    try {
      if (cron && decisionJournal?.reviewDueDecisionJournal) {
        await decisionJournal.reviewDueDecisionJournal().catch(error => console.error('decision journal review failed:', error));
      }

      const digest = await buildDigest();

      if (req.method === 'GET' && !cron) {
        return res.status(200).json({ ...digest, delivery: { configured: false, previewOnly: true } });
      }

      const requested = req.method === 'POST'
        ? String(req.body?.channels || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
        : [];
      const delivery = await deliver(digest, requested);
      const failed = delivery.errors.length > 0 && delivery.delivered.length === 0;

      await finishDigestSlot(
        slotKey,
        failed ? 'failed' : 'completed',
        delivery,
        delivery.errors.length ? delivery.errors.join(' · ') : null,
      );

      return res.status(failed ? 502 : 200).json({
        ok: true,
        ...digest,
        delivery,
        slotKey,
      });
    } catch (error) {
      await finishDigestSlot(
        slotKey,
        'failed',
        {},
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Portfolio digest failed',
    });
  }
}
