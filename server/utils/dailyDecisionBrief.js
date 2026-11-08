// Pure presentation only: no transport, environment access, policy evaluation or IO.
export const TELEGRAM_BRIEF_LIMIT = 3600;
const BASE = 'https://ai-infra-watch-theta.vercel.app';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const symbol = value => typeof value === 'string' && /^[A-Z][A-Z0-9.-]{0,14}$/.test(value);
const clean = (value, limit) => typeof value === 'string'
  ? Array.from(value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, limit).join('')
  : '';
const money = value => finite(value) ? (value < 0 ? '-$' : '+$') + Math.abs(value).toFixed(2) : 'unavailable';
const number = value => count(value) ? String(value) : 'unavailable';
const calendarDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
const isPrompt = item => item && symbol(item.symbol) && ['ACT', 'WATCH'].includes(item.severity) &&
  clean(item.title, 70) && clean(item.detail, 220);

export function summarizeDecisionActions(items, limit = 3) {
  const prompts = (Array.isArray(items) ? items : []).filter(item => ['ACT', 'WATCH'].includes(item?.severity));
  const shown = Math.min(prompts.length, limit);
  return { version: 1, total: prompts.length, act: prompts.filter(item => item.severity === 'ACT').length,
    watch: prompts.filter(item => item.severity === 'WATCH').length, shown, omitted: prompts.length - shown };
}

function trustedSummary(summary, returned) {
  return summary?.version === 1 && ['total', 'act', 'watch', 'shown', 'omitted'].every(key => count(summary[key])) &&
    summary.total === summary.act + summary.watch && summary.total === summary.shown + summary.omitted &&
    summary.shown === returned.length && summary.act >= returned.filter(item => item.severity === 'ACT').length &&
    summary.watch >= returned.filter(item => item.severity === 'WATCH').length;
}

