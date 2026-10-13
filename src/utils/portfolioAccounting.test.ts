import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePortfolioTradingPerformance } from './portfolioAccounting';

describe('portfolio trading P&L accounting', () => {
  it('keeps realized gains in total trading P&L after a partial sale', () => {
    const result = calculatePortfolioTradingPerformance(
      [{ symbol: 'MSFT', quantity: 1, averageCost: 50, currentPrice: 60 }],
      [
        { symbol: 'MSFT', transactionType: 'BUY', quantity: 2, amount: 100, brokerage: 0, currency: 'USD' },
        { symbol: 'MSFT', transactionType: 'SELL', quantity: 1, amount: 60, brokerage: 0, currency: 'USD' },
      ],
      true,
    );

    assert.equal(result.status, 'complete');
    assert.equal(result.currentValue, 60);
    assert.equal(result.openCostBasis, 50);
    assert.equal(result.unrealizedPnl, 10);
    assert.equal(result.realizedPnl, 10);
    assert.equal(result.totalTradingPnl, 20);
    assert.equal(result.returnVsGrossPurchaseCostPct, 20);
  });

  it('does not treat a sale as lost profit when a position is fully closed', () => {
    const result = calculatePortfolioTradingPerformance(
      [],
      [
        { symbol: 'MSFT', transactionType: 'BUY', quantity: 2, amount: 100, currency: 'USD' },
        { symbol: 'MSFT', transactionType: 'SELL', quantity: 2, amount: 130, currency: 'USD' },
      ],
      true,
    );

    assert.equal(result.status, 'complete');
    assert.equal(result.currentValue, 0);
    assert.equal(result.unrealizedPnl, 0);
    assert.equal(result.realizedPnl, 30);
    assert.equal(result.totalTradingPnl, 30);
  });

  it('uses chronological weighted-average cost when earlier buys are supplied out of order', () => {
    const result = calculatePortfolioTradingPerformance(
      [{ symbol: 'NOW', quantity: 1, averageCost: 50, currentPrice: 70 }],
      [
        { symbol: 'NOW', transactionType: 'SELL', quantity: 1, amount: 55, currency: 'USD', tradeDate: '2026-03-01' },
        { symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 60, currency: 'USD', tradeDate: '2026-02-01' },
        { symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 40, currency: 'USD', tradeDate: '2026-01-01' },
      ],
      true,
    );

    assert.equal(result.status, 'complete');
    assert.equal(result.realizedPnl, 5);
    assert.equal(result.openCostBasis, 50);
    assert.equal(result.unrealizedPnl, 20);
    assert.equal(result.totalTradingPnl, 25);
  });

  it('withholds realized and total P&L if the trade ledger does not reconcile', () => {
    const result = calculatePortfolioTradingPerformance(
      [{ symbol: 'NOW', quantity: 1, averageCost: 50, currentPrice: 60 }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 2, amount: 100, currency: 'USD' }],
      true,
    );

    assert.equal(result.status, 'quantity-mismatch');
    assert.deepEqual(result.quantityMismatchSymbols, ['NOW']);
    assert.equal(result.unrealizedPnl, 10);
    assert.equal(result.realizedPnl, null);
    assert.equal(result.totalTradingPnl, null);
  });

  it('does not present aggregate P&L as current while quote coverage is incomplete', () => {
    const result = calculatePortfolioTradingPerformance(
      [{ symbol: 'NOW', quantity: 1, averageCost: 50, currentPrice: null }],
      [{ symbol: 'NOW', transactionType: 'BUY', quantity: 1, amount: 50, currency: 'USD' }],
      false,
    );

    assert.equal(result.status, 'quotes-incomplete');
    assert.equal(result.currentValue, null);
    assert.equal(result.unrealizedPnl, null);
    assert.equal(result.realizedPnl, 0);
    assert.equal(result.totalTradingPnl, null);
  });

  it('flags derived trade data while preserving the calculated figures for review', () => {
    const result = calculatePortfolioTradingPerformance(
      [{ symbol: 'NVDA', quantity: 1, averageCost: 50, currentPrice: 60 }],
      [{ symbol: 'NVDA', transactionType: 'BUY', quantity: 1, amount: 50, currency: 'USD', priceDerived: true }],
      true,
    );

    assert.equal(result.status, 'review-transactions');
    assert.equal(result.totalTradingPnl, 10);
    assert.equal(result.derivedTransactionCount, 1);
  });

  it('refuses to combine transactions from different currencies', () => {
    const result = calculatePortfolioTradingPerformance(
      [{ symbol: 'NVDA', quantity: 1, averageCost: 50, currentPrice: 60 }],
      [
        { symbol: 'NVDA', transactionType: 'BUY', quantity: 1, amount: 50, currency: 'USD' },
        { symbol: 'MSFT', transactionType: 'BUY', quantity: 1, amount: 50, currency: 'INR' },
      ],
      true,
    );

    assert.equal(result.status, 'mixed-currency');
    assert.equal(result.totalTradingPnl, null);
  });
});
