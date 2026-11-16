import test from 'node:test';
import assert from 'node:assert/strict';
import { captureResearchSnapshot, type FinancialObservation, type SnapshotInput } from './researchSnapshot';
import { scanResearchSnapshot } from './opportunityResearch';
import { evaluateResearchEligibility } from './researchEligibility';
import { evaluateQuoteQuality, evaluateDecisionEligibility } from './decisionEligibility';
const now = Date.parse('2026-11-06T18:00:00Z');
const quote = {symbol:'ACME',price:100,currency:'USD',provider:'source-a',marketTime:'2026-11-06T17:59:00Z',retrievedAt:'2026-11-06T18:00:00Z',isMarketSessionOpen:true,status:'valid',adjustedBasis:'raw'};
const observation:FinancialObservation = {id:'growth-acme',symbol:'ACME',metric:'revenue-growth-pct',value:10,unit:'percent',currency:'USD',periodStart:'2026-01-01',periodEnd:'2026-09-30',reportingBasis:'reported',provider:'source-a',sourceUrl:'https://example.com/reports/acme',publishedAt:'2026-10-15T12:00:00Z',retrievedAt:'2026-11-06T17:00:00Z',simulated:false};
const cash:FinancialObservation = {...observation,id:'cash-acme',metric:'free-cash-flow-usd',unit:'USD',value:1000};
const input:SnapshotInput = {id:'snapshot-1',nowMs:now,holdings:[],watchlist:['ACME'],quotes:{ACME:quote},companies:{ACME:{name:'Fictional company',assetClass:'equity',listingCountry:'US',provenance:{provider:'listing-source',sourceUrl:'https://example.com/listing/acme',observedAt:'2026-11-06T17:00:00Z'}}},financials:[observation,cash]};
const scan = (overrides:Partial<SnapshotInput> = {}) => scanResearchSnapshot(captureResearchSnapshot({...input,...overrides}),now)[0];

