import assert from 'node:assert/strict';
import testFn from 'node:test';
import { buildDecisionFirstText } from '../../server/api/portfolio-digest.js';
import { buildTelegramDecisionBrief, buildTelegramDigestPayload } from '../../server/utils/dailyDecisionBrief.js';

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

testFn('Telegram fallback preserves real coverage but refuses fabricated alerts and P&L', () => {
  const result = buildTelegramDecisionBrief(null,'2026-11-19',null,{
    holdingsCount:3,quotesAccepted:1,quotesTotal:3,quoteStatus:'partial',
    accountingStatus:'conditional-loaded-records',
  });
  assert.match(result.text,/DECISION LAYER UNAVAILABLE/);
  assert.match(result.text,/Recorded holdings: 3/);
  assert.match(result.text,/Fresh quote coverage: 1\/3 holdings · partial/);
  assert.match(result.text,/loaded records only/);
  assert.match(result.text,/NEXT STEP/);
  assert.doesNotMatch(result.text,/0 urgent|0 watch|Trading P&L:|No monitored earnings/);
  assert.equal(result.reviewSymbols.length,0);
  assert.ok(result.text.length<3600);
  const payload=buildTelegramDigestPayload({telegramBrief:result,date:'2026-11-19'},'fictional-chat');
  assert.equal(payload.text,result.text);
  assert.equal(payload.reply_markup.inline_keyboard.length,1);
});

testFn('Telegram review with conditional accounting groups missing comparisons without showing unverified money', () => {
  const decision={
    ok:true,checkedAt:'2026-11-19T09:00:00Z',
    portfolio:{holdings:2,accountingStatus:'conditional-loaded-records',
      totalTradingPnl:123456.78,realizedPnl:234.56,unrealizedPnl:987.65,
      quoteCoverage:{status:'last-close'},concentrationTop3Pct:70,
      cashFlowPnl:null,scenarioShockTotal:null,riskScenarios:[]},
    actionItems:[], actionSummary:{version:1,total:0,act:0,watch:0,shown:0,omitted:0},
    rules:{total:2,noRule:1},earningsStatus:'unavailable',earnings:[],
    benchmark:{}, forecast:{},
  };
  const result=buildTelegramDecisionBrief(decision,'2026-11-19');
  assert.match(result.text,/TODAY’S REVIEW/);
  assert.match(result.text,/Only last-close quotes/);
  assert.match(result.text,/P&L withheld/);
  assert.match(result.text,/SPY\/SOXX comparisons withheld/);
  assert.match(result.text,/Earnings dates not verified/);
  assert.doesNotMatch(result.text,/123456|987\.65|234\.56|Top 3 concentration: 70/);
  assert.doesNotMatch(result.text,/comparison unavailable|Forecasts: unavailable/);
  assert.ok(result.text.length<=3600);
});

testFn('Telegram brief retains actual evidence and time when decision inputs are complete', () => {
  const result=buildTelegramDecisionBrief({
    ok:true,checkedAt:'2026-11-19T09:00:00Z',
    actionItems:[{symbol:'NVDA',severity:'ACT',title:'Rule reached',detail:'Fictional price crossed verified test rule.'}],
    actionSummary:{version:1,total:1,act:1,watch:0,shown:1,omitted:0},
    rules:{total:1,noRule:0},
    portfolio:{holdings:1,accountingStatus:'complete',
      quoteCoverage:{status:'complete'},concentrationTop3Pct:100,
      totalTradingPnl:10,realizedPnl:4,unrealizedPnl:6,cashFlowPnl:null,
      scenarioShockTotal:-2,riskScenarios:[{shock:-2}]},
    earningsStatus:'ok',earnings:[],forecast:{independentVerified:0,pending:1},
    benchmark:{},
  },'2026-11-19');
  assert.match(result.text,/NVDA · URGENT REVIEW/);
  assert.match(result.text,/Why: Fictional price crossed verified test rule/);
  assert.match(result.text,/Trading P&L: \+\$10\.00/);
  assert.match(result.text,/Top 3 concentration: 100\.0%/);
  assert.match(result.text,/Forecasts: 0 independent verified · 1 pending/);
  assert.deepEqual(result.reviewSymbols,['NVDA']);
});

testFn('Telegram brief displays a complete admitted marked value but never a value from partial quotes', () => {
  const complete=buildTelegramDecisionBrief(null,'2026-11-19',null,{
    holdingsCount:2,quotesAccepted:2,quotesTotal:2,
    quoteStatus:'complete',currentValueUsd:1250.5,
    accountingStatus:'conditional-loaded-records',
  });
  assert.match(complete.text,/Marked holdings value: \$1250\.50/);
  assert.match(complete.text,/not a verified trading return/);
  assert.doesNotMatch(complete.text,/Trading P&L:/);
  const partial=buildTelegramDecisionBrief(null,'2026-11-19',null,{
    holdingsCount:2,quotesAccepted:1,quotesTotal:2,
    quoteStatus:'partial',currentValueUsd:1250.5,
    accountingStatus:'quotes-incomplete',
  });
  assert.doesNotMatch(partial.text,/1250\.50|Marked holdings value/);
  const malformed=buildTelegramDecisionBrief(null,'2026-11-19',null,{
    holdingsCount:2,quotesAccepted:2,quotesTotal:2,
    quoteStatus:'complete',currentValueUsd:'1250.5',
    accountingStatus:'conditional-loaded-records',
  });
  assert.doesNotMatch(malformed.text,/Marked holdings value/);
});
