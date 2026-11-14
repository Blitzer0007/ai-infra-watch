import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationLimits, optionalFiniteNumber, peakDrawdownPct, scenarioParameters, ruleProximityText } from '../../server/utils/portfolioRuleMath.js';
import { ruleDistance, calculateActualPortfolio, simulateSameCash, transactionNetCash } from '../../server/api/decision-center.js';
import { calculatePortfolioTradingPerformance } from './portfolioAccounting';
import { calculateAccountCashFlowPerformance } from './portfolioCashFlowAccounting';
import { deriveHoldingLedgerCostBasis } from '../../server/api/portfolio-holding-return-alerts.js';
import { coverageInterval, wilsonInterval } from '../../server/utils/forecastCalibration.js';

test('unset and invalid numeric rules never become configured zeroes', () => {
  for (const value of [null, undefined, '', '  ', false, true, NaN, Infinity, 'Infinity', '0x10', {}]) {
    assert.equal(optionalFiniteNumber(value), null);
    assert.equal(allocationLimits({ max_allocation_pct: value }).maximum, null);
  }
  assert.equal(optionalFiniteNumber(' 12.5 '), 12.5);
  assert.equal(allocationLimits({ max_allocation_pct: 0 }).maximum, 0);
  assert.equal(allocationLimits({ max_allocation_pct: '25' }).maximum, 25);
});

test('out-of-range and contradictory allocations are withheld with configuration explanations', () => {
  for (const holding of [{ target_allocation_pct: 101 }, { max_allocation_pct: -1 }, { target_allocation_pct: 30, max_allocation_pct: 20 }]) {
    const limits = allocationLimits(holding);
    assert.equal(limits.target, null); assert.equal(limits.maximum, null); assert.ok(limits.issues.length);
  }
});

test('peak pullback uses the peak denominator, not the current-price upside denominator', () => {
  assert.ok(Math.abs(peakDrawdownPct(100, 80) - 20) < 1e-10);
  assert.equal(peakDrawdownPct(100, 110), 0);
  assert.equal(peakDrawdownPct(null, 80), null);
});

test('missing scenario beta and shock use documented defaults while explicit zero stays zero', () => {
  assert.deepEqual(scenarioParameters({ risk_beta: null, risk_leverage: null, scenario_shock_pct: null }), { beta: 1, leverage: 1, shockPct: 15 });
  assert.deepEqual(scenarioParameters({ risk_beta: 0, risk_leverage: 3, scenario_shock_pct: 0 }), { beta: 0, leverage: 3, shockPct: 0 });
});

test('stops exclude impossible percentages and malformed staged stops do not suppress a valid fallback', () => {
  for (const pct of [100, 150, Infinity]) {
    const result = ruleDistance({ average_cost: 100, loss_limit_pct: pct }, { price: 90 }, { points: [] });
    assert.equal(result.state, 'no-rule');
  }
  const result = ruleDistance({ average_cost: 100, loss_limit_pct: 10, rule_stages: [{ type: 'stop', pct: 100 }] }, { price: 80 }, { points: [] });
  assert.equal(result.state, 'breached'); assert.equal(result.rules[0].target, 90);
  assert.equal(ruleDistance({ average_cost: 100, loss_limit_pct: 10 }, { price: Infinity }, { points: [] }), null);
  assert.equal(ruleDistance({ average_cost: 100, broker_alert_prices: [Infinity, true, null] }, { price: 90 }, { points: [] }).state, 'no-rule');
});

test('a breached calendar time limit takes precedence over a near price rule or upside target', () => {
  for (const alert of [{ price: 100, direction: 'below' }, { price: 101, direction: 'above' }]) {
    const result = ruleDistance({ average_cost: 100, purchase_date: '2026-01-01', exit_rule_type: 'time-limit', exit_rule_value: 5, broker_alerts: [alert] },
      { price: 102 }, { points: [] }, new Date('2026-01-10T00:00:00Z'));
    assert.equal(result.state, 'breached'); assert.equal(result.nearest.unit, 'days');
  }
});