export function buildTelegramDecisionBrief(decision, date, weekly = null) {
  const footer = 'Review prompts, not trade instructions. Open Daily Review for full context.';
  const lines = ['AI Infra Watch · Daily Decision Brief', clean(date, 40) || 'Date unavailable'];
  const snapshot = typeof decision?.checkedAt === 'string' && Number.isFinite(Date.parse(decision.checkedAt))
    ? new Date(decision.checkedAt).toISOString() : 'unavailable';
  lines.push('Snapshot time: ' + snapshot, '');
  if (!decision || decision.ok === false) {
    lines.push('DECISION LAYER UNAVAILABLE', 'Review queue, rule coverage and earnings cannot be verified.',
      'This is not a clean bill of health. Check Daily Review before changing exposure.');
    return { version: 1, text: [...lines, '', footer].join('\n'), reviewSymbols: [] };
  }

  const portfolio = decision.portfolio || {};
  const coverage = decision.quoteCoverage || portfolio.quoteCoverage || {};
  const accounting = portfolio.accountingStatus;
  const warnings = [];
  if (coverage.status === 'partial') warnings.push('Quote coverage partial; verify price-dependent prompts.');
  else if (coverage.status === 'stale-fallback') warnings.push('Quotes use stale fallbacks; verify current prices first.');
  else if (coverage.status !== 'complete') warnings.push('Quote coverage unavailable; freshness is not established.');
  if (!['complete', 'review-transactions'].includes(accounting)) warnings.push('Accounting incomplete or unknown; return comparisons withheld.');
  else if (accounting === 'review-transactions') warnings.push('Accounting uses derived transactions; displayed P&L is provisional.');
  if (Array.isArray(portfolio.quantityMismatchSymbols) && portfolio.quantityMismatchSymbols.length)
    warnings.push('Transaction quantities do not reconcile; verify the ledger.');
  if (decision.earningsStatus !== 'ok') warnings.push('EARNINGS CALENDAR UNAVAILABLE; upcoming-event coverage is unknown.');
  if (warnings.length) lines.push('VERIFY DATA FIRST', ...warnings.map(value => '• ' + value), '');

  const returned = Array.isArray(decision.actionItems) ? decision.actionItems.filter(isPrompt) : [];
  const actions = [...returned].sort((a, b) => (a.severity === 'ACT' ? 0 : 1) - (b.severity === 'ACT' ? 0 : 1)).slice(0, 3);
  const summary = decision.actionSummary;
  lines.push('TODAY’S REVIEW');
  if (trustedSummary(summary, returned)) {
    lines.push(summary.act + ' urgent review · ' + summary.watch + ' watch · showing ' + actions.length + '/' + summary.total + ' prompts');
  } else if (Array.isArray(decision.actionItems)) {
    lines.push('Returned prompts: ' + returned.filter(item => item.severity === 'ACT').length + ' urgent review · ' +
      returned.filter(item => item.severity === 'WATCH').length + ' watch; full totals unavailable.');
  } else lines.push('Review queue unavailable.');
  if (Array.isArray(decision.actionItems) && returned.length !== decision.actionItems.length)
    lines.push('Some returned prompts are unsupported or incomplete; inspect Daily Review.');
  if (!actions.length) lines.push('No usable review prompts returned. This does not establish a clean day.');
  actions.forEach((item, index) => lines.push(
    (index + 1) + '. ' + item.symbol + ' · ' + (item.severity === 'ACT' ? 'URGENT REVIEW' : 'WATCH') + ' · ' + clean(item.title, 70),
    'Why: ' + clean(item.detail, 220),
    'Next: ' + (item.severity === 'ACT' ? 'Verify the rule, current quote and thesis before deciding.' : 'Check the evidence and set your next review condition.'),
  ));
  lines.push('Rule coverage: ' + number(decision.rules?.total) + ' rules / ' + number(portfolio.holdings) +
    ' holdings · ' + number(decision.rules?.noRule) + ' without active rules.');
  if (coverage.status === 'complete') lines.push('Quote coverage complete; price observation times are not supplied in this brief.');

  lines.push('', 'PORTFOLIO & RISK');
  const quantitiesReconcile = !Array.isArray(portfolio.quantityMismatchSymbols) || !portfolio.quantityMismatchSymbols.length;
  const usableAccounting = ['complete', 'review-transactions'].includes(accounting) && quantitiesReconcile && coverage.status === 'complete';
  lines.push(usableAccounting
    ? 'Trading P&L: ' + money(portfolio.totalTradingPnl) + ' · realized ' + money(portfolio.realizedPnl) + ' · unrealized ' + money(portfolio.unrealizedPnl)
    : 'Portfolio P&L unavailable for decision use; verify accounting.');
  const concentration = portfolio.concentrationTop3Pct;
  lines.push('Top 3 concentration: ' + (coverage.status === 'complete' && finite(concentration) && concentration >= 0 && concentration <= 100 ? concentration.toFixed(1) + '%' : 'unavailable'));
  const scenarios = portfolio.riskScenarios;
  const stress = portfolio.scenarioShockTotal ?? portfolio.semiconductorShock15Pct;
  const reconciledStress = finite(stress) && Array.isArray(scenarios) && scenarios.length > 0 &&
    scenarios.every(item => finite(item?.shock)) && Math.abs(scenarios.reduce((sum, item) => sum + item.shock, 0) - stress) < 0.01;
  lines.push('Scenario stress: ' + (reconciledStress ? money(stress) + ' · illustrative, not a prediction.' : 'unavailable or unreconciled; not a zero-risk estimate.'));
  const benchmark = ['SPY', 'SOXX'].map(ticker => {
    const item = decision.benchmark?.[ticker];
    const eligible = accounting === 'complete' && quantitiesReconcile && coverage.status === 'complete' &&
      item?.coverage?.status === 'complete' && finite(portfolio.cashFlowPnl) && finite(item?.pnl);
    return ticker + ': ' + (eligible ? money(portfolio.cashFlowPnl - item.pnl) + ' vs same dated cash flows' : 'comparison unavailable');
  });
  lines.push(benchmark.join(' · '));

  lines.push('', 'NEXT 7 DAYS');
  const events = Array.isArray(decision.earnings) ? decision.earnings.filter(item => symbol(item?.symbol) &&
    calendarDate(item.date) && count(item.daysUntil) && item.daysUntil <= 7) : [];
  if (decision.earningsStatus !== 'ok' || !Array.isArray(decision.earnings)) lines.push('Earnings coverage unavailable; absence is not confirmed.');
  else if (events.length) {
    lines.push(...events.slice(0, 3).map(item => item.symbol + ' earnings · ' + item.date + ' · ' + (item.daysUntil === 0 ? 'today' : 'in ' + item.daysUntil + 'd')));
    lines.push('Provider-reported dates; confirmation is not independently verified.');
  } else lines.push(decision.earnings.length ? 'Returned earnings dates are unusable; check the calendar.' : 'No events returned by the monitored feed; source coverage is not guaranteed.');
  if (events.length > 3) lines.push((events.length - 3) + ' additional returned events in Daily Review.');

  const forecast = decision.forecast;
  lines.push('', 'EVIDENCE CHECK', 'Forecasts: ' + number(forecast?.independentVerified) + ' independent verified · ' +
    number(forecast?.pending) + ' pending. Counts alone do not establish decision eligibility.');
  if (weekly) lines.push('Weekly journal: ' + number(weekly.decisions) + ' decisions · ' + number(weekly.outcomes) + ' outcome reviews.');
  let body = lines.join('\n');
  const budget = TELEGRAM_BRIEF_LIMIT - footer.length - 2;
  if (body.length > budget) {
    const notice = '\nFurther detail omitted; open Daily Review.';
    body = body.slice(0, budget - notice.length).replace(/[\uD800-\uDBFF]$/, '') + notice;
  }
  return { version: 1, text: body + '\n\n' + footer, reviewSymbols: [...new Set(actions.map(item => item.symbol))] };
}

export function buildTelegramDigestPayload(digest, chatId) {
  const brief = digest?.telegramBrief?.version === 1 && typeof digest.telegramBrief.text === 'string' && digest.telegramBrief.text.trim() &&
    digest.telegramBrief.text.length <= TELEGRAM_BRIEF_LIMIT ? digest.telegramBrief : buildTelegramDecisionBrief(null, digest?.date);
  const symbols = Array.isArray(brief.reviewSymbols) ? [...new Set(brief.reviewSymbols.filter(symbol))].slice(0, 3) : [];
  return { chat_id: chatId, text: brief.text, disable_web_page_preview: true, reply_markup: { inline_keyboard: [
    ...symbols.map(ticker => [{ text: 'Review ' + ticker, url: BASE + '/portfolio?portfolio_tab=holdings&portfolio_symbol=' + encodeURIComponent(ticker) + '&portfolio_detail=' + encodeURIComponent(ticker) }]),
    [{ text: 'Open Daily Review', url: BASE + '/portfolio?portfolio_tab=overview' }, { text: 'Open Watchlist', url: BASE + '/watchlist' }],
  ] } };
}
