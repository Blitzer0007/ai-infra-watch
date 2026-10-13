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
    'Unrealized P&L: ' + signedMoney(pnl) + ' · includes recorded trade costs',
    'Current position value: ' + money(value),
    'Portfolio weight: ' + (weightPct == null ? 'unavailable · quote coverage incomplete' : weightPct.toFixed(2) + '%'),
    'Realized P&L from earlier partial sales: ' + signedMoney(Number(row.realizedPnl || 0)),
    ...(Number(row.positionReview || 0) > 0
      ? ['COST-BASIS QUALITY · ' + Number(row.positionReview) + ' transaction(s) use derived values; verify the broker history.']
      : []),
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

export function deriveHoldingLedgerCostBasis(transactionRows = [], holdings = []) {
  const ordered = [...transactionRows].sort((a, b) =>
    String(a.trade_date || '').localeCompare(String(b.trade_date || '')) ||
    Number(a.source_row || 0) - Number(b.source_row || 0)
  );
  const inventory = new Map();
  for (const tx of ordered) {
    const symbol = String(tx.symbol || '').trim().toUpperCase();
    const quantity = Number(tx.quantity);
    const amount = Number(tx.amount);
    const brokerage = Math.max(0, Number(tx.brokerage) || 0);
    if (!symbol) continue;
    const position = inventory.get(symbol) || {
      quantity: 0,
      costBasis: 0,
      realizedPnl: 0,
      derivedCount: 0,
      currencies: new Set(),
      invalid: false,
    };
    if (!(quantity > 0) || !(amount > 0) || !['BUY', 'SELL'].includes(tx.transaction_type)) {
      position.invalid = true;
      inventory.set(symbol, position);
      continue;
    }
    position.currencies.add(String(tx.currency || 'USD').trim().toUpperCase());
    if (tx.quantity_derived || tx.price_derived) position.derivedCount++;

    if (tx.transaction_type === 'BUY') {
      position.quantity += quantity;
      position.costBasis += amount + brokerage;
    } else {
      const tolerance = Math.max(0.00001, Math.abs(position.quantity) * 0.0001);
      if (position.quantity <= 0 || position.quantity + tolerance < quantity) {
        position.invalid = true;
      } else {
        const averageCost = position.costBasis / position.quantity;
        const proceeds = Math.max(0, amount - brokerage);
        position.realizedPnl += proceeds - averageCost * quantity;
        position.quantity -= quantity;
        position.costBasis -= averageCost * quantity;
        if (position.quantity <= tolerance) {
          position.quantity = 0;
          position.costBasis = 0;
        }
      }
    }
    inventory.set(symbol, position);
  }

  const holdingsBySymbol = new Map();
  for (const row of holdings) {
    const symbol = String(row.symbol || '').trim().toUpperCase();
    holdingsBySymbol.set(symbol, (holdingsBySymbol.get(symbol) || 0) + Number(row.quantity || 0));
  }

  const result = new Map();
  for (const [symbol, position] of inventory.entries()) {
    const expected = holdingsBySymbol.get(symbol) || 0;
    const tolerance = Math.max(0.00001, Math.abs(expected) * 0.0001);
    const quantityMismatch = Math.abs(position.quantity - expected) > tolerance;
    const currencyMismatch = position.currencies.size !== 1;
    const valid = !position.invalid && !quantityMismatch && !currencyMismatch && position.quantity > 0 && position.costBasis > 0;
    result.set(symbol, {
      quantity: position.quantity,
      openCostBasis: position.costBasis,
      averageCost: position.quantity > 0 ? position.costBasis / position.quantity : null,
      realizedPnl: position.realizedPnl,
      derivedCount: position.derivedCount,
      valid,
      quantityMismatch,
      currencyMismatch,
      invalidSequence: position.invalid,
    });
  }
  return result;
}

