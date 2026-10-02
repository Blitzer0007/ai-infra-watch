import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPortfolioDailySeries,
  calculatePortfolioAttribution,
  calculatePortfolioConcentration,
  calculatePortfolioStressScore,
  comparePortfolioToBenchmarks,
} from './measurement';

const baseInputs = [
  { symbol: 'A', investedValue: 60, currentValue: 60, pnl: 0, pnlPct: 0, dailyChangePct: -2, group: 'AI' },
  { symbol: 'B', investedValue: 30, currentValue: 30, pnl: 0, pnlPct: 0, dailyChangePct: 1, group: 'AI' },
  { symbol: 'C', investedValue: 10, currentValue: 10, pnl: 0, pnlPct: 0, dailyChangePct: 3, group: 'Power' },
];

test('portfolio concentration uses current value and calculates top-three weight', () => {
  const result = calculatePortfolioConcentration(baseInputs);
  assert.equal(result.topHolding?.symbol, 'A');
  assert.equal(result.topHolding?.weight, 0.6);
  assert.equal(result.top3Weight, 1);
  assert.equal(result.groupWeights[0]?.group, 'AI');
  assert.equal(result.groupWeights[0]?.weight, 0.9);
  assert.ok(result.hhi != null);
  assert.equal(result.effectiveHoldings, 2.5);
});

test('portfolio stress is position-size weighted', () => {
  const result = calculatePortfolioStressScore(baseInputs);
  assert.equal(result.weightedBreadth, 0.4);
  assert.equal(Number(result.weightedAvgMove?.toFixed(2)), -0.8);
});

test('portfolio attribution preserves signed P&L contribution', () => {
  const rows = calculatePortfolioAttribution([
    { ...baseInputs[0], pnl: 20, pnlPct: 33.3 },
    { ...baseInputs[1], pnl: -5, pnlPct: -16.7 },
  ]);
  assert.equal(rows[0]?.symbol, 'A');
  assert.equal(rows[0]?.pnlContribution, 20);
  assert.equal(Number(rows[0]?.weight.toFixed(2)), 0.67);
  assert.equal(Number(rows[0]?.pnlContributionPct?.toFixed(2)), 133.33);
});

test('portfolio daily series uses common available history and keeps 30-day window', () => {
  const histories = {
    A: [
      { date: '2026-09-01', price: 100 },
      { date: '2026-09-02', price: 90 },
      { date: '2026-09-03', price: 99 },
    ],
    B: [
      { date: '2026-09-01', price: 100 },
      { date: '2026-09-02', price: 102 },
      { date: '2026-09-03', price: 105 },
    ],
  };
  const rows = buildPortfolioDailySeries(histories, { A: 0.5, B: 0.5 }, 30);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.date, '2026-09-02');
  assert.equal(Number(rows[0]?.returnPct.toFixed(2)), -4);
});

test('benchmark comparison uses overlapping dates and matched compounding', () => {
  const portfolio = [
    { date: '2026-09-01', price: 100 },
    { date: '2026-09-02', price: 105 },
    { date: '2026-09-03', price: 110 },
  ];
  const spy = [
    { date: '2026-09-01', price: 100 },
    { date: '2026-09-02', price: 102 },
    { date: '2026-09-03', price: 104 },
  ];
  const result = comparePortfolioToBenchmarks(portfolio, { SPY: spy });
  assert.equal(result[0]?.sampleDays, 2);
  assert.equal(Number(result[0]?.portfolioReturnPct?.toFixed(2)), 10);
  assert.equal(Number(result[0]?.benchmarkReturnPct?.toFixed(2)), 4);
  assert.equal(Number(result[0]?.relativeReturnPct?.toFixed(2)), 6);
});
