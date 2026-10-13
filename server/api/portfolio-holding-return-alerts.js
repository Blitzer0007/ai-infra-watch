const THRESHOLDS = [25, 30];
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

function signedMoney(value) {
  const amount = Number(value) || 0;
  return (amount >= 0 ? '+$' : '-$') + Math.abs(amount).toFixed(2);
}
function money(value) {
  return '$' + (Number(value) || 0).toFixed(2);
}
function signedPct(value) {
  return (Number(value) >= 0 ? '+' : '') + Number(value).toFixed(2) + '%';
}
function holdingStateKey(symbol, threshold) {
  return 'holding-return:' + String(symbol || '').trim().toUpperCase() + ':' + threshold;
}

export function getHoldingReturnThresholdTransitions(symbol, returnPct, states = new Map()) {
  if (returnPct == null || returnPct === '') return { trigger: [], reset: [] };
  const value = Number(returnPct);
  if (!Number.isFinite(value)) return { trigger: [], reset: [] };
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  if (!normalizedSymbol) return { trigger: [], reset: [] };
  const trigger = [];
  const reset = [];
  for (const threshold of THRESHOLDS) {
    const old = states.get(holdingStateKey(normalizedSymbol, threshold));
    if (value >= threshold && !old?.active) trigger.push(threshold);
    if (value < threshold && old?.active) reset.push(threshold);
  }
  return { trigger, reset };
}

