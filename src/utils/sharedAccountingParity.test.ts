import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {reviewLoadedLedger as sharedReview} from '../../shared/loadedLedgerReview.js';
import {evaluateDeclaredQuote as sharedQuote} from '../../shared/quoteAdmission.js';
import {reviewLoadedLedger} from './loadedLedgerReview';
import {calculateLoadedTradingPerformance} from './reviewedPortfolioAccounting';
import {evaluateDeclaredQuote} from './quoteAdmission';

const ledger=JSON.parse(readFileSync('scripts/fixtures/loaded-ledger-parity.fictional.json','utf8'));
const quotes=JSON.parse(readFileSync('scripts/fixtures/quote-admission-parity.fictional.json','utf8'));
for(const c of ledger.cases)test('retained pre-extraction ledger / browser / shared: '+c.id,()=>{
  assert.equal(ledger.sourceCommit,'59eb550c7d4c8df63a776ee340906cc77e342a36');
  assert.deepEqual(sharedReview(c.input),c.review);
  assert.deepEqual(reviewLoadedLedger(c.input),c.review);
  assert.deepEqual(calculateLoadedTradingPerformance(c.input,c.marks),c.performance);
});
for(const c of quotes.cases)test('retained pre-extraction quote admission: '+c.id,()=>{
  assert.equal(quotes.sourceCommit,ledger.sourceCommit);
  assert.deepEqual(sharedQuote('FICT',c.value,c.nowMs),c.expected);
  assert.deepEqual(evaluateDeclaredQuote('FICT',c.value,c.nowMs),c.expected);
});
test('shared browser accounting/admission imports no API, credentials, storage or transport',()=>{
  for(const entry of ['src/utils/loadedLedgerReview.ts','src/utils/quoteAdmission.ts']){
    const code=buildSync({entryPoints:[entry],bundle:true,platform:'browser',format:'iife',write:false,target:'es2022'}).outputFiles[0].text;
    for(const marker of ['process.env','SUPABASE_SERVICE_ROLE_KEY','requireAccess','localStorage','sessionStorage','fetch('])assert(!code.includes(marker),entry+': '+marker);
  }
});