export function getHoldingReturnGivebackTransition(returnPct, peakPct, active = false) {
  if (returnPct == null || peakPct == null || returnPct === '' || peakPct === '') return { peakPct: null, trigger: false, reset: false, givebackPct: null };
  const current = Number(returnPct), peak = Number(peakPct);
  if (!Number.isFinite(current) || !Number.isFinite(peak)) return { peakPct: null, trigger: false, reset: false, givebackPct: null };
  const nextPeak = Math.max(current, peak), givebackPct = nextPeak - current;
  return { peakPct: nextPeak, trigger: !active && nextPeak >= 30 && givebackPct >= 10, reset: Boolean(active) && givebackPct <= 5, givebackPct };
}

export function getHoldingReviewTransition(symbol, returnPct, actionItems = [], earnings = [], oldState = null) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase(), value = Number(returnPct);
  if (!normalizedSymbol || !Number.isFinite(value) || value < 15) return { trigger: false, reset: Boolean(oldState?.active), signature: null, items: [], earnings: [] };
  const items = (Array.isArray(actionItems) ? actionItems : [])
    .filter(item => String(item?.symbol || '').trim().toUpperCase() === normalizedSymbol && ['ACT', 'WATCH'].includes(String(item?.severity || '').toUpperCase()))
    .slice(0, 3).map(item => ({ severity: String(item.severity).toUpperCase(), title: String(item.title || 'Saved rule'), detail: String(item.detail || 'Review the recorded holding thesis and rules.') }));
  const upcoming = (Array.isArray(earnings) ? earnings : [])
    .filter(item => String(item?.symbol || '').trim().toUpperCase() === normalizedSymbol && Number(item?.daysUntil) >= 0 && Number(item?.daysUntil) <= 7)
    .map(item => ({ date: String(item.date || ''), daysUntil: Number(item.daysUntil) }));
  if (!items.length && !upcoming.length) return { trigger: false, reset: Boolean(oldState?.active), signature: null, items, earnings: upcoming };
  const signature = [...items.map(item => item.severity + ':' + item.title), ...upcoming.map(item => 'EARNINGS:' + item.date)].sort().join('|');
  return { trigger: !oldState?.active || String(oldState?.metadata?.signature || '') !== signature, reset: false, signature, items, earnings: upcoming };
}

export function buildHoldingThesisContext(symbol, holding = null, actionItems = []) {
  const thesis = String(holding?.decision_thesis || '').trim();
  const notes = String(holding?.notes || '').trim();
  const practicalNotes = String(holding?.practical_notes || '').trim();
  const ownActions = (Array.isArray(actionItems) ? actionItems : [])
    .filter(item => String(item?.symbol || '').trim().toUpperCase() === String(symbol || '').trim().toUpperCase()
      && ['ACT', 'WATCH'].includes(String(item?.severity || '').toUpperCase()))
    .slice(0, 2);
  const lines = [
    'ADD OPPORTUNITY: INSUFFICIENT EVIDENCE — no independent, evidence-backed add signal is available in this alert.',
    'Why: a profit milestone alone does not establish attractive valuation, a valid thesis, or suitable position sizing.',
    'Saved thesis: ' + (thesis || notes || 'not recorded for this holding.'),
  ];
  if (ownActions.length) {
    lines.push('Thesis/risk evidence from Decision Center:');
    ownActions.forEach(item => lines.push('• [' + String(item.severity).toUpperCase() + '] ' + String(item.title || 'Review signal') + ': ' + String(item.detail || 'Details unavailable.')));
  } else {
    lines.push('Decision evidence: no symbol-specific ACT/WATCH item was returned in this scan; this is not proof that the thesis is intact.');
  }
  if (practicalNotes) lines.push('Saved context: ' + practicalNotes);
  if (holding?.loss_limit_pct != null) lines.push('Saved loss limit: ' + Number(holding.loss_limit_pct) + '%');
  if (holding?.exit_rule_text) lines.push('Saved exit rule: ' + String(holding.exit_rule_text));
  else if (holding?.exit_rule_type) lines.push('Saved exit rule: ' + String(holding.exit_rule_type) + (holding.exit_rule_value != null ? ' (' + String(holding.exit_rule_value) + ')' : ''));
  if (holding?.target_allocation_pct != null) lines.push('Target portfolio weight: ' + Number(holding.target_allocation_pct) + '%');
  if (holding?.max_allocation_pct != null) lines.push('Maximum portfolio weight: ' + Number(holding.max_allocation_pct) + '%');
  lines.push('Next check: verify current valuation, fresh company evidence, downside risk and concentration before considering an add.');
  return lines;
}

