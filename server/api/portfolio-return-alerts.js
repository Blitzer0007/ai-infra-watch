const THRESHOLDS = [25, 30];
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function money(value) {
  return (Number(value) < 0 ? '-$' : '$') + Math.abs(Number(value) || 0).toFixed(2);
}

function signedMoney(value) {
  const amount = Number(value) || 0;
  return (amount >= 0 ? '+' : '-') + '$' + Math.abs(amount).toFixed(2);
}

function formatAlert(threshold, review) {
  const portfolio = review.portfolio || {};
  const lines = [
    threshold === 30 ? '🚨 AI Infra Watch · +30% Portfolio Milestone' : '📈 AI Infra Watch · +25% Portfolio Milestone',
    '',
    'Return on net contributions: ' + Number(review.returnPct).toFixed(2) + '%',
    'Current portfolio value: ' + money(portfolio.currentValue),
    'Portfolio P&L: ' + signedMoney(portfolio.cashFlowPnl),
    'Net contributions: ' + money(portfolio.netContributed),
    'Quote coverage: ' + String(portfolio.quoteCoverage?.status || 'unknown'),
    '',
    'REVIEW BEFORE ACTING',
  ];

  const actions = Array.isArray(review.actionItems) ? review.actionItems.slice(0, 3) : [];
  const act = actions.filter(item => String(item.severity || '').toUpperCase() === 'ACT');
  const watch = actions.filter(item => String(item.severity || '').toUpperCase() === 'WATCH');
  if (act.length) {
    lines.push('Priority: review saved-rule action items first.');
    act.forEach(item => lines.push('• [ACT] ' + item.symbol + ' — ' + item.title + ': ' + item.detail));
  } else if (watch.length) {
    lines.push('Priority: monitor these saved rules.');
    watch.forEach(item => lines.push('• [WATCH] ' + item.symbol + ' — ' + item.title + ': ' + item.detail));
  } else {
    lines.push(review.actionItemsAvailable
      ? 'No ACT/WATCH item was returned by the current decision scan.'
      : 'Saved-rule status unavailable; check Decision Center before changing positions.');
  }

  const rules = review.rules || {};
  lines.push(
    'Rules: ' + (rules.total ?? '—') + ' checked · ' + (rules.breached ?? '—') + ' breached · ' +
      (rules.near ?? '—') + ' near · ' + (rules.noRule ?? '—') + ' without rules',
    'Top-3 concentration: ' + (portfolio.concentrationTop3Pct == null ? '—' : Number(portfolio.concentrationTop3Pct).toFixed(1) + '%'),
    'Illustrative stress scenario: ' + (portfolio.scenarioShockTotal == null ? '—' : signedMoney(portfolio.scenarioShockTotal)),
  );

  const benchmarks = review.benchmark || {};
  for (const symbol of ['SPY', 'SOXX']) {
    const benchmark = benchmarks[symbol];
    if (benchmark?.pnl != null && benchmark?.coverage?.status !== 'partial') {
      lines.push('Same-cash comparison vs ' + symbol + ': ' + signedMoney(Number(portfolio.cashFlowPnl) - Number(benchmark.pnl)));
    } else {
      lines.push('Same-cash comparison vs ' + symbol + ': unavailable/partial');
    }
  }

  const earnings = Array.isArray(review.earnings) ? review.earnings.slice(0, 3) : [];
  lines.push('', 'CATALYST CHECK');
  if (review.earningsStatus && review.earningsStatus !== 'ok') {
    lines.push('Earnings feed: ' + review.earningsStatus + (review.earningsError ? ' · ' + review.earningsError : ''));
  } else if (earnings.length) {
    earnings.forEach(item => lines.push('• ' + item.symbol + ' earnings ' + (item.daysUntil === 0 ? 'today' : 'in ' + item.daysUntil + 'd') + ' · ' + item.date));
  } else {
    lines.push('No monitored earnings event in the next 7 days.');
  }

  const eligible = Number(review.signalGate?.eligible || 0);
  const forecastGate = String(review.forecast?.gate || 'unknown');
  lines.push(
    'Evidence readiness: ' + eligible + ' validated signal families · forecast gate ' + forecastGate,
    eligible > 0 && forecastGate === 'ready'
      ? 'Opportunity review: check ticker-specific evidence and valuation before considering an add.'
      : 'No broad buy signal is established by this milestone alone; verify ticker-specific evidence first.',
    '',
    threshold === 30
      ? 'Suggested next step: review profit protection, concentration and saved exit rules.'
      : 'Suggested next step: review thesis strength, concentration and saved exit rules.',
    'Metric = portfolio P&L ÷ net contributions; it is not a time-weighted return.',
    'Review trigger only — no automatic buy/sell instruction.',
  );
  return lines.join('\n');
}

