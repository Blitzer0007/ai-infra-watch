import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildJevPaperAllocator } from './jevPaperAllocator';

describe('JEV paper allocator evidence and risk gates', () => {
  const candidates = [
    { symbol: 'MSFT', sector: 'software', peerCount: 3, peerComparabilityScore: 80 },
    { symbol: 'NOW', sector: 'software', peerCount: 2, peerComparabilityScore: 65 },
    { symbol: 'META', sector: 'internet', peerCount: 4, peerComparabilityScore: 70 },
    { symbol: 'NVDA', sector: 'semiconductors', peerCount: 5, peerComparabilityScore: 75 },
  ];

  it('blocks allocations when evidence is incomplete, stale, conflicted, or gated', () => {
    for (const override of [
      { evidenceComplete: false },
      { evidenceFresh: false },
      { conflictCount: 1 },
      { gateAction: 'gather_more' },
      { gateAction: 'continue' },
      { gateAction: 'insufficient' },
      { gateAction: 'resolve_conflict' },
      { gateAction: '' },
      { thesisBreaches: ['MSFT'] },
    ]) {
      const result = buildJevPaperAllocator({
        candidates, capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
        ...override,
      });
      assert.equal(result.allocationAllowed, false);
      assert.equal(result.suggestedWeights.length, 0);
      assert.equal(result.balanceScore, null);
    }
  });

  it('accepts the backend stop decision only when all other evidence checks pass', () => {
    const result = buildJevPaperAllocator({
      candidates, capital: 10000, evidenceComplete: true, evidenceFresh: true,
      conflictCount: 0, gateAction: 'stop',
    });
    assert.equal(result.allocationAllowed, true);
    assert.equal(result.suggestedWeights.length, candidates.length);
  });

  it('keeps allocations within position, sector, and cash limits', () => {
    const result = buildJevPaperAllocator({
      candidates, capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    assert.equal(result.allocationAllowed, true);
    assert.ok(result.suggestedWeights.every(item => item.weight <= 0.15 + 1e-9));
    assert.ok(Object.values(result.sectorWeights).every(weight => weight <= 0.35 + 1e-9));
    assert.ok(result.cashWeight >= 0.05 - 1e-9);
    assert.equal(result.suggestedWeights.reduce((sum, item) => sum + item.dollars, 0) + result.cashDollars, 10000);
  });

  it('caps an over-concentrated sector rather than breaching the risk budget', () => {
    const result = buildJevPaperAllocator({
      candidates: [
        { symbol: 'MSFT', sector: 'software', peerCount: 2 },
        { symbol: 'NOW', sector: 'software', peerCount: 2 },
        { symbol: 'TEAM', sector: 'software', peerCount: 2 },
      ],
      capital: 9000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    assert.equal(result.sectorWeights.software, 0.35);
    assert.ok(result.suggestedWeights.every(item => item.weight <= 0.15 + 1e-9));
    assert.ok(result.cashWeight >= 0.05);
    assert.ok(result.alerts.some(alert => alert.includes('capped')));
  });

  it('preserves the cash reserve and reconciles dollars for a larger universe', () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      symbol: 'T' + index,
      sector: 'sector-' + index,
      peerCount: 1,
    }));
    const result = buildJevPaperAllocator({
      candidates: many, capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    assert.equal(result.allocationAllowed, true);
    assert.ok(result.cashWeight >= 0.05 - 1e-6);
    assert.ok(result.suggestedWeights.every(item => item.weight <= 0.15 + 1e-9));
    assert.equal(
      Number((result.suggestedWeights.reduce((sum, item) => sum + item.dollars, 0) + result.cashDollars).toFixed(2)),
      10000,
    );
  });

  it('honors saved target and maximum allocation percentages', () => {
    const result = buildJevPaperAllocator({
      candidates: [
        { symbol: 'MSFT', sector: 'software', targetAllocationPct: 20, maxAllocationPct: 5 },
        { symbol: 'META', sector: 'internet', targetAllocationPct: 10, maxAllocationPct: 15 },
      ],
      capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
      savedRulesLoaded: true,
    });
    assert.equal(result.allocationAllowed, true);
    assert.equal(result.suggestedWeights.find(item => item.symbol === 'MSFT')?.weight, 0.05);
    assert.equal(result.suggestedWeights.find(item => item.symbol === 'META')?.weight, 0.1);
  });

  it('blocks a breached loss limit and flags price-stop rules for manual verification', () => {
    const lossLimit = buildJevPaperAllocator({
      candidates: [{ symbol: 'NVDA', sector: 'semiconductors', currentPrice: 80, averageCost: 100, quoteFresh: true, lossLimitPct: 15 }],
      capital: 1000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
      savedRulesLoaded: true,
    });
    assert.equal(lossLimit.allocationAllowed, false);
    assert.ok(lossLimit.blockedReasons.some(reason => reason.includes('saved loss limit')));

    const priceStop = buildJevPaperAllocator({
      candidates: [{ symbol: 'MU', sector: 'semiconductors', currentPrice: 70, averageCost: 100, quoteFresh: true, exitRuleType: 'price-stop', exitRuleValue: 15 }],
      capital: 1000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
      savedRulesLoaded: true,
    });
    assert.equal(priceStop.allocationAllowed, true);
    assert.ok(priceStop.alerts.some(reason => reason.includes('price-stop rule')));
  });

  it('blocks when a saved time-limit exit rule has expired', () => {
    const purchaseDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const result = buildJevPaperAllocator({
      candidates: [{ symbol: 'RKLB', sector: 'space', purchaseDate, exitRuleType: 'time-limit', exitRuleValue: 10 }],
      capital: 1000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
      savedRulesLoaded: true,
    });
    assert.equal(result.allocationAllowed, false);
    assert.ok(result.blockedReasons.some(reason => reason.includes('saved time limit')));
  });

  it('blocks when saved portfolio rules could not be loaded', () => {
    const result = buildJevPaperAllocator({
      candidates, capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
      savedRulesLoaded: false,
    });
    assert.equal(result.allocationAllowed, false);
    assert.equal(result.suggestedWeights.length, 0);
    assert.ok(result.blockedReasons.some(reason => reason.includes('Saved portfolio rules')));
  });

  it('validates candidate symbols and peer comparability values', () => {
    assert.throws(() => buildJevPaperAllocator({
      candidates: [{ symbol: 'MSFT', sector: 'software' }, { symbol: 'MSFT', sector: 'internet' }],
      capital: 100, evidenceComplete: true, evidenceFresh: true, conflictCount: 0,
    }), /unique symbols/);
    assert.throws(() => buildJevPaperAllocator({
      candidates: [{ symbol: 'MSFT', sector: 'software', peerComparabilityScore: 140 }],
      capital: 100, evidenceComplete: true, evidenceFresh: true, conflictCount: 0,
    }), /between 0 and 100/);
  });
});


  it('applies a bounded peer-strength tilt only when all candidates have fresh coverage', () => {
    const result = buildJevPaperAllocator({
      candidates: [
        { symbol: 'AAA', sector: 'software', peerStrengthScore: 100, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
        { symbol: 'BBB', sector: 'internet', peerStrengthScore: 0, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
      ],
      capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    assert.equal(result.allocationAllowed, true);
    assert.ok(result.suggestedWeights.find(item => item.symbol === 'AAA')!.weight >
      result.suggestedWeights.find(item => item.symbol === 'BBB')!.weight);
    assert.ok(result.alerts.some(alert => alert.includes('Evidence-backed peer strength')));
    assert.ok(result.suggestedWeights.every(item => item.weight <= 0.15 + 1e-9));
  });

  it('does not apply peer-strength tilt if any candidate evidence is stale or under-covered', () => {
    const result = buildJevPaperAllocator({
      candidates: [
        { symbol: 'AAA', sector: 'software', peerStrengthScore: 100, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
        { symbol: 'BBB', sector: 'internet', peerStrengthScore: 0, peerStrengthCoverage: 0.2, peerStrengthEvidenceFresh: true },
      ],
      capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    assert.equal(result.suggestedWeights.find(item => item.symbol === 'AAA')!.weight,
      result.suggestedWeights.find(item => item.symbol === 'BBB')!.weight);
    assert.ok(result.alerts.some(alert => alert.includes('no peer-strength ranking is applied')));
  });

  it('preserves saved target allocations despite peer-strength differences', () => {
    const result = buildJevPaperAllocator({
      candidates: [
        { symbol: 'AAA', sector: 'software', targetAllocationPct: 10, peerStrengthScore: 100, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
        { symbol: 'BBB', sector: 'internet', targetAllocationPct: 10, peerStrengthScore: 0, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
      ],
      capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
      savedRulesLoaded: true,
    });
    assert.equal(result.suggestedWeights.find(item => item.symbol === 'AAA')!.weight, 0.1);
    assert.equal(result.suggestedWeights.find(item => item.symbol === 'BBB')!.weight, 0.1);
  });

  it('includes covered peer strength in the balance score and emits a low-strength risk alert', () => {
    const strong = buildJevPaperAllocator({
      candidates: [
        { symbol: 'AAA', sector: 'software', peerStrengthScore: 90, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
        { symbol: 'BBB', sector: 'internet', peerStrengthScore: 80, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
      ],
      capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    const weak = buildJevPaperAllocator({
      candidates: [
        { symbol: 'AAA', sector: 'software', peerStrengthScore: 20, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
        { symbol: 'BBB', sector: 'internet', peerStrengthScore: 10, peerStrengthCoverage: 1, peerStrengthEvidenceFresh: true },
      ],
      capital: 10000, evidenceComplete: true, evidenceFresh: true, conflictCount: 0, gateAction: 'complete',
    });
    assert.ok(strong.balanceScore! > weak.balanceScore!);
    assert.ok(weak.alerts.some(alert => alert.includes('low relative peer-strength score')));
    assert.ok(strong.alerts.some(alert => alert.includes('blends diversification')));
  });
