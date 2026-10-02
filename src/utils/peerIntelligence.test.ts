import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePeerCounterfactual, selectMostRelevantPeer } from './peerIntelligence';

const holding = {
  symbol: 'DGXX',
  name: 'Digi Power X',
  group: 'AI Infrastructure',
  theme: 'GPU hosting / power',
  peers: ['IREN', 'CIFR'],
  geo: 'Power + grid',
};

test('selects a configured peer transparently and exposes reasons', () => {
  const peer = selectMostRelevantPeer(holding, {
    IREN: { price: 50, changePct: 1, stale: false },
    CIFR: { price: 20, changePct: 0, stale: false },
  });
  assert.ok(peer);
  assert.equal(peer?.symbol, 'IREN');
  assert.ok(peer?.reasons.includes('Configured direct peer'));
  assert.ok(peer?.reasons.includes('Same group'));
});

test('calculates same-investment peer counterfactual and actual difference', () => {
  const result = calculatePeerCounterfactual({
    holding: {
      symbol: 'DGXX',
      quantity: 10,
      investedValue: 100,
      averageCost: 10,
      purchaseDate: '2026-09-01',
    },
    peer: {
      symbol: 'IREN',
      name: 'IREN',
      score: 100,
      reasons: ['Configured direct peer'],
      configuredRank: 1,
      sameGroup: true,
      sameTheme: true,
      freshQuote: true,
    },
    peerHistory: [
      { date: '2026-08-31', price: 20 },
      { date: '2026-09-01', price: 25 },
      { date: '2026-09-02', price: 30 },
    ],
    peerCurrentPrice: 30,
    actualCurrentPrice: 12,
  });
  assert.equal(result.status, 'available');
  assert.equal(result.peerEntryDate, '2026-09-01');
  assert.equal(result.hypotheticalShares, 4);
  assert.equal(result.hypotheticalProfit, 20);
  assert.equal(result.actualProfit, 20);
  assert.equal(result.difference, 0);
  assert.equal(result.differencePctPoints, 0);
});

test('returns an explicit unavailable state when purchase date is missing', () => {
  const result = calculatePeerCounterfactual({
    holding: {
      symbol: 'DGXX',
      quantity: 10,
      investedValue: 100,
      averageCost: 10,
      purchaseDate: null,
    },
    peer: null,
    peerHistory: [],
    peerCurrentPrice: null,
    actualCurrentPrice: null,
  });
  assert.equal(result.status, 'peer-unavailable');
});