async function loadHoldingContexts(symbols) {
  try {
    const rows = await supabase('portfolio_holdings?select=symbol,decision_thesis,notes,practical_notes,loss_limit_pct,exit_rule_type,exit_rule_value,exit_rule_text,target_allocation_pct,max_allocation_pct');
    const wanted = new Set((symbols || []).map(symbol => String(symbol).trim().toUpperCase()));
    return Object.fromEntries((Array.isArray(rows) ? rows : [])
      .filter(row => wanted.has(String(row.symbol || '').trim().toUpperCase()))
      .map(row => [String(row.symbol).trim().toUpperCase(), row]));
  } catch {
    return {};
  }
}

function formatGroupedHoldingAlerts(events, holdingContexts = {}, actionItems = []) {
  const bySymbol = new Map();
  for (const event of events) {
    const symbol = String(event.symbol || '').toUpperCase();
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
    bySymbol.get(symbol).push(event);
  }
  const lines = ['📊 AI Infra Watch · Holding Review Digest', new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST', '', 'Review alerts only — no automatic buy/sell instructions.'];
  for (const [symbol, symbolEvents] of bySymbol) {
    const row = symbolEvents.find(event => event.row)?.row;
    const returnPct = row ? Number(row.pnlPct) : null;
    lines.push('', '━━ ' + symbol + (Number.isFinite(returnPct) ? ' · ' + signedPct(returnPct) + ' from average buy price' : '') + ' ━━');
    for (const event of symbolEvents) {
      if (event.type === 'milestone') lines.push('📈 ' + event.threshold + '% profit milestone crossed.');
      else if (event.type === 'giveback') lines.push('⚠️ Profit give-back: ' + Number(event.givebackPct).toFixed(1) + ' percentage points below the ' + Number(event.peakPct).toFixed(1) + '% peak.');
      else if (event.type === 'review') {
        lines.push('🧭 Thesis review:');
        event.items.slice(0, 2).forEach(item => lines.push('• [' + item.severity + '] ' + item.title + ': ' + item.detail));
        event.earnings.slice(0, 2).forEach(item => lines.push('• Earnings ' + (item.daysUntil === 0 ? 'today' : 'in ' + item.daysUntil + 'd') + (item.date ? ' (' + item.date + ')' : '') + '.'));
      }
    }
    if (row) {
      lines.push('Avg buy ' + money(row.averageCost) + ' · quote ' + money(row.price) + ' · open cost ' + money(row.openCostBasis) + ' · unrealized ' + signedMoney(row.pnl) + ' · realized ' + signedMoney(Number(row.realizedPnl || 0)));
      if (Number(row.positionReview || 0) > 0) lines.push('Cost-basis note: ' + Number(row.positionReview) + ' transaction(s) use derived values; verify broker records.');
    }
    lines.push(...buildHoldingThesisContext(symbol, holdingContexts[symbol] || null, actionItems));
    lines.push('Review alert only — no automatic buy/sell instruction.');
  }
  const maxLength = 3900;
  if (lines.join('\n').length > maxLength) {
    while (lines.join('\n').length > maxLength && lines.length > 8) lines.splice(lines.length - 2, 2);
    lines.push('', 'Additional lower-priority details were omitted to fit Telegram message limits.');
  }
  return lines.join('\n');
}

export async function evaluatePortfolioHoldingReturnAlerts(digest) {
  const rows = Array.isArray(digest?.rows) ? digest.rows : [];
  let transactionRows = [];
  try {
    transactionRows = await supabase('portfolio_transactions?select=symbol,transaction_type,trade_date,quantity,amount,brokerage,source_row,currency,quantity_derived,price_derived&order=trade_date.asc,source_row.asc') || [];
  } catch (error) {
    return { evaluated: false, reason: 'transaction ledger unavailable; refusing to estimate holding return from stored average-cost snapshots', evaluatedHoldings: 0, triggered: [], sent: 0, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const ledger = deriveHoldingLedgerCostBasis(transactionRows, rows);
  const eligible = rows.flatMap(row => {
    const symbol = String(row?.symbol || '').trim().toUpperCase(), position = ledger.get(symbol);
    if (String(row?.quoteStatus || '') !== 'fresh' || !symbol || !(Number(row?.quantity) > 0) || !(Number(row?.price) > 0) || !position?.valid ||
      Math.abs(Number(row.quantity) - Number(position.quantity)) > Math.max(0.00001, Math.abs(Number(row.quantity)) * 0.0001)) return [];
    const averageCost = Number(position.averageCost);
    if (!(averageCost > 0)) return [];
    const value = Number(row.price) * Number(row.quantity), openCostBasis = Number(position.openCostBasis);
    return [{ ...row, symbol, averageCost, openCostBasis, pnl: value - openCostBasis, pnlPct: (Number(row.price) / averageCost - 1) * 100,
      realizedPnl: Number(position.realizedPnl || 0), positionReview: Number(position.derivedCount || 0) }];
  });
  if (!eligible.length) return { evaluated: false, reason: 'no fresh, ledger-reconciled holdings with reliable cost basis', evaluatedHoldings: 0, triggered: [], sent: 0, errors: [] };

  const keys = eligible.flatMap(row => [...THRESHOLDS.map(threshold => holdingStateKey(row.symbol, threshold)),
    'holding-peak-return:' + row.symbol, 'holding-giveback:' + row.symbol, 'holding-review:' + row.symbol]);
  const inFilter = 'event_key=in.' + encodeURIComponent('(' + keys.map(key => '"' + key + '"').join(',') + ')');
  const previousRows = await supabase('server_alert_state?select=event_key,active,last_triggered_at,metadata&' + inFilter + '&limit=300');
  const previous = new Map((previousRows || []).map(row => [String(row.event_key), row]));
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim(), chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) return { evaluated: true, evaluatedHoldings: eligible.length, triggered: [], sent: 0, errors: ['Telegram credentials are not configured; alert state was not changed.'] };

  const timestamp = new Date().toISOString(), updates = [], events = [], triggered = [], errors = [];
  const review = digest?.returnReview || {}, actionItems = Array.isArray(review.actionItems) ? review.actionItems : [], earnings = Array.isArray(review.earnings) ? review.earnings : [];
  for (const row of eligible) {
    const symbol = row.symbol, transitions = getHoldingReturnThresholdTransitions(symbol, row.pnlPct, previous);
    for (const threshold of transitions.reset) {
      const key = holdingStateKey(symbol, threshold), old = previous.get(key);
      updates.push({ event_key: key, active: false, last_seen_at: timestamp, last_triggered_at: old?.last_triggered_at || null,
        metadata: { symbol, thresholdPct: threshold, lastObservedReturnPct: Number(row.pnlPct), resetAt: timestamp } });
    }
    for (const threshold of transitions.trigger) {
      events.push({ type: 'milestone', symbol, threshold, row });
      triggered.push({ type: 'milestone', symbol, threshold });
    }

    const peakKey = 'holding-peak-return:' + symbol, oldPeakState = previous.get(peakKey), oldPeak = Number(oldPeakState?.metadata?.peakReturnPct);
    const peakTransition = getHoldingReturnGivebackTransition(row.pnlPct, Number.isFinite(oldPeak) ? oldPeak : Number(row.pnlPct), false);
    const peakPct = peakTransition.peakPct == null ? Number(row.pnlPct) : peakTransition.peakPct;
    updates.push({ event_key: peakKey, active: true, last_seen_at: timestamp, last_triggered_at: oldPeakState?.last_triggered_at || null,
      metadata: { symbol, peakReturnPct: peakPct, lastObservedReturnPct: Number(row.pnlPct), updatedAt: timestamp } });

    const givebackKey = 'holding-giveback:' + symbol, oldGiveback = previous.get(givebackKey);
    const giveback = getHoldingReturnGivebackTransition(row.pnlPct, peakPct, Boolean(oldGiveback?.active));
    if (giveback.reset) updates.push({ event_key: givebackKey, active: false, last_seen_at: timestamp, last_triggered_at: oldGiveback?.last_triggered_at || null,
      metadata: { symbol, peakReturnPct: peakPct, lastObservedReturnPct: Number(row.pnlPct), resetAt: timestamp } });
    if (giveback.trigger) {
      events.push({ type: 'giveback', symbol, row, peakPct, givebackPct: giveback.givebackPct });
      triggered.push({ type: 'giveback', symbol, peakPct, givebackPct: giveback.givebackPct });
      updates.push({ event_key: givebackKey, active: true, last_seen_at: timestamp, last_triggered_at: timestamp,
        metadata: { symbol, peakReturnPct: peakPct, lastObservedReturnPct: Number(row.pnlPct), givebackPct: giveback.givebackPct } });
    }

    const reviewKey = 'holding-review:' + symbol, oldReview = previous.get(reviewKey);
    const reviewTransition = getHoldingReviewTransition(symbol, row.pnlPct, actionItems, earnings, oldReview);
    if (reviewTransition.reset) updates.push({ event_key: reviewKey, active: false, last_seen_at: timestamp, last_triggered_at: oldReview?.last_triggered_at || null,
      metadata: { symbol, resetAt: timestamp } });
    if (reviewTransition.trigger) {
      events.push({ type: 'review', symbol, row, items: reviewTransition.items, earnings: reviewTransition.earnings, signature: reviewTransition.signature });
      triggered.push({ type: 'review', symbol, signature: reviewTransition.signature });
      updates.push({ event_key: reviewKey, active: true, last_seen_at: timestamp, last_triggered_at: timestamp,
        metadata: { symbol, signature: reviewTransition.signature, returnPct: Number(row.pnlPct) } });
    }
  }

  if (events.length) {
    const symbols = [...new Set(events.map(event => event.symbol))];
    const holdingContexts = await loadHoldingContexts(symbols);
    const text = formatGroupedHoldingAlerts(events, holdingContexts, actionItems), dashboardBase = 'https://ai-infra-watch-theta.vercel.app';
    const keyboard = symbols.slice(0, 4).map(symbol => [{ text: 'Review ' + symbol, url: dashboardBase + '/portfolio?portfolio_tab=holdings&portfolio_symbol=' + encodeURIComponent(symbol) }]);
    keyboard.push([{ text: 'Open Decision Center', url: dashboardBase + '/overview' }]);
    try {
      const response = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true, reply_markup: { inline_keyboard: keyboard } }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(String(body?.description || 'Telegram HTTP ' + response.status));
      for (const event of events) if (event.type === 'milestone') {
        const key = holdingStateKey(event.symbol, event.threshold);
        updates.push({ event_key: key, active: true, last_seen_at: timestamp, last_triggered_at: timestamp,
          metadata: { symbol: event.symbol, thresholdPct: event.threshold, returnPct: Number(event.row.pnlPct), price: Number(event.row.price),
            averageCost: Number(event.row.averageCost), quantity: Number(event.row.quantity), unrealizedPnl: Number(event.row.pnl), quoteCoverage: event.row.quoteStatus } });
      }
    } catch (error) {
      errors.push('grouped holding alert: ' + (error instanceof Error ? error.message : 'Telegram delivery failed'));
      for (const event of events) {
        const key = event.type === 'milestone' ? holdingStateKey(event.symbol, event.threshold) : event.type === 'giveback' ? 'holding-giveback:' + event.symbol : 'holding-review:' + event.symbol;
        const index = updates.findIndex(item => item.event_key === key && item.active === true);
        if (index >= 0) updates.splice(index, 1);
      }
    }
  }
  if (updates.length) await supabase('server_alert_state', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(updates) });
  return { evaluated: true, evaluatedHoldings: eligible.length, triggered, sent: events.length && !errors.length ? 1 : 0, errors };
}
