import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { buildPositionAnalyses, calculatePositionScenario, mapStoredPortfolioHoldings, withCurrentPortfolioWeights, type PortfolioPosition } from './portfolioPositions';
import { calculatePortfolioAttribution, calculatePortfolioConcentration, calculatePortfolioStressScore } from './measurement';
import { buildIntelligence, type PricePoint } from './intelligence';
import { admitBrowserAlertQuote } from './quoteAlertEvaluation';
import { evaluateDeclaredQuote } from './quoteAdmission';
import { adaptDecisionCard, summarizeDecisionCards } from './decisionCardAdapter';
import { normalizeDecisionQuote } from './decisionEligibility';

const NOW = Date.parse('2026-11-13T18:00:00Z');
const holding: PortfolioPosition = { symbol: 'FICT', name: 'Fictional issuer', quantity: 2, averageCost: 50, investedValue: 100, snapshotCurrentValue: null, currency: 'USD', group: 'Fictional', theme: 'Test', peers: [], geo: 'US' };
const declared = (symbol = 'FICT', edits: Record<string, unknown> = {}): PricePoint => ({ price: 100, changePct: 0, returnedSymbol: symbol, sourceMode: 'live', currency: 'USD', adjustedBasis: 'raw', marketTimePrecision: 'instant', provider: 'declared-source', marketTime: '2026-11-13T17:59:00Z', retrievedAt: '2026-11-13T18:00:00Z', isMarketSessionOpen: true, ...edits } as PricePoint);
const analyze = (q: PricePoint | undefined = declared(), h = holding) => buildPositionAnalyses(q ? { [h.symbol]: q } : {}, buildIntelligence({}), [h], NOW)[0];

