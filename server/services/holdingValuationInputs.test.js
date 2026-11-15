import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../../api/portfolio.js';
import { buildPositionAnalyses, mapStoredPortfolioHoldings } from '../../src/utils/portfolioPositions.ts';
import { buildIntelligence } from '../../src/utils/intelligence.ts';

const now = Date.parse('2026-11-13T18:00:00Z');
const raw = { id: 'fictional', symbol: 'FICT', quantity: 2, average_cost: 50, currency: 'USD' };
const quote = { price: 100, changePct: 0, returnedSymbol: 'FICT', provider: 'declared-source', sourceMode: 'live', currency: 'USD', adjustedBasis: 'raw', marketTimePrecision: 'instant', marketTime: '2026-11-13T17:59:00Z', retrievedAt: '2026-11-13T18:00:00Z', isMarketSessionOpen: true };
const evaluate = dto => buildPositionAnalyses({ FICT: quote }, buildIntelligence({}), mapStoredPortfolioHoldings([dto]), now)[0];

test('actual API serializer carries original holding inputs into supported client valuation', () => {
  const dto = normalize(raw);
  assert.deepEqual(dto.valuationInputs, { contractVersion: 'stored-holding-valuation-v1', symbol: 'FICT', quantity: 2, averageCost: 50, currency: 'USD' });
  const result = evaluate(dto); assert.equal(result.currentValue, 200); assert.equal(result.pnl, 100);
});
for (const average_cost of [null, '', true, 'invalid']) test('raw missing/coerced average cost cannot become zero-cost profit: ' + String(average_cost), () => {
  const dto = normalize({ ...raw, average_cost }); assert.equal(dto.valuationInputs.averageCost, null);
  const result = evaluate(dto); assert.equal(result.currentValue, 200); assert.equal(result.investedValue, null); assert.equal(result.pnl, null); assert.equal(result.pnlPct, null);
});
for (const quantity of [null, '', true, 'invalid']) test('raw missing/coerced quantity cannot become a known zero-value holding: ' + String(quantity), () => {
  const dto = normalize({ ...raw, quantity }); assert.equal(dto.valuationInputs.quantity, null);
  assert.equal(evaluate(dto).currentValue, null); assert.equal(evaluate(dto).pnl, null);
});
for (const currency of [null, '', 'EUR']) test('original cost currency must support USD arithmetic: ' + String(currency), () => {
  const result = evaluate(normalize({ ...raw, currency })); assert.equal(result.currentValue, 200); assert.equal(result.pnl, null);
});
test('observed zero cost stays distinct from an API default for null cost', () => {
  const result = evaluate(normalize({ ...raw, average_cost: 0 }));
  assert.equal(result.investedValue, 0); assert.equal(result.pnl, 200); assert.equal(result.pnlPct, null);
});
test('unbound/malformed source receipt does not grant quantity or cost coverage', () => {
  for (const receipt of [null, {}, { contractVersion: 'stored-holding-valuation-v1', symbol: 'OTHER', quantity: 2, averageCost: 50, currency: 'USD' }]) {
    assert.equal(evaluate({ ...normalize(raw), valuationInputs: receipt }).currentValue, null);
  }
});
