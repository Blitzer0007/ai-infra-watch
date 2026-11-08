import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTelegramDecisionBrief, buildTelegramDigestPayload, summarizeDecisionActions, TELEGRAM_BRIEF_LIMIT } from '../../server/utils/dailyDecisionBrief.js';

const prompt = (symbol = 'NVDA', severity = 'ACT') => ({ symbol, severity, title: 'Rule reached', detail: 'Price $98 is below your stored $100 rule.' });
const fixture = () => ({ ok: true, checkedAt: '2026-11-08T10:00:00Z', actionItems: [prompt()],
  actionSummary: summarizeDecisionActions([prompt()]), rules: { total: 4, noRule: 0 },
  portfolio: { holdings: 2, accountingStatus: 'complete', totalTradingPnl: 20, realizedPnl: 5, unrealizedPnl: 15,
    cashFlowPnl: 20, quoteCoverage: { status: 'complete' }, concentrationTop3Pct: 100,
    scenarioShockTotal: -25, riskScenarios: [{ shock: -20 }, { shock: -5 }], quantityMismatchSymbols: [] },
  benchmark: { SPY: { pnl: 10, coverage: { status: 'complete' } }, SOXX: { pnl: 30, coverage: { status: 'partial' } } },
  earningsStatus: 'ok', earnings: [{ symbol: 'NVDA', date: '2026-11-10', daysUntil: 2 }],
  forecast: { independentVerified: 12, pending: 4 },
});

test('daily Telegram prioritizes explainable review, dated evidence and supported metrics', () => {
  const brief = buildTelegramDecisionBrief(fixture(), '2026-11-08');
  assert.ok(brief.text.indexOf('TODAY’S REVIEW') < brief.text.indexOf('PORTFOLIO & RISK'));
  assert.match(brief.text, /1 urgent review · 0 watch · showing 1\/1/);
  assert.match(brief.text, /Why: Price \$98/);
  assert.match(brief.text, /Next: Verify the rule/);
  assert.match(brief.text, /2026-11-08T10:00:00.000Z/);
  assert.match(brief.text, /Trading P&L: \+\$20.00/);
  assert.match(brief.text, /Scenario stress: -\$25.00 · illustrative, not a prediction/);
  assert.match(brief.text, /SPY: \+\$10.00 vs same dated cash flows/);
  assert.match(brief.text, /SOXX: comparison unavailable/);
  assert.match(brief.text, /confirmation is not independently verified/);
  assert.match(brief.text, /Counts alone do not establish decision eligibility/);
  assert.deepEqual(brief.reviewSymbols, ['NVDA']);
});

test('queue totals describe all upstream prompts separately from the returned three', () => {
  const prompts = [prompt('AMD', 'WATCH'), prompt('MU'), prompt('NVDA'), prompt('MSFT', 'WATCH'), { severity: 'SETUP' }];
  assert.deepEqual(summarizeDecisionActions(prompts), { version: 1, total: 4, act: 2, watch: 2, shown: 3, omitted: 1 });
  const value = fixture(); value.actionSummary = summarizeDecisionActions(prompts); value.actionItems = prompts.slice(0, 3) as any;
  const brief = buildTelegramDecisionBrief(value, '2026-11-08');
  assert.match(brief.text, /2 urgent review · 2 watch · showing 3\/4/);
  assert.ok(brief.text.indexOf('MU · URGENT') < brief.text.indexOf('AMD · WATCH'));
});

test('legacy or inconsistent queue metadata never invents full totals', () => {
  for (const summary of [undefined, { version: 1, total: 20, act: 0, watch: 20, shown: 1, omitted: 19 }]) {
    const value = { ...fixture(), actionSummary: summary };
    assert.match(buildTelegramDecisionBrief(value, '2026-11-08').text, /full totals unavailable/);
  }
});

test('absent decision data never claims zero actions, zero risk or complete rule coverage', () => {
  const brief = buildTelegramDecisionBrief(null, '2026-11-08');
  assert.match(brief.text, /DECISION LAYER UNAVAILABLE/);
  assert.match(brief.text, /not a clean bill of health/);
  assert.doesNotMatch(brief.text, /0 urgent|0 watch|all holdings|\$0.00|No events/);
  assert.deepEqual(brief.reviewSymbols, []);
  assert.deepEqual(buildTelegramDecisionBrief({ ok: false }, '2026-11-08').reviewSymbols, []);
});

test('unknown rule, quote, earnings and forecast fields remain unavailable', () => {
  const text = buildTelegramDecisionBrief({}, '2026-11-08').text;
  assert.match(text, /Quote coverage unavailable/);
  assert.match(text, /Rule coverage: unavailable rules \/ unavailable holdings/);
  assert.match(text, /Forecasts: unavailable independent verified/);
  assert.match(text, /EARNINGS CALENDAR UNAVAILABLE/);
  assert.doesNotMatch(text, /No events returned|0 independent|0 holdings|all holdings/);
});

test('partial, stale and unknown quotes withhold portfolio and benchmark claims', () => {
  for (const status of ['partial', 'stale-fallback', 'unknown']) {
    const value = fixture(); value.portfolio.quoteCoverage.status = status;
    const text = buildTelegramDecisionBrief(value, '2026-11-08').text;
    assert.ok(text.indexOf('VERIFY DATA FIRST') < text.indexOf('TODAY’S REVIEW'));
    assert.match(text, /Portfolio P&L unavailable for decision use/);
    assert.match(text, /SPY: comparison unavailable/);
    assert.doesNotMatch(text, /Trading P&L: \+\$20/);
  }
});