test('compatible positive reported observations produce experimental research only, without a position', () => {
  const result = scan(); assert.equal(result.status,'research-candidate'); assert.equal(result.signalEligibility,'experimental');
  assert.equal(result.accounting,'not-applicable'); assert.equal(result.supportingReasons.length,2);
  assert.ok(result.supportingReasons.every(reason => reason.evidenceIds.every(id => result.evidence.some(e => e.id === id))));
  assert.deepEqual(result.horizonMonths,{min:2,max:12});
});
test('holding research explicitly leaves portfolio accounting unverified and creates no trade state', () => {
  const result = scan({holdings:['ACME']}); assert.equal(result.status,'research-candidate'); assert.equal(result.accounting,'unverified'); assert.equal(result.portfolioContext,'holding');
  assert.equal('positionReturnPct' in result,false); assert.equal('decisionState' in result,false);
});
test('quote quality can be evaluated without falsely claiming accounting reconciliation', () => {
  const q = captureResearchSnapshot(input).entries[0].quote;
  assert.equal(evaluateQuoteQuality(q,now).eligible,true);
  assert.equal(evaluateDecisionEligibility(q,true,false,now).eligibleForDecision,false);
});
for (const patch of [{price:null},{price:NaN},{price:0},{currency:'EUR'},{marketTime:null},{status:'stale'},{status:'simulated'},{status:'conflicting'},{symbol:'OTHER'}]) {
  test('quote input failure withholds research: '+JSON.stringify(patch), () => {
    assert.equal(scan({quotes:{ACME:{...quote,...patch}}}).status,'needs-data');
  });
}
test('negative reported cash flow is adverse evidence, never silently zero or missing', () => {
  const result = scan({financials:[observation,{...cash,value:-100}]}); assert.equal(result.status,'monitor'); assert.equal(result.conflictingReasons.length,1); assert.match(result.conflictingReasons[0].explanation,/-100/);
});
test('periods, provenance, units, simulation and future evidence fail closed', () => {
  for (const patch of [{periodStart:'2025-01-01'},{publishedAt:null},{unit:'percent'},{simulated:true},{publishedAt:'2026-11-07T12:00:00Z'},{periodEnd:'2026-02-31'},{sourceUrl:'https://example.com/report?token=synthetic'}]) {
    assert.equal(scan({financials:[observation,{...cash,...patch} as FinancialObservation]}).status,'needs-data',JSON.stringify(patch));
  }
});
test('conflicting financial observations are not averaged', () => {
  const result = scan({financials:[observation,cash,{...cash,id:'cash-other-source',provider:'source-b',value:2000}]});
  assert.equal(result.dataEligibility,'conflicting'); assert.equal(result.status,'needs-data');
});
test('ambiguous observation identities are withheld', () => assert.equal(scan({financials:[observation,{...cash,id:observation.id}]}).status,'needs-data'));
test('unknown asset/listing coverage is missing; known funds are excluded', () => {
  assert.equal(scan({companies:{}}).status,'needs-data');
  assert.equal(scan({companies:{ACME:{name:'Company',assetClass:'equity'}}}).status,'needs-data');
  assert.equal(scan({companies:{ACME:{name:'Fund',assetClass:'leveraged-etf',listingCountry:'US',provenance:input.companies!.ACME.provenance}}}).status,'excluded');
});
test('frozen simulation markers can never be upgraded by positive financials', () => {
  const result = scan({simulated:true}); assert.equal(result.status,'needs-data'); assert.equal(result.dataEligibility,'insufficient');
});
test('universe is normalized, deduplicated, bounded and explicit about omitted coverage', () => {
  const snapshot = captureResearchSnapshot({...input,holdings:[' acme ','ACME'],watchlist:['ACME','Other','bad symbol',...Array.from({length:60},(_,i) => 'S'+i)]});
  assert.equal(snapshot.universe.holdings,1); assert.equal(snapshot.universe.watchlistOnly,50); assert.equal(snapshot.universe.omittedWatchlist,11); assert.equal(snapshot.universe.invalidSymbols,1);
  assert.equal(snapshot.entries.filter(e=>e.symbol==='ACME').length,1);
});
test('snapshot capture and scanning perform no IO, do not mutate input, and strip raw credentials', () => {
  const raw = {...input,quotes:{ACME:{...quote,token:'synthetic-token',raw:{secret:'synthetic-secret'}}}};
  const before = JSON.stringify(raw); const originalFetch = globalThis.fetch;
  globalThis.fetch = (()=>{throw new Error('Research must perform no network calls');}) as typeof fetch;
  try { const snapshot = captureResearchSnapshot(raw); const originalSnapshot = JSON.stringify(snapshot); const a = scanResearchSnapshot(snapshot,now); const b = scanResearchSnapshot(snapshot,now);
    assert.deepEqual(a,b); assert.equal(JSON.stringify(snapshot),originalSnapshot); assert.equal(JSON.stringify(raw),before);
    assert.equal(JSON.stringify(snapshot).includes('synthetic-token'),false); assert.equal(JSON.stringify(snapshot).includes('synthetic-secret'),false);
    raw.quotes.ACME.price=20; assert.equal(snapshot.entries[0].quote.price,100);
  } finally {globalThis.fetch=originalFetch;}
});
test('stale snapshot reevaluation and malformed clocks cannot keep a research case current', () => {
  const snapshot = captureResearchSnapshot(input);
  assert.equal(scanResearchSnapshot(snapshot,now+3*3600000)[0].status,'needs-data');
  assert.throws(()=>scanResearchSnapshot(snapshot,now-1)); assert.throws(()=>captureResearchSnapshot({...input,nowMs:NaN}));
});
test('evidence limits withhold inputs rather than silently selecting a convenient subset', () => {
  const snapshot = captureResearchSnapshot({...input,financials:Array.from({length:33},(_,i)=>({...cash,id:'cash-'+i}))});
  assert.ok(evaluateResearchEligibility(snapshot.entries[0],now).missingInputs.some(reason=>reason.includes('limit exceeded')));
  assert.throws(()=>captureResearchSnapshot({...input,financials:Array(2001).fill(cash)}));
});
test('committed fictional fixtures retain simulation markers and never enable research', async () => {
  const { readFileSync } = await import('node:fs');
  const fixture = JSON.parse(readFileSync(new URL('../../qa/fixtures/release2/research-input.json',import.meta.url),'utf8'));
  const snapshot = captureResearchSnapshot(fixture);
  assert.equal(snapshot.simulated,true);
  assert.ok(scanResearchSnapshot(snapshot,fixture.nowMs).every(item=>item.dataEligibility !== 'eligible'));
});
test('quote symbol casing is normalized while raw fields remain isolated', () => {
  assert.equal(scan({quotes:{ACME:{...quote,symbol:' acme '}}}).status,'research-candidate');
  const snapshot = captureResearchSnapshot({...input,quotes:{ACME:{...quote,currency:{secret:'never-copy-this'}}}});
  assert.equal(snapshot.entries[0].quote.currency,null);
  assert.equal(JSON.stringify(snapshot).includes('never-copy-this'),false);
});
test('an asserted asset/listing label without source evidence is not verified classification', () => {
  assert.equal(scan({companies:{ACME:{name:'Company',assetClass:'equity',listingCountry:'US'}}}).status,'needs-data');
});
test('a symbol conflict cannot erase an explicit simulation marker', () => {
  const snapshot = captureResearchSnapshot({...input,quotes:{ACME:{...quote,status:'simulated',symbol:'OTHER'}}});
  assert.equal(snapshot.entries[0].quote.status,'simulated');
  assert.equal(scanResearchSnapshot(snapshot,now)[0].dataEligibility,'insufficient');
});
test('unverified fund classification is missing coverage rather than a verified exclusion', () => {
  assert.equal(scan({companies:{ACME:{name:'Asserted fund',assetClass:'fund',listingCountry:'US'}}}).status,'needs-data');
});
