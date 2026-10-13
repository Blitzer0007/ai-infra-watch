import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveHoldingLedgerCostBasis, getHoldingReturnThresholdTransitions, getHoldingReturnGivebackTransition, getHoldingReviewTransition } from '../../server/api/portfolio-holding-return-alerts.js';

describe('per-holding ledger cost basis', () => {
  it('keeps open cost basis and realized gains consistent after a partial sale', () => {
    const ledger = deriveHoldingLedgerCostBasis([
      { symbol: 'MSFT', transaction_type: 'BUY', trade_date: '2026-01-01', source_row: 1, quantity: 2, amount: 100, brokerage: 1, currency: 'USD' },
      { symbol: 'MSFT', transaction_type: 'SELL', trade_date: '2026-02-01', source_row: 2, quantity: 1, amount: 60, brokerage: 1, currency: 'USD' },
    ], [{ symbol: 'MSFT', quantity: 1 }]);

    const row = ledger.get('MSFT');
    assert.equal(row.valid, true);
    assert.equal(row.quantity, 1);
    assert.equal(row.openCostBasis, 50.5);
    assert.equal(row.averageCost, 50.5);
    assert.equal(row.realizedPnl, 8.5);
  });

  it('does not mark a position valid if the ledger quantities differ from holdings', () => {
    const ledger = deriveHoldingLedgerCostBasis([
      { symbol: 'NOW', transaction_type: 'BUY', trade_date: '2026-01-01', source_row: 1, quantity: 2, amount: 100, currency: 'USD' },
    ], [{ symbol: 'NOW', quantity: 1 }]);
    assert.equal(ledger.get('NOW').valid, false);
    assert.equal(ledger.get('NOW').quantityMismatch, true);
  });

  it('does not mark a position valid when a sale precedes enough buys', () => {
    const ledger = deriveHoldingLedgerCostBasis([
      { symbol: 'NOW', transaction_type: 'SELL', trade_date: '2026-01-01', source_row: 1, quantity: 1, amount: 60, currency: 'USD' },
      { symbol: 'NOW', transaction_type: 'BUY', trade_date: '2026-02-01', source_row: 2, quantity: 1, amount: 50, currency: 'USD' },
    ], [{ symbol: 'NOW', quantity: 0 }]);
    assert.equal(ledger.get('NOW').valid, false);
    assert.equal(ledger.get('NOW').invalidSequence, true);
  });
});

describe('per-holding return milestone transitions', () => {
  it('triggers one-time +25% and +30% milestones when crossed', () => {
    assert.deepEqual(getHoldingReturnThresholdTransitions('MSFT', 27, new Map()), {
      trigger: [25],
      reset: [],
    });
    assert.deepEqual(getHoldingReturnThresholdTransitions('NOW', 31, new Map()), {
      trigger: [25, 30],
      reset: [],
    });
  });

  it('does not repeat an alert while the same threshold remains active', () => {
    const states = new Map([
      ['holding-return:MSFT:25', { active: true }],
    ]);
    assert.deepEqual(getHoldingReturnThresholdTransitions('msft', 28, states), {
      trigger: [],
      reset: [],
    });
  });

  it('resets a threshold after the return falls below it, permitting a later recross', () => {
    const states = new Map([
      ['holding-return:NOW:25', { active: true }],
      ['holding-return:NOW:30', { active: true }],
    ]);
    assert.deepEqual(getHoldingReturnThresholdTransitions('NOW', 27, states), {
      trigger: [],
      reset: [30],
    });
    assert.deepEqual(getHoldingReturnThresholdTransitions('NOW', 24, states), {
      trigger: [],
      reset: [25, 30],
    });
  });

  it('ignores missing or invalid return values', () => {
    assert.deepEqual(getHoldingReturnThresholdTransitions('MSFT', null, new Map()), {
      trigger: [],
      reset: [],
    });
    assert.deepEqual(getHoldingReturnThresholdTransitions('', 30, new Map()), {
      trigger: [],
      reset: [],
    });
  });
});


describe('profit give-back transitions', () => {
  it('flags a 10 percentage-point give-back after a 30% peak', () => {
    assert.deepEqual(getHoldingReturnGivebackTransition(22, 33, false), { peakPct: 33, trigger: true, reset: false, givebackPct: 11 });
  });
  it('re-arms only after the return recovers to within five points of the peak', () => {
    assert.deepEqual(getHoldingReturnGivebackTransition(29, 33, true), { peakPct: 33, trigger: false, reset: true, givebackPct: 4 });
    assert.deepEqual(getHoldingReturnGivebackTransition(22, 33, true), { peakPct: 33, trigger: false, reset: false, givebackPct: 11 });
  });
  it('does not give-back alert until the peak reached at least 30%', () => {
    assert.equal(getHoldingReturnGivebackTransition(15, 24, false).trigger, false);
  });
});
describe('profitable thesis review transitions', () => {
  it('triggers on ACT/WATCH evidence for a profitable position and deduplicates unchanged rules', () => {
    const items = [{ symbol: 'MSFT', severity: 'ACT', title: 'Rule reached', detail: 'Stop reached.' }];
    const first = getHoldingReviewTransition('MSFT', 25, items, [], null);
    assert.equal(first.trigger, true);
    assert.equal(getHoldingReviewTransition('MSFT', 26, items, [], { active: true, metadata: { signature: first.signature } }).trigger, false);
  });
  it('resets when a profitable holding no longer has review signals', () => {
    const result = getHoldingReviewTransition('NOW', 25, [], [], { active: true });
    assert.equal(result.reset, true);
    assert.equal(result.trigger, false);
  });
  it('includes upcoming earnings as a review trigger', () => {
    const result = getHoldingReviewTransition('NOW', 20, [], [{ symbol: 'NOW', date: '2026-10-20', daysUntil: 3 }], null);
    assert.equal(result.trigger, true);
    assert.match(result.signature, /EARNINGS:2026-10-20/);
  });
});