function formatHoldingAlert(row, threshold, digest) {
  const symbol = String(row.symbol).toUpperCase();
  const price = Number(row.price);
  const quantity = Number(row.quantity);
  const averageCost = Number(row.averageCost);
  const value = Number(row.value);
  const pnl = Number.isFinite(Number(row.pnl)) ? Number(row.pnl) : (price - averageCost) * quantity;
  const review = digest?.returnReview || {};
  const actions = Array.isArray(review.actionItems) ? review.actionItems : [];
  const ownActions = actions.filter(item =>
    String(item?.symbol || '').toUpperCase() === symbol &&
    ['ACT', 'WATCH'].includes(String(item?.severity || '').toUpperCase())
  );
  const earnings = (Array.isArray(review.earnings) ? review.earnings : [])
    .filter(item => String(item?.symbol || '').toUpperCase() === symbol);
  const fullQuoteCoverage = Number(digest?.quoteCoverage?.unavailable || 0) === 0 &&
    Number(digest?.quoteCoverage?.fresh || 0) === Number(digest?.quoteCoverage?.total || -1);
  const weightPct = fullQuoteCoverage && Number(digest?.totalValue) > 0
    ? value / Number(digest.totalValue) * 100
    : null;

  const lines = [
    threshold === 30
      ? '🚨 AI Infra Watch · ' + symbol + ' +30% Profit Milestone'
      : '📈 AI Infra Watch · ' + symbol + ' +25% Profit Milestone',
    '',
    'Return from average buy price: ' + signedPct(row.pnlPct),
    'Average buy price: ' + money(averageCost),
    'Latest quote: ' + money(price),
    'Shares still held: ' + quantity.toFixed(8).replace(/0+$/, '').replace(/\.$/, ''),
    'Open cost basis: ' + money(averageCost * quantity),
    'Unrealized P&L: ' + signedMoney(pnl) + ' · before untracked fees/taxes',
    'Current position value: ' + money(value),
    'Portfolio weight: ' + (weightPct == null ? 'unavailable · quote coverage incomplete' : weightPct.toFixed(2) + '%'),
    '',
    'REVIEW BEFORE ACTING',
  ];

  if (ownActions.length) {
    ownActions.slice(0, 2).forEach(item => lines.push(
      '• [' + String(item.severity).toUpperCase() + '] ' + String(item.title || 'Saved rule') + ': ' + String(item.detail || 'Review your recorded rule.')
    ));
  } else {
    lines.push('No symbol-specific ACT/WATCH item was surfaced in the current scan; check the saved thesis and exit rules.');
  }

  if (earnings.length) {
    lines.push('Earnings: ' + earnings.slice(0, 2).map(item =>
      String(item.daysUntil) === '0' ? 'today (' + item.date + ')' : 'in ' + String(item.daysUntil) + 'd (' + item.date + ')'
    ).join(' · '));
  } else if (review.earningsStatus && review.earningsStatus !== 'ok') {
    lines.push('Earnings context unavailable: ' + String(review.earningsStatus));
  } else {
    lines.push('No monitored earnings event was returned for this stock in the next 7 days.');
  }

  lines.push(
    '',
    threshold === 30
      ? 'Suggested review: protect gains, reassess downside and concentration, and confirm the thesis still holds.'
      : 'Suggested review: reassess the thesis, valuation, downside rule and position size.',
    'Milestone trigger only — it is not an automatic sell instruction. A gain is not locked in until sold; fees and taxes can affect realized profit.',
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
  if (!response.ok) throw new Error('Holding return alert state request failed: HTTP ' + response.status);
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

export async function evaluatePortfolioHoldingReturnAlerts(digest) {
  const rows = Array.isArray(digest?.rows) ? digest.rows : [];
  const eligible = rows.filter(row =>
    String(row?.quoteStatus || '') === 'fresh' &&
    String(row?.symbol || '').trim() &&
    Number(row?.quantity) > 0 &&
    Number(row?.averageCost) > 0 &&
    Number.isFinite(Number(row?.pnlPct)) &&
    Number.isFinite(Number(row?.price))
  );
  if (!eligible.length) {
    return { evaluated: false, reason: 'no eligible fresh holding quotes or average costs', evaluatedHoldings: 0, triggered: [], sent: 0, errors: [] };
  }

  const keys = eligible.flatMap(row => THRESHOLDS.map(threshold => holdingStateKey(row.symbol, threshold)));
  const inFilter = 'event_key=in.' + encodeURIComponent('(' + keys.map(key => '"' + key + '"').join(',') + ')');
  const previousRows = await supabase('server_alert_state?select=event_key,active,last_triggered_at,metadata&' + inFilter + '&limit=200');
  const previous = new Map((previousRows || []).map(row => [String(row.event_key), row]));
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) {
    return { evaluated: true, evaluatedHoldings: eligible.length, triggered: [], sent: 0, errors: ['Telegram credentials are not configured; threshold state was not changed.'] };
  }

  const timestamp = new Date().toISOString();
  const updates = [];
  const triggered = [];
  const errors = [];
  let sent = 0;

  for (const row of eligible) {
    const symbol = String(row.symbol).trim().toUpperCase();
    const transitions = getHoldingReturnThresholdTransitions(symbol, row.pnlPct, previous);
    for (const threshold of transitions.reset) {
      const key = holdingStateKey(symbol, threshold);
      const old = previous.get(key);
      updates.push({
        event_key: key,
        active: false,
        last_seen_at: timestamp,
        last_triggered_at: old?.last_triggered_at || null,
        metadata: { symbol, thresholdPct: threshold, lastObservedReturnPct: Number(row.pnlPct), resetAt: timestamp },
      });
    }

    for (const threshold of transitions.trigger) {
      const key = holdingStateKey(symbol, threshold);
      const text = formatHoldingAlert(row, threshold, digest);
      try {
        const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
            reply_markup: { inline_keyboard: [[
              { text: 'Review ' + symbol, url: 'https://ai-infra-watch-theta.vercel.app/portfolio?portfolio_tab=holdings&portfolio_symbol=' + encodeURIComponent(symbol) },
              { text: 'Open Decision Center', url: 'https://ai-infra-watch-theta.vercel.app/overview' },
            ]] },
          }),
          signal: AbortSignal.timeout(10000),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.ok === false) throw new Error(String(body?.description || 'Telegram HTTP ' + response.status));

        sent++;
        triggered.push({ symbol, threshold });
        updates.push({
          event_key: key,
          active: true,
          last_seen_at: timestamp,
          last_triggered_at: timestamp,
          metadata: {
            symbol,
            thresholdPct: threshold,
            returnPct: Number(row.pnlPct),
            price: Number(row.price),
            averageCost: Number(row.averageCost),
            quantity: Number(row.quantity),
            unrealizedPnl: Number(row.pnl),
            quoteCoverage: row.quoteStatus,
          },
        });
      } catch (error) {
        errors.push(symbol + ' +' + threshold + '%: ' + (error instanceof Error ? error.message : 'Telegram delivery failed'));
      }
    }
  }

  if (updates.length) {
    await supabase('server_alert_state', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(updates),
    });
  }

  return { evaluated: true, evaluatedHoldings: eligible.length, triggered, sent, errors };
}