async function supabase(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase service configuration is missing');
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Portfolio return alert state request failed: HTTP ' + response.status);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export function getReturnThresholdTransitions(returnPct, states = new Map()) {
  const value = Number(returnPct);
  if (!Number.isFinite(value)) return { trigger: [], reset: [] };
  const trigger = [];
  const reset = [];
  for (const threshold of THRESHOLDS) {
    const old = states.get('portfolio-return:' + threshold);
    if (value >= threshold && !old?.active) trigger.push(threshold);
    if (value < threshold && old?.active) reset.push(threshold);
  }
  return { trigger, reset };
}

export async function evaluatePortfolioReturnAlerts(digest) {
  const review = digest?.returnReview;
  if (!review || !Number.isFinite(Number(review.returnPct)) || review.portfolio?.quoteCoverage?.status !== 'complete') {
    return {
      evaluated: false,
      reason: !review ? 'cash-flow portfolio data unavailable' : 'portfolio quote coverage is not complete',
      triggered: [],
      sent: 0,
      errors: [],
    };
  }

  const previousRows = await supabase(
    'server_alert_state?select=event_key,active,last_triggered_at,metadata&event_key=in.%28%22portfolio-return%3A25%22%2C%22portfolio-return%3A30%22%29&limit=10',
  );
  const previous = new Map((previousRows || []).map(row => [String(row.event_key), row]));
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) {
    return { evaluated: true, returnPct: review.returnPct, triggered: [], sent: 0, errors: ['Telegram credentials are not configured; threshold state was not changed.'] };
  }

  const timestamp = new Date().toISOString();
  const transitions = getReturnThresholdTransitions(review.returnPct, previous);
  const updates = [];
  const triggered = [];
  const errors = [];
  let sent = 0;

  for (const threshold of THRESHOLDS) {
    const key = 'portfolio-return:' + threshold;
    const old = previous.get(key);
    if (Number(review.returnPct) < threshold) {
      if (transitions.reset.includes(threshold)) updates.push({
        event_key: key,
        active: false,
        last_seen_at: timestamp,
        last_triggered_at: old.last_triggered_at || null,
        metadata: { thresholdPct: threshold, lastObservedReturnPct: Number(review.returnPct), resetAt: timestamp },
      });
      continue;
    }
    if (!transitions.trigger.includes(threshold)) continue;

    try {
      const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatAlert(threshold, review),
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[
            { text: 'Review Portfolio', url: 'https://ai-infra-watch-theta.vercel.app/portfolio?portfolio_tab=holdings' },
            { text: 'Open Decision Center', url: 'https://ai-infra-watch-theta.vercel.app/overview' },
          ]] },
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(String(body?.description || 'Telegram HTTP ' + response.status));

      sent += 1;
      triggered.push(threshold);
      updates.push({
        event_key: key,
        active: true,
        last_seen_at: timestamp,
        last_triggered_at: timestamp,
        metadata: {
          thresholdPct: threshold,
          returnPct: Number(review.returnPct),
          currentValue: Number(review.portfolio.currentValue),
          cashFlowPnl: Number(review.portfolio.cashFlowPnl),
          netContributed: Number(review.portfolio.netContributed),
          quoteCoverage: review.portfolio.quoteCoverage.status,
        },
      });
    } catch (error) {
      errors.push('+' + threshold + '%: ' + (error instanceof Error ? error.message : 'Telegram delivery failed'));
    }
  }

  if (updates.length) {
    await supabase('server_alert_state', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(updates),
    });
  }

  return { evaluated: true, returnPct: Number(review.returnPct), triggered, sent, errors };
}
