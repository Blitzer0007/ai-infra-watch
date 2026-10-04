import assert from 'node:assert/strict';
import testFn from 'node:test';
import { buildDecisionFirstText } from '../../server/api/portfolio-digest.js';

testFn('digest says earnings calendar unavailable when status is not ok', () => {
  const text = buildDecisionFirstText({
    actionItems: [],
    earnings: [],
    earningsStatus: 'unavailable',
    earningsError: 'HTTP 500',
    portfolio: { cashFlowPnl: 1, concentrationTop3Pct: 10, scenarioShockTotal: -2, riskScenarios: [] },
    benchmark: {},
    rules: { noRule: 0, breached: 0, targetReached: 0, near: 0 },
    forecast: { verified: 0, independentVerified: 0, pending: 0, independenceWindowBusinessDays: 20 },
  }, '2026-10-04', null);
  assert.match(text, /EARNINGS CALENDAR UNAVAILABLE/);
  assert.match(text, /HTTP 500/);
  assert.doesNotMatch(text, /No monitored earnings event in the next 7 days./);
});

testFn('digest does not claim a clean day when decision layer fails', () => {
  const text = buildDecisionFirstText(null, '2026-10-04', null, 'Decision center HTTP 500');
  assert.match(text, /DECISION LAYER UNAVAILABLE/);
  assert.match(text, /not a clean bill of health/);
});

testFn('digest reports target reached separately from breaches', () => {
  const text = buildDecisionFirstText({
    actionItems: [{ severity:'WATCH', symbol:'RKLB', title:'Target reached', detail:'Review staged exit.' }],
    earnings: [],
    earningsStatus: 'ok',
    portfolio: { cashFlowPnl: 1, concentrationTop3Pct: 10, scenarioShockTotal: -2, riskScenarios: [] },
    benchmark: {},
    rules: { noRule: 0, breached: 0, targetReached: 1, near: 0 },
    forecast: { verified: 0, independentVerified: 0, pending: 0, independenceWindowBusinessDays: 20 },
  }, '2026-10-04', null);
  assert.match(text, /Target reached/);
  assert.match(text, /1 targets reached/);
});