test('time rules need a real purchase date and use calendar days independently of DST', () => {
  for (const date of [null, 'bad', '2026-02-31']) {
    const result = ruleDistance({ average_cost: 100, purchase_date: date, rule_stages: [{ type: 'time_limit', days: 5 }] }, { price: 100 },
      { points: [{ date: '2026-01-01', price: 100 }] }, new Date('2026-03-10T00:00:00Z'));
    assert.equal(result.state, 'no-rule');
  }
  const result = ruleDistance({ average_cost: 100, purchase_date: '2026-03-07', exit_rule_type: 'time-limit', exit_rule_value: 5 },
    { price: 100 }, { points: [] }, new Date('2026-03-10T12:00:00Z'));
  assert.equal(result.nearest.distancePct, 2);
  assert.equal(ruleProximityText(result.nearest, 100), '2 calendar days remain on your time limit.');
  const future = ruleDistance({ average_cost: 100, purchase_date: '2026-01-01', exit_rule_type: 'trailing-stop', exit_rule_value: 10 }, { price: 100 },
    { points: [{ date: '2026-01-01', price: 100 }, { date: '2026-02-01', price: 200 }] }, new Date('2026-01-02T12:00:00Z'));
  assert.equal(future.rules[0].target, 90);
});

test('upside proximity describes required rise instead of saying price is above an unhit target', () => {
  assert.equal(ruleProximityText({ direction: 'above', distancePct: 2, target: 102, type: 'target' }, 100), '$100.00 needs a 2.0% rise to your target at $102.00.');
});

test('sale fees above gross proceeds remain a real loss in client, server and holding-ledger accounting', () => {
  const raw = [
    { symbol: 'TEST', transaction_type: 'BUY', quantity: 2, amount: 2, brokerage: 0, currency: 'USD', trade_date: '2026-01-01' },
    { symbol: 'TEST', transaction_type: 'SELL', quantity: 1, amount: 1, brokerage: 3, currency: 'USD', trade_date: '2026-01-02' },
  ];
  const trades = raw.map(row => ({ symbol: row.symbol, transactionType: row.transaction_type as 'BUY' | 'SELL', quantity: row.quantity, amount: row.amount,
    brokerage: row.brokerage, currency: row.currency, tradeDate: row.trade_date }));
  const client = calculatePortfolioTradingPerformance([{ symbol: 'TEST', quantity: 1, averageCost: 1, currentPrice: 1 }], trades, true);
  const server = calculateActualPortfolio([{ symbol: 'TEST', quantity: 1, average_cost: 1 }], raw, { TEST: { price: 1 } });
  const holding = deriveHoldingLedgerCostBasis(raw, [{ symbol: 'TEST', quantity: 1 }]).get('TEST');
  assert.equal(transactionNetCash(raw[1]), -2);
  assert.equal(client.realizedPnl, -3); assert.equal(server.realizedPnl, -3); assert.equal(holding.realizedPnl, -3);
  assert.equal(client.totalTradingPnl, -3); assert.equal(server.totalTradingPnl, -3);
  assert.equal(client.netSaleProceeds, -2); assert.equal(server.netSaleProceeds, -2);
  const account = calculateAccountCashFlowPerformance([{ symbol: 'TEST', quantity: 1, currentPrice: 1 }], trades,
    [{ flowType: 'deposit', amount: 10, currency: 'USD', fxToUsd: 1 }], true);
  assert.equal(account.cashBalanceUsd, 6); assert.equal(account.totalPnlUsd, -3);
});

test('unsupported benchmark cash flows withhold P&L and report partial coverage', () => {
  const buy = { transaction_type: 'BUY', amount: 100, brokerage: 0, trade_date: '2026-01-01' };
  for (const sale of [{ amount: 200, brokerage: 0 }, { amount: 1, brokerage: 3 }]) {
    const result = simulateSameCash([buy, { ...sale, transaction_type: 'SELL', trade_date: '2026-01-02' }],
      { points: [{ date: '2026-01-01', price: 100 }, { date: '2026-01-02', price: 100 }] }, 100);
    assert.equal(result.coverage.status, 'partial'); assert.equal(result.pnl, null); assert.equal(result.coverage.tradesSkipped, 1);
  }
});

