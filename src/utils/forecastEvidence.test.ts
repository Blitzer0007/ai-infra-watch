import assert from 'node:assert/strict';
import test from 'node:test';
import { createForecastEvidenceSnapshot } from './forecastEvidence';

test('captures evidence at forecast creation without future outcome fields', () => {
  const snapshot = createForecastEvidenceSnapshot({
    capturedAt: '2026-10-03T10:00:00.000Z',
    ticker: 'NVDA',
    currentPrice: 180,
    changePct: 1.2,
    quoteSource: 'live-market',
    momentum20Pct: 4.5,
    volatilityAnnualizedPct: 38,
    oneYearReturnPct: 72,
    historyThrough: '2026-10-03',
    analyst: {
      status: 'available',
      source: 'Finnhub analyst',
      retrievedAt: '2026-10-03T09:59:00.000Z',
      analystCount: 42,
      medianTarget: 195,
      webEvidenceCount: 3,
    },
    news: [{ title: 'Current event', source: 'Example News', publishedAt: '2026-10-03T08:00:00Z' }],
    contracts: [{ title: 'Contract event', company: 'NVDA' }],
  });

  assert.equal(snapshot.ticker, 'NVDA');
  assert.equal(snapshot.quote.price, 180);
  assert.equal(snapshot.analystConsensus.analystCount, 42);
  assert.equal(snapshot.counts.news, 1);
  assert.equal(snapshot.counts.contracts, 1);
  assert.equal((snapshot as any).actualReturn, undefined);
  assert.equal((snapshot as any).verifiedAt, undefined);
});

test('preserves missing and failed evidence instead of inventing values', () => {
  const snapshot = createForecastEvidenceSnapshot({
    capturedAt: '2026-10-03T10:00:00.000Z',
    ticker: 'RUM',
    analyst: { status: 'failed', error: 'Analyst endpoint unavailable' },
  });

  assert.equal(snapshot.analystConsensus.status, 'failed');
  assert.equal(snapshot.analystConsensus.error, 'Analyst endpoint unavailable');
  assert.equal(snapshot.analystConsensus.analystCount, null);
  assert.equal(snapshot.analystConsensus.medianTarget, null);
});

test('limits event evidence to a bounded creation-time snapshot', () => {
  const news = Array.from({ length: 12 }, (_, i) => ({ title: String(i), publishedAt: '2026-10-03' }));
  const snapshot = createForecastEvidenceSnapshot({
    capturedAt: '2026-10-03T10:00:00.000Z',
    ticker: 'MU',
    news,
  });

  assert.equal(snapshot.events.news.length, 8);
  assert.equal(snapshot.counts.news, 8);
});


test('treats a non-positive analyst target as unavailable in the snapshot', () => {
  const zero = createForecastEvidenceSnapshot({
    capturedAt: '2026-10-03T10:00:00.000Z',
    ticker: 'NVDA',
    analyst: { status: 'available', analystCount: 69, medianTarget: 0 },
  });
  const negative = createForecastEvidenceSnapshot({
    capturedAt: '2026-10-03T10:00:00.000Z',
    ticker: 'NVDA',
    analyst: { status: 'available', analystCount: 69, medianTarget: -10 },
  });
  const positive = createForecastEvidenceSnapshot({
    capturedAt: '2026-10-03T10:00:00.000Z',
    ticker: 'NVDA',
    analyst: { status: 'available', analystCount: 69, medianTarget: 250 },
  });
  assert.equal(zero.analystConsensus.medianTarget, null);
  assert.equal(negative.analystConsensus.medianTarget, null);
  assert.equal(positive.analystConsensus.medianTarget, 250);
});