test('unreconciled accounting and quantities withhold financial comparisons', () => {
  for (const patch of [{ accountingStatus: 'quantity-mismatch' }, { quantityMismatchSymbols: ['NVDA'] }]) {
    const value = fixture(); Object.assign(value.portfolio, patch);
    const text = buildTelegramDecisionBrief(value, '2026-11-08').text;
    assert.match(text, /Portfolio P&L unavailable/); assert.match(text, /SPY: comparison unavailable/);
  }
  const value = fixture(); value.portfolio.accountingStatus = 'review-transactions';
  const text = buildTelegramDecisionBrief(value, '2026-11-08').text;
  assert.match(text, /P&L is provisional/); assert.match(text, /Trading P&L: \+\$20/);
  assert.match(text, /SPY: comparison unavailable/);
});

test('missing, invalid and inconsistent stress never becomes a zero-risk estimate', () => {
  for (const patch of [{ scenarioShockTotal: null }, { scenarioShockTotal: -99 }, { riskScenarios: [] }, { riskScenarios: [{ shock: null }] }]) {
    const value = fixture(); Object.assign(value.portfolio, patch);
    assert.match(buildTelegramDecisionBrief(value, '2026-11-08').text, /unavailable or unreconciled; not a zero-risk estimate/);
  }
});

test('earnings failures suppress dates and raw provider errors from the Telegram brief', () => {
  const value = { ...fixture(), earningsStatus: 'unavailable', earningsError: 'token=secret-fixture-should-not-render' };
  const text = buildTelegramDecisionBrief(value, '2026-11-08').text;
  assert.match(text, /EARNINGS CALENDAR UNAVAILABLE/);
  assert.doesNotMatch(text, /secret-fixture|NVDA earnings|No events returned/);
});

test('empty and unusable earnings snapshots are distinguished from confirmed absence', () => {
  const value = fixture(); value.earnings = [];
  assert.match(buildTelegramDecisionBrief(value, '2026-11-08').text, /source coverage is not guaranteed/);
  value.earnings = [{ symbol: 'NVDA', date: 'bad-date', daysUntil: 2 }];
  assert.match(buildTelegramDecisionBrief(value, '2026-11-08').text, /dates are unusable/);
});

test('unknown severities and invalid symbol links remain unsupported instead of becoming watch prompts', () => {
  const value = fixture(); value.actionItems = [prompt('../bad'), prompt('NVDA', 'SETUP')] as any;
  const brief = buildTelegramDecisionBrief(value, '2026-11-08');
  assert.match(brief.text, /unsupported or incomplete/); assert.deepEqual(brief.reviewSymbols, []);
  assert.doesNotMatch(brief.text, /NVDA · WATCH|\.\.\/bad/);
});

test('single-message budget preserves the review disclaimer with hostile long Unicode input', () => {
  const value = fixture(); value.actionItems = ['NVDA', 'AMD', 'MU'].map(ticker => ({ ...prompt(ticker), title: '🧠'.repeat(10000), detail: '📊\n\u202e'.repeat(10000) }));
  value.actionSummary = summarizeDecisionActions(value.actionItems);
  const brief = buildTelegramDecisionBrief(value, 'x'.repeat(10000), { decisions: NaN, outcomes: null });
  assert.ok(brief.text.length <= TELEGRAM_BRIEF_LIMIT); assert.ok(brief.text.length < 4096);
  assert.ok(brief.text.endsWith('Review prompts, not trade instructions. Open Daily Review for full context.'));
  assert.doesNotMatch(brief.text, /\u202e|NaN|Infinity|undefined/);
});

test('Telegram payload links only displayed symbols to the new holding dialog and real daily workspace', () => {
  const value = fixture(); value.actionItems.push(prompt('NVDA', 'WATCH'));
  const payload = buildTelegramDigestPayload({ telegramBrief: buildTelegramDecisionBrief(value, '2026-11-08') }, 'fictional-chat');
  assert.equal(payload.chat_id, 'fictional-chat'); assert.equal(payload.disable_web_page_preview, true);
  const keys = payload.reply_markup.inline_keyboard.flat();
  assert.equal(keys.filter(item => item.text === 'Review NVDA').length, 1);
  assert.match(keys[0].url, /portfolio_detail=NVDA/);
  assert.ok(keys.some(item => item.url.endsWith('portfolio_tab=overview')));
  assert.ok(!keys.some(item => item.text.includes('Journal')));
});

test('missing or oversized Telegram presentation fails closed without sending the legacy verbose report', () => {
  for (const telegramBrief of [undefined, { version: 1, text: 'x'.repeat(5000) }]) {
    const payload = buildTelegramDigestPayload({ text: 'unbounded legacy analytics', telegramBrief }, 'fictional-chat');
    assert.match(payload.text, /DECISION LAYER UNAVAILABLE/); assert.doesNotMatch(payload.text, /legacy analytics/);
    assert.equal(payload.reply_markup.inline_keyboard.length, 1);
  }
});