test('hand-calculated loaded holding value, profit and return use admitted quote units', () => {
  const row = analyze(); assert.equal(row.currentValue, 200); assert.equal(row.pnl, 100); assert.equal(row.pnlPct, 100);
  const flat = analyze(declared('FICT', { price: 50 })); assert.equal(flat.pnl, 0); assert.equal(flat.pnlPct, 0);
  const loss = analyze(declared('FICT', { price: 25 })); assert.equal(loss.pnl, -50); assert.equal(loss.pnlPct, -50);
});
test('missing quote does not fabricate a flat P&L or a cost-valued portfolio', () => {
  const row = buildPositionAnalyses({}, buildIntelligence({}), [holding], NOW)[0];
  assert.equal(row.livePrice, null); assert.equal(row.currentValue, null); assert.equal(row.pnl, null); assert.equal(row.pnlPct, null);
  assert.equal(row.whatIfProfitAt10Pct, null); assert.equal(row.averageInAlert, false); assert.equal(row.recoveryAlert, false);
  assert.equal(withCurrentPortfolioWeights([row])[0].portfolioWeight, null);
});
for (const [label, edits] of Object.entries({
  stale: { stale: true }, simulated: { simulated: true }, 'simulated mode': { sourceMode: 'simulated' },
  'wrong identity': { returnedSymbol: 'OTHER' }, 'missing identity': { returnedSymbol: null },
  'unknown source': { sourceMode: 'unknown' }, 'wrong currency': { currency: 'EUR' },
  'wrong basis': { adjustedBasis: 'total_return' }, 'missing session': { isMarketSessionOpen: null },
  'ambiguous time': { marketTimePrecision: 'date-only' }, 'bad date': { marketTime: '2026-02-30T17:59:00Z' },
  'old market time': { marketTime: '2026-11-13T14:00:00Z' }, 'old retrieval': { retrievedAt: '2026-11-13T14:00:00Z' },
  'future time': { marketTime: '2026-11-14T18:00:00Z' }, 'malformed stale marker': { stale: 'false' },
  'non-finite price': { price: Infinity }, 'coerced price': { price: '100' },
  conflicting: { status: 'conflicting' }, 'malformed independent declaration': { independentObservations: [{}] },
})) test(label + ' withholds value, P&L, weights and review flags', () => {
  const row = analyze(declared('FICT', edits));
  assert.equal(row.currentValue, null); assert.equal(row.pnl, null); assert.equal(row.pnlPct, null);
  assert.equal(row.dailyChangePct, null); assert.equal(row.state, 'INSUFFICIENT DATA');
  assert.equal(withCurrentPortfolioWeights([row])[0].portfolioWeight, null); assert.ok(row.valuationIssues.length);
});
test('supported last close is a valuation reference but cannot activate browser quote alerts', () => {
  const close = declared('FICT', { marketTime: '2026-11-12T21:00:00Z', retrievedAt: '2026-11-13T18:00:00Z', status: 'last_close', isMarketSessionOpen: false });
  const row = analyze(close); assert.equal(row.currentValue, 200); assert.equal(row.valuationStatus, 'last_close');
  assert.equal(admitBrowserAlertQuote('FICT', close, NOW).eligible, false);
});
test('review valuation retains its existing two-hour age policy, separate from automatic alerts', () => {
  const delayed = declared('FICT', { marketTime: '2026-11-13T17:00:00Z' });
  assert.equal(evaluateDeclaredQuote('FICT', delayed, NOW).eligible, true);
  assert.equal(admitBrowserAlertQuote('FICT', delayed, NOW).eligible, false);
});
test('missing daily move does not erase a supported price or manufacture a flat daily return', () => {
  const row = analyze(declared('FICT', { changePct: NaN }));
  assert.equal(row.currentValue, 200); assert.equal(row.dailyChangePct, null); assert.equal(row.pnl, 100);
});
test('source mapper does not manufacture a snapshot current value from invested cost', () => {
  const mapped = mapStoredPortfolioHoldings([{ id: 'fictional', symbol: 'FICT', quantity: 2, averageCost: 50, currency: 'USD' } as any])[0];
  assert.equal(mapped.investedValue, 100); assert.equal(mapped.snapshotCurrentValue, null);
  assert.equal(mapStoredPortfolioHoldings([{ id: 'bad', symbol: 'FICT', quantity: 2, averageCost: NaN } as any])[0].investedValue, null);
});
for (const h of [{ ...holding, investedValue: null }, { ...holding, investedValue: 1 }, { ...holding, averageCost: NaN }, { ...holding, quantity: -1 }, { ...holding, quantity: NaN }]) test('unsupported loaded quantity/cost never yields a synthetic P&L: ' + JSON.stringify(h), () => {
  const row = analyze(declared(), h); assert.equal(row.investedValue, null); assert.equal(row.pnl, null); assert.equal(row.pnlPct, null); assert.equal(row.whatIfProfitAt20Pct, null);
});
test('zero cost supports dollar difference but never an invented 0% return', () => {
  const h = { ...holding, averageCost: 0, investedValue: 0 };
  const row = analyze(declared(), h); assert.equal(row.pnl, 200); assert.equal(row.pnlPct, null);
  assert.deepEqual(calculatePositionScenario(h, 100), { saleValue: 200, pnl: 200, returnPct: null });
});
test('complete weights reflect current values rather than equal invested costs', () => {
  const rows = withCurrentPortfolioWeights([analyze(declared(), { ...holding, quantity: 1, averageCost: 50, investedValue: 50 }), analyze(declared('OTHER', { price: 200 }), { ...holding, symbol: 'OTHER', quantity: 1, averageCost: 50, investedValue: 50 })]);
  assert.equal(rows[0].portfolioWeight, 1 / 3); assert.equal(rows[1].portfolioWeight, 2 / 3);
  assert.equal(calculatePortfolioConcentration(rows).totalValue, 300);
});
test('partial portfolio does not normalize the visible subset or replace missing values with cost', () => {
  const visible = analyze(), missing = { ...analyze(), symbol: 'OTHER', currentValue: null, pnl: null, pnlPct: null, investedValue: 1_000_000 };
  const rows = withCurrentPortfolioWeights([visible, missing]);
  assert.ok(rows.every(row => row.portfolioWeight === null && row.minorPosition === null));
  const concentration = calculatePortfolioConcentration(rows);
  assert.equal(concentration.coverage, 'partial'); assert.equal(concentration.observedCount, 1);
  assert.equal(concentration.totalValue, null); assert.equal(concentration.top3Weight, null); assert.equal(concentration.hhi, null); assert.deepEqual(concentration.weights, []);
  const attribution = calculatePortfolioAttribution(rows);
  assert.equal(attribution.length, 2); assert.equal(attribution[0].pnlContribution, 100); assert.equal(attribution[1].pnlContribution, null);
  assert.ok(attribution.every(row => row.weight === null && row.pnlContributionPct === null));
  assert.equal(calculatePortfolioStressScore(rows).score, null);
});
test('empty, known-zero and zero-P&L denominators remain distinct', () => {
  assert.equal(calculatePortfolioConcentration([]).totalValue, null);
  const row = { ...analyze(), currentValue: 0, pnl: 0, pnlPct: null };
  const concentration = calculatePortfolioConcentration([row]); assert.equal(concentration.totalValue, 0); assert.equal(concentration.top3Weight, null);
  const attribution = calculatePortfolioAttribution([row]); assert.equal(attribution[0].pnlContribution, 0); assert.equal(attribution[0].pnlContributionPct, null);
});
test('overflow and duplicate identities withhold aggregate weights and avoid non-finite outputs', () => {
  const huge = analyze(declared('FICT', { price: Number.MAX_VALUE }), { ...holding, quantity: Number.MAX_VALUE });
  assert.equal(huge.currentValue, null); assert.equal(huge.pnl, null);
  const a = { ...analyze(), currentValue: 1e308, pnl: 1e308 }, b = { ...a, symbol: 'OTHER' };
  assert.equal(calculatePortfolioConcentration([a, b]).totalValue, null);
  assert.ok(calculatePortfolioAttribution([a, b]).every(row => row.pnlContributionPct === null));
  assert.deepEqual(calculatePortfolioConcentration([a, a]).weights, []);
});
test('hypothetical scenario arithmetic preserves unavailable cost and finite denominators', () => {
  assert.deepEqual(calculatePositionScenario(holding, 75), { saleValue: 150, pnl: 50, returnPct: 50 });
  assert.deepEqual(calculatePositionScenario({ ...holding, investedValue: null }, 75), { saleValue: 150, pnl: null, returnPct: null });
  assert.deepEqual(calculatePositionScenario(holding, Infinity), { saleValue: null, pnl: null, returnPct: null });
});
test('unbound quote identity cannot restore a Command Center value after position admission failed', () => {
  const raw = declared('OTHER'); const row = analyze(raw);
  const card = adaptDecisionCard(row, normalizeDecisionQuote('FICT', raw), true, NOW, true);
  assert.equal(card.priceUsd, null); assert.equal(card.positionReturnPct, null);
  assert.equal(summarizeDecisionCards([card]).portfolioValueUsd, null);
});
test('a normalized quantity default cannot restore a Command Center valuation or eligibility', () => {
  const raw = declared(); const row = analyze(raw, { ...holding, quantitySupported: false });
  const card = adaptDecisionCard(row, normalizeDecisionQuote('FICT', raw), true, NOW, true);
  assert.equal(card.priceUsd, null); assert.equal(card.dataQuality.eligibleForDecision, false);
  assert.equal(summarizeDecisionCards([card]).portfolioValueUsd, null);
});
test('explicit-clock valuation is immutable and browser-safe with no persistence/transport', () => {
  const input = declared(), before = structuredClone(input), h = structuredClone(holding);
  const original = Date.now;
  try { Date.now = () => { throw Error('ambient clock forbidden'); }; analyze(input, h); }
  finally { Date.now = original; }
  assert.deepEqual(input, before); assert.deepEqual(h, holding);
  const bundle = buildSync({ entryPoints: ['src/utils/portfolioPositions.ts'], bundle: true, platform: 'browser', write: false }).outputFiles[0].text;
  assert.doesNotMatch(bundle, /\bfetch\(|process\.env|localStorage|supabase|apiAuth|setInterval/);
});