test('client and server agree on chronological weighted-average P&L and the accounting identity', () => {
  for (const salePrice of [20, 50, 100]) {
    const raw = [{ symbol: 'TEST', transaction_type: 'SELL', quantity: 1, amount: salePrice, brokerage: 2, currency: 'USD', trade_date: '2026-03-01' },
      { symbol: 'TEST', transaction_type: 'BUY', quantity: 2, amount: 100, brokerage: 2, currency: 'USD', trade_date: '2026-01-01' }];
    const client = calculatePortfolioTradingPerformance([{ symbol: 'TEST', quantity: 1, averageCost: 51, currentPrice: 60 }],
      raw.map(row => ({ ...row, transactionType: row.transaction_type as 'BUY' | 'SELL', tradeDate: row.trade_date })), true);
    const server = calculateActualPortfolio([{ symbol: 'TEST', quantity: 1, average_cost: 51 }], raw, { TEST: { price: 60 } });
    assert.equal(server.totalTradingPnl, client.totalTradingPnl);
    assert.equal(server.totalTradingPnl, 60 + salePrice - 2 - 102);
  }
});

test('a single non-USD trade currency cannot be compared with USD prices or trigger a holding return alert', () => {
  const raw = [{ symbol: 'TEST', transaction_type: 'BUY', quantity: 1, amount: 100, currency: 'INR' }];
  const client = calculatePortfolioTradingPerformance([{ symbol: 'TEST', quantity: 1, averageCost: 100, currentPrice: 110 }],
    [{ symbol: 'TEST', transactionType: 'BUY', quantity: 1, amount: 100, currency: 'INR' }], true);
  assert.equal(client.status, 'unsupported-currency'); assert.equal(client.totalTradingPnl, null);
  const server = calculateActualPortfolio([{ symbol: 'TEST', quantity: 1, average_cost: 100 }], raw, { TEST: { price: 110 } });
  assert.equal(server.accountingStatus, 'unsupported-currency'); assert.equal(server.totalTradingPnl, null);
  assert.equal(deriveHoldingLedgerCostBasis(raw, [{ symbol: 'TEST', quantity: 1 }]).get('TEST').valid, false);
});

test('malformed ledger fees and infinite quantities cannot authorize server or holding return totals', () => {
  for (const patch of [{ brokerage: -1 }, { brokerage: Infinity }, { quantity: Infinity }]) {
    const raw = [{ symbol: 'TEST', transaction_type: 'BUY', quantity: 1, amount: 100, currency: 'USD', ...patch }];
    const server = calculateActualPortfolio([{ symbol: 'TEST', quantity: 1, average_cost: 100 }], raw, { TEST: { price: 110 } });
    assert.equal(server.accountingStatus, 'transaction-ledger-unavailable'); assert.equal(server.totalTradingPnl, null);
    assert.equal(deriveHoldingLedgerCostBasis(raw, [{ symbol: 'TEST', quantity: 1 }]).get('TEST').valid, false);
  }
});

test('forecast coverage excludes reversed bounds, blank values and booleans rather than counting them as misses', () => {
  const value = coverageInterval([{ actual_return: 2, p25: 1, p75: 3 }, { actual_return: 2, p25: 3, p75: 1 },
    { actual_return: true, p25: 0, p75: 2 }, { actual_return: ' ', p25: 0, p75: 2 }], 'p25', 'p75');
  assert.equal(value.count, 1); assert.equal(value.hits, 1); assert.equal(value.coveragePct, 100);
});

test('Wilson confidence intervals require integer counts and a positive finite confidence multiplier', () => {
  assert.equal(wilsonInterval(1.5, 3), null); assert.equal(wilsonInterval(1, 3.5), null);
  assert.equal(wilsonInterval(1, 3, NaN), null); assert.equal(wilsonInterval(1, 3, -1), null);
  const value = wilsonInterval(50, 100);
  assert.ok(value.lowerPct < 50 && value.upperPct > 50);
});
