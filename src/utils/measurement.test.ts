import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPortfolioDailySeriesFromTransactions, buildPortfolioPerformanceIndexFromTransactions, calculateStressScore, median, sampleQuality, summarizeSample, summarizeCalibration, summarizeValidationMatrix } from './measurement';

describe('stress score', () => {
  it('returns zero stress for neutral inputs', () => {
    const result = calculateStressScore({ dailyChanges: [0, 0, 0, 0], highMacroCount: 0, mediumMacroCount: 0 });
    assert.equal(result.score, 0);
    assert.equal(result.breadth, 1);
    assert.equal(result.avgMove, 0);
  });

  it('caps macro load and total score at their documented limits', () => {
    const result = calculateStressScore({ dailyChanges: [-10, -10], highMacroCount: 10, mediumMacroCount: 10 });
    assert.equal(result.macroLoad, 30);
    assert.equal(result.score, 100);
    assert.equal(result.label, 'Elevated');
  });

  it('ignores non-finite quote changes', () => {
    const result = calculateStressScore({ dailyChanges: [2, Number.NaN, -2, Infinity], highMacroCount: 0, mediumMacroCount: 0 });
    assert.equal(result.freshCount, 2);
    assert.equal(result.breadth, 0.5);
    assert.equal(result.avgMove, 0);
  });
});

describe('sample statistics', () => {
  it('calculates an even-count median', () => {
    assert.equal(median([1, 4, 2, 8]), 3);
  });

  it('flags small samples as limited', () => {
    assert.equal(sampleQuality(4), 'limited');
    assert.equal(sampleQuality(7), 'moderate');
    assert.equal(sampleQuality(12), 'good');
  });

  it('returns mean, median and n together', () => {
    assert.deepEqual(summarizeSample([1, 2, 3, 10]), {
      n: 4,
      mean: 4,
      median: 2.5,
      quality: 'limited',
    });
  });
});

describe('calibration summary', () => {
  it('keeps confidence bands separate from measured outcomes', () => {
    const result = summarizeCalibration([
      { confidence: 0.1, positive: false, excessReturnPct: -2 },
      { confidence: 0.1, positive: true, excessReturnPct: 4 },
      { confidence: 0.7, positive: true, excessReturnPct: 3 },
      { confidence: 0.7, positive: true, excessReturnPct: 5 },
    ]);
    assert.equal(result[0].n, 2);
    assert.equal(result[0].observedPositiveRate, 0.5);
    assert.equal(result[0].meanExcessReturnPct, 1);
    assert.equal(result[3].n, 2);
    assert.equal(result[3].observedPositiveRate, 1);
    assert.equal(result[3].meanExcessReturnPct, 4);
  });

  it('uses stable bucket boundaries and ignores invalid confidence values', () => {
    const result = summarizeCalibration([
      { confidence: 0.2, positive: true, excessReturnPct: 2 },
      { confidence: 0.4, positive: false, excessReturnPct: -1 },
      { confidence: 0.8, positive: true, excessReturnPct: 3 },
      { confidence: -0.1, positive: true, excessReturnPct: 9 },
      { confidence: Number.NaN, positive: true, excessReturnPct: 9 },
    ]);
    assert.equal(result[0].n, 0);
    assert.equal(result[1].n, 1);
    assert.equal(result[1].observedPositiveRate, 1);
    assert.equal(result[2].n, 1);
    assert.equal(result[2].observedPositiveRate, 0);
    assert.equal(result[4].n, 1);
    assert.equal(result[4].observedPositiveRate, 1);
  });
});

describe('validation matrix summary', () => {
  it('aggregates valid ticker/horizon runs and preserves measured rows', () => {
    const result = summarizeValidationMatrix([
      {
        ticker: 'AAA',
        horizon: 5,
        summary: {
          rows: [
            { positiveProbability: 0.7, actual: 2, median: 1 },
            { positiveProbability: 0.3, actual: -1, median: 0 },
          ],
          directionalAccuracy: 0.5,
          medianAbsoluteError: 1.5,
          p25p75Coverage: 0.5,
          p10p90Coverage: 1,
          baselineDirectionalAccuracy: 0.4,
          baselineMedianAbsoluteError: 2,
        },
      },
      {
        ticker: 'BBB',
        horizon: 20,
        summary: {
          rows: [],
          directionalAccuracy: 0,
          medianAbsoluteError: 0,
          p25p75Coverage: 0,
          p10p90Coverage: 0,
          baselineDirectionalAccuracy: 0,
          baselineMedianAbsoluteError: 0,
        },
      },
    ]);
    assert.equal(result.tests, 2);
    assert.equal(result.details.length, 1);
    assert.equal(result.details[0].ticker, 'AAA');
    assert.equal(result.direction, 0.5);
    assert.equal(result.baselineError, 2);
    assert.equal(result.calibration[1].n, 1);
    assert.equal(result.calibration[3].n, 1);
    assert.equal(result.calibration[4].n, 0);
  });
});


describe('transaction-aware portfolio history', () => {
  const histories = {
    DGXX: [
      { date: '2026-05-01', price: 10 },
      { date: '2026-05-02', price: 12 },
      { date: '2026-05-05', price: 15 },
    ],
    NVDA: [
      { date: '2026-05-01', price: 100 },
      { date: '2026-05-02', price: 105 },
      { date: '2026-05-05', price: 110 },
    ],
  };
  const transactions = [
    { symbol: 'DGXX', transactionType: 'BUY' as const, tradeDate: '2026-05-02', quantity: 10, sourceRow: 1 },
    { symbol: 'NVDA', transactionType: 'BUY' as const, tradeDate: '2026-05-05', quantity: 1, sourceRow: 2 },
  ];

  it('excludes dates before a holding was actually purchased', () => {
    const rows = buildPortfolioDailySeriesFromTransactions(histories, transactions, 30);
    assert.deepEqual(rows.map(row => row.date), ['2026-05-05']);
    assert.equal(Number(rows[0].returnPct.toFixed(2)), 25);
  });

  it('builds a market-performance index without counting later cash additions as returns', () => {
    const rows = buildPortfolioPerformanceIndexFromTransactions(histories, transactions);
    assert.equal(rows[0].date, '2026-05-05');
    assert.equal(Number(rows[0].normalizedValue.toFixed(2)), 125);
  });
});
