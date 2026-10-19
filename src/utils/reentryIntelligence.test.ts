import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessReentry } from './reentryIntelligence';

const quote = { price: 300, sma20: 295, sma50: 290, drawdownFrom52WeekHighPct: 15 };
test('requires price target, fresh quote, and thesis for a candidate', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Long-term cloud thesis', quote }).status, 'REENTRY_CANDIDATE');
  assert.equal(assessReentry({ targetPrice: 310, thesis: '', quote }).status, 'WATCH_ENTRY');
});
test('price at target without trend confirmation is watch only', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Thesis', quote: { ...quote, price: 280, sma20: 290, sma50: 300 } }).status, 'WATCH_ENTRY');
});
test('invalidated thesis overrides attractive price', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Old thesis', quote, thesisInvalidated: true }).status, 'NOT_READY');
});
test('missing quote is insufficient data', () => {
  assert.equal(assessReentry({ targetPrice: 310, thesis: 'Thesis', quote: null }).status, 'INSUFFICIENT_DATA');
});


test('holding state triggers an exit review at the planned $770 level but never a sell order', () => {
  const result = assessReentry({
    ownershipStatus: 'holding',
    targetPrice: 720,
    plannedExitPrice: 770,
    upperReviewPrice: 770,
    thesis: 'META long-term AI and advertising thesis',
    quote: { ...quote, price: 771 },
  });
  assert.equal(result.status, 'EXIT_REVIEW');
  assert.match(result.reasons.join(' '), /not an automatic sell/i);
});

test('holding state stays in monitoring mode below the planned exit level', () => {
  const result = assessReentry({
    ownershipStatus: 'holding',
    targetPrice: 720,
    plannedExitPrice: 770,
    thesis: 'META long-term AI and advertising thesis',
    quote: { ...quote, price: 750 },
  });
  assert.equal(result.status, 'HOLDING');
});

test('sold-state price above the upper threshold asks for evidence review, not a purchase', () => {
  const result = assessReentry({
    ownershipStatus: 'sold',
    targetPrice: 720,
    upperReviewPrice: 770,
    thesis: 'META long-term AI and advertising thesis',
    quote: { ...quote, price: 780 },
  });
  assert.equal(result.status, 'EVIDENCE_REVIEW_REQUIRED');
});

test('sold-state target at or below $720 can become a candidate only with trend confirmation and thesis', () => {
  const result = assessReentry({
    ownershipStatus: 'sold',
    targetPrice: 720,
    upperReviewPrice: 770,
    thesis: 'META long-term AI and advertising thesis',
    quote: { ...quote, price: 715, sma20: 710, sma50: 700 },
  });
  assert.equal(result.status, 'REENTRY_CANDIDATE');
});

test('invalidated sold-state thesis suppresses both low-price and high-price reviews', () => {
  const result = assessReentry({
    ownershipStatus: 'sold',
    targetPrice: 720,
    upperReviewPrice: 770,
    thesis: 'Thesis was broken',
    thesisInvalidated: true,
    quote: { ...quote, price: 780 },
  });
  assert.equal(result.status, 'NOT_READY');
});
