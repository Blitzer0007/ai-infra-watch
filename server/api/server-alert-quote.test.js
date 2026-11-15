import test from 'node:test';
import assert from 'node:assert/strict';
import { admitYahooAlertQuote, fetchServerAlertQuote, SERVER_ALERT_QUOTE_MAX_AGE_MS } from '../utils/serverAlertQuote.js';
import { normalizeAlert } from './server-alerts.js';

const NOW = Date.parse('2026-11-13T16:00:00Z'); // Fictional Friday, 11am New York.
function meta(changes = {}) {
  return { symbol:'FICT',currency:'USD',exchangeTimezoneName:'America/New_York',regularMarketPrice:100,
    regularMarketTime:NOW/1000,chartPreviousClose:80,
    currentTradingPeriod:{regular:{start:Date.parse('2026-11-13T14:30:00Z')/1000,end:Date.parse('2026-11-13T21:00:00Z')/1000}}, ...changes };
}
test('admitted alert quote retains market/retrieval times and exact daily return', () => {
  const value=admitYahooAlertQuote('FICT',meta(),NOW,NOW);
  assert.equal(value.eligible,true);assert.equal(value.quote.changePct,25);
  assert.equal(value.quote.marketTime,new Date(NOW).toISOString());
  assert.equal(value.quote.retrievedAt,new Date(NOW).toISOString());
  assert.equal(value.quote.returnedSymbol,'FICT');
});
for (const changes of [{symbol:'OTHER'},{symbol:undefined},{currency:'EUR'},{exchangeTimezoneName:'UTC'},
  {regularMarketPrice:0},{regularMarketPrice:-1},{regularMarketPrice:'100'}, {regularMarketPrice:Infinity},
  {regularMarketTime:null},{regularMarketTime:NOW/1000+1},{regularMarketTime:(NOW-SERVER_ALERT_QUOTE_MAX_AGE_MS)/1000-1},
  {simulated:true},{stale:true},{fallbackUsed:true},{simulated:'false'},{marketState:'POST'},
  {currentTradingPeriod:null},{currentTradingPeriod:{regular:{start:0,end:1}}}]) {
  test('bad server quote withheld: '+JSON.stringify(changes),()=>{
    const value=admitYahooAlertQuote('FICT',meta(changes),NOW,NOW);
    assert.equal(value.eligible,false);assert.equal(value.quote,null);
  });
}
test('age boundary is inclusive; future retrieval, weekends and provider-declared close are withheld',()=>{
  assert.equal(admitYahooAlertQuote('FICT',meta({regularMarketTime:(NOW-SERVER_ALERT_QUOTE_MAX_AGE_MS)/1000}),NOW,NOW).eligible,true);
  assert.equal(admitYahooAlertQuote('FICT',meta(),NOW,NOW+1).eligible,false);
  const saturday=NOW+86400000;
  assert.equal(admitYahooAlertQuote('FICT',meta({regularMarketTime:saturday/1000,currentTradingPeriod:{regular:{start:saturday/1000-3600,end:saturday/1000+3600}}}),saturday,saturday).eligible,false);
  const earlyClose={regular:{start:NOW/1000-3600,end:NOW/1000}};
  assert.equal(admitYahooAlertQuote('FICT',meta({currentTradingPeriod:earlyClose}),NOW,NOW).eligible,false);
});
test('missing or invalid previous close remains unknown, allowing price review without inventing daily zero',()=>{
  for(const previous of [null,undefined,0,-1,'80',NaN]) assert.equal(admitYahooAlertQuote('FICT',meta({chartPreviousClose:previous}),NOW,NOW).quote.changePct,null);
});
test('fixed Yahoo transport rejects chart failures and inadmissible metadata before alert evaluation',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({chart:{result:[{meta:meta()}]}})};};
  assert.equal((await fetchServerAlertQuote('FICT',fetcher,()=>NOW)).price,100);
  assert.equal(calls.length,1);assert.equal(calls[0].options.redirect,'error');
  assert(calls[0].url.startsWith('https://query1.finance.yahoo.com/v8/finance/chart/FICT?'));
  for(const payload of [{chart:{error:{code:'bad'},result:[{meta:meta()}]}},{chart:{result:[]}},{chart:{result:[{meta:meta({simulated:true})}]}}]) {
    assert.equal(await fetchServerAlertQuote('FICT',async()=>({ok:true,json:async()=>payload}),()=>NOW),null);
  }
  await assert.rejects(()=>fetchServerAlertQuote('FICT',async()=>({ok:false}),()=>NOW),/quote unavailable/);
  assert.equal(await fetchServerAlertQuote('BAD/URL',()=>{throw Error('no transport');},()=>NOW),null);
});

test('price alert configuration rejects coerced values and unknown directions',()=>{
  for(const targetPrice of [true,[],{},null,0,-1,Infinity]) assert.equal(normalizeAlert({symbol:'FICT',targetPrice,type:'above',active:true}),null);
  assert.equal(normalizeAlert({symbol:'FICT',targetPrice:100,type:'typo',active:true}),null);
  assert.deepEqual(normalizeAlert({symbol:'FICT',targetPrice:'100.5',type:'below',active:true}),{symbol:'FICT',targetPrice:100.5,type:'below',active:true});
});
