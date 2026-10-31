import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyProviderError,
} from '../../api/_market-data.js';
import {
  summarizeMarketQuote,
  summarizeMarketHistory,
  summarizeMarketDataHealth,
} from './market-data-health.js';

test('provider errors are reduced to safe diagnostic classes', () => {
  assert.equal(classifyProviderError(new Error('HTTP 429')), 'rate_limited');
  assert.equal(classifyProviderError(new Error('HTTP 502')), 'provider_server_error');
  assert.equal(classifyProviderError(new Error('FINNHUB_API_KEY not configured')), 'not_configured');
  assert.equal(classifyProviderError(new Error('No Yahoo history points')), 'no_data');
  assert.equal(classifyProviderError(new Error('socket timeout')), 'timeout');
});

test('quote diagnostics distinguish primary, fallback, stale and cache state without price data', () => {
  const result = summarizeMarketQuote({
    price: 100, provider: 'finnhub', providerStatus: 'FALLBACK', fallbackUsed: true,
    asOf: '2026-10-31T12:00:00.000Z', providerAttempts: [
      { provider: 'yahoo', status: 'failed', errorCode: 'rate_limited' },
      { provider: 'finnhub', status: 'ok' },
    ],
  }, Date.parse('2026-10-31T12:01:00.000Z'));
  assert.equal(result.provider, 'finnhub');
  assert.equal(result.providerStatus, 'FALLBACK');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.ageSeconds, 60);
  assert.equal(result.providerAttempts[0].errorCode, 'rate_limited');
  assert.equal(Object.hasOwn(result, 'price'), false);
});

test('history diagnostics report raw versus adjusted coverage explicitly', () => {
  const result = summarizeMarketHistory({
    provider: 'alpha-vantage',
    points: [
      { date: '2026-10-29', price: 100, adjustedPrice: null, adjusted: false },
      { date: '2026-10-30', price: 101, adjustedPrice: null, adjusted: false },
    ],
    providerAttempts: [{ provider: 'yahoo', status: 'failed', errorCode: 'rate_limited' }, { provider: 'alpha-vantage', status: 'ok' }],
  }, Date.parse('2026-10-31T12:00:00.000Z'));
  assert.equal(result.adjustedCoveragePct, 0);
  assert.equal(result.adjustedCloseAvailable, false);
  assert.equal(result.pointCount, 2);
  assert.equal(result.lastDate, '2026-10-30');
  assert.equal(result.providerAttempts[0].provider, 'yahoo');
});

test('market diagnostics keep split/dividend-adjusted full coverage visible', () => {
  const result = summarizeMarketDataHealth('NVDA', {
    price: 100, provider: 'yahoo', providerStatus: 'PRIMARY', asOf: '2026-10-31T12:00:00.000Z',
  }, {
    provider: 'yahoo',
    points: [
      { date: '2026-10-29', price: 110, adjustedPrice: 105, adjusted: true },
      { date: '2026-10-30', price: 111, adjustedPrice: 106, adjusted: true },
    ],
  }, Date.parse('2026-10-31T12:01:00.000Z'));
  assert.equal(result.symbol, 'NVDA');
  assert.equal(result.quote.providerStatus, 'PRIMARY');
  assert.equal(result.history.adjustedCoveragePct, 100);
  assert.equal(result.history.adjustedCloseAvailable, true);
});
