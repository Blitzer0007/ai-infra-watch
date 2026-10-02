import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateStressScore, median, sampleQuality, summarizeSample } from './measurement';

describe('stress score', () => {
  it('returns zero stress for neutral inputs', () => {
    const result = calculateStressScore({ dailyChanges: [0, 0, 0, 0], highMacroCount: 0, mediumMacroCount: 0 });
    assert.equal(result.score, 20);
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
