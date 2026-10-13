import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountCashFlowPerformance } from './portfolioCashFlowAccounting';

describe('account-level cash-flow accounting', () => {
  it('includes holdings, cash, dividends, fees and net external contributions', () => {
    const result = calculateAccountCashFlowPerformance(
      [{ symbol: 'MSFT', quantity: 2, currentPrice: 60 }],
      [{ symbol: 'MSFT', transactionType: 'BUY', quantity: 2, amount: 100, brokerage: 2, currency: 'USD' }],
      [{ flowType: 'deposit', amount: 150, currency: 'USD', fxToUsd: 1 }, { flowType: 'dividend', amount: 5, currency: 'USD', fxToUsd: 1 }, { flowType: 'fee', amount: 1, currency: 'USD', fxToUsd: 1 }],
      true,
    );
    assert.equal(result.status, 'complete');
    assert.equal(result.holdingsValueUsd, 120);
    assert.equal(result.cashBalanceUsd, 52);
    assert.equal(result.accountValueUsd, 172);
    assert.equal(result.netContributionsUsd, 150);
    assert.equal(result.totalPnlUsd, 22);
    assert.equal(result.dividendsUsd, 5);
    assert.equal(result.feesUsd, 1);
  });
  it('converts INR cash flows using the explicitly recorded historical USD rate', () => {
    const result = calculateAccountCashFlowPerformance(
      [{ symbol: 'NOW', quantity: 1, currentPrice: 100 }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 80, currency: 'USD' }],
      [{ flowType: 'deposit', amount: 10000, currency: 'INR', fxToUsd: 0.012 }, { flowType: 'withdrawal', amount: 1000, currency: 'INR', fxToUsd: 0.012 }],
      true,
    );
    assert.equal(result.status, 'complete');
    assert.equal(result.netContributionsUsd, 108);
    assert.equal(result.cashBalanceUsd, 28);
    assert.equal(result.accountValueUsd, 128);
    assert.equal(result.totalPnlUsd, 20);
  });
  it('withholds account performance if trades do not reconcile to holdings', () => {
    const result = calculateAccountCashFlowPerformance([{ symbol: 'NOW', quantity: 2, currentPrice: 100 }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 80, currency: 'USD' }],
      [{ flowType: 'deposit', amount: 100, currency: 'USD', fxToUsd: 1 }], true);
    assert.equal(result.status, 'quantity-mismatch');
    assert.deepEqual(result.quantityMismatchSymbols, ['NOW']);
    assert.equal(result.totalPnlUsd, null);
  });
  it('withholds totals for stale quotes and non-USD legacy trades', () => {
    const quote = calculateAccountCashFlowPerformance([{ symbol: 'NOW', quantity: 1, currentPrice: null }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 80, currency: 'USD' }],
      [{ flowType: 'deposit', amount: 100, currency: 'USD', fxToUsd: 1 }], false);
    assert.equal(quote.status, 'quotes-incomplete');
    assert.equal(quote.totalPnlUsd, null);
    const mixed = calculateAccountCashFlowPerformance([{ symbol: 'NOW', quantity: 1, currentPrice: 100 }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 80, currency: 'INR' }],
      [{ flowType: 'deposit', amount: 100, currency: 'USD', fxToUsd: 1 }], true);
    assert.equal(mixed.status, 'mixed-trade-currency');
    assert.equal(mixed.totalPnlUsd, null);
  });
  it('does not estimate return until an opening deposit is recorded', () => {
    const result = calculateAccountCashFlowPerformance([{ symbol: 'NOW', quantity: 1, currentPrice: 100 }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 80, currency: 'USD' }],
      [{ flowType: 'dividend', amount: 2, currency: 'USD', fxToUsd: 1 }], true);
    assert.equal(result.status, 'external-flows-missing');
    assert.equal(result.totalPnlUsd, null);
  });
});
