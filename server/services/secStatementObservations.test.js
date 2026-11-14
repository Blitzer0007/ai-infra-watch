import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSecStatementObservations,SEC_STATEMENT_CONCEPTS,SEC_STATEMENT_FAILURES} from '../../shared/secStatementObservations.js';
const fixture=()=>JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json','utf8')).facts;
const request=(facts=fixture(),period={start:null,end:'2025-12-31'})=>({symbol:'FICT',expectedCik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',retrievedAt:'2026-11-09T12:00:00Z',period,source:{status:'loaded',facts}});
const duration=facts=>request(facts,{start:'2025-01-01',end:'2025-12-31'});
const rows=(facts,tag='CashAndCashEquivalentsAtCarryingValue',unit='USD',namespace='us-gaap')=>facts.facts[namespace][tag].units[unit];
const find=(r,metric='cash_equivalents')=>r.observations.find(o=>o.metric===metric);
const has=(r,code)=>r.issues.some(i=>i.code===code);

describe('bounded original SEC statement observations',()=>{
  it('keeps cash, debt components, actual shares and absence of a total distinct',()=>{
    const r=buildSecStatementObservations(request());assert.equal(r.status,'partial');assert.equal(r.sourceStatus,'loaded');
    assert.deepEqual(r.observations.map(o=>[o.metric,o.value,o.unit]),[['cash_equivalents',25,'USD'],['long_term_debt_current',5,'USD'],['long_term_debt_noncurrent',20,'USD'],['short_term_borrowings',0,'USD'],['common_shares_outstanding',10,'shares']]);
    assert.equal(find(r,'total-interest-bearing-debt'),undefined);assert(r.unsupportedDerivedMetrics.includes('total-interest-bearing-debt'));assert(r.unsupportedDerivedMetrics.includes('ebitda'));
    assert.deepEqual(r.missingMetrics,['cover_page_shares_outstanding']);assert.equal(r.sourceCoverage,'unverified');assert.equal(r.grantsValuationEligibility,false);
  });
  it('retains basic/diluted EPS and weighted-average shares without using them as point-in-time shares',()=>{
    const r=buildSecStatementObservations(duration(fixture()));assert.equal(r.observations.length,4);
    assert.equal(find(r,'basic_eps').unit,'USD/shares');assert.equal(find(r,'basic_eps').value,2);assert.equal(find(r,'diluted_eps').value,1.78);
    assert.equal(find(r,'weighted_average_basic_shares').value,8);assert.equal(find(r,'weighted_average_diluted_shares').value,9);assert.equal(find(r,'common_shares_outstanding'),undefined);
    for(const o of r.observations){assert.equal(o.period.kind,'annual-duration');assert.equal(o.period.start,'2025-01-01');assert.equal(o.aggregationEligibility,false);}
  });
  it('retains point balances from a later quarterly filing without calling filing focus the balance date',()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0],filed:'2026-08-01',accn:'0000000001-26-000002',form:'10-Q/A',fp:'Q2',fy:2026,val:30});
    const o=find(buildSecStatementObservations(request(facts)));assert.equal(o.value,30);assert.equal(o.period.end,'2025-12-31');assert.equal(o.period.fiscalYear,null);assert.equal(o.filing.filingFiscalYear,2026);assert.equal(o.filing.filingFiscalPeriod,'Q2');assert.equal(o.filing.revisionStatus,'amendment-declared');
  });
  it('does not reinterpret a quarterly filing as annual EPS even when its supplied dates look annual',()=>{
    const facts=fixture(),list=rows(facts,'EarningsPerShareBasic','USD/shares');list.push({...list[0],filed:'2026-08-01',accn:'0000000001-26-000002',form:'10-Q',fp:'Q2',fy:2026});
    const r=buildSecStatementObservations(duration(facts));assert.equal(find(r,'basic_eps'),undefined);assert(has(r,'UNSUPPORTED_FILING'));
  });
  it('does not silently substitute the cover-page share date for the balance-sheet date',()=>{
    const first=buildSecStatementObservations(request());assert.equal(find(first,'cover_page_shares_outstanding'),undefined);
    const cover=buildSecStatementObservations(request(fixture(),{start:null,end:'2026-02-10'}));assert.equal(cover.observations.length,1);assert.equal(find(cover,'cover_page_shares_outstanding').value,11);
    assert.equal(cover.observations[0].sourceLocator.namespace,'dei');assert.equal(cover.observations[0].currency,null);
  });
  it('preserves filing focus without claiming it is the comparative fact fiscal year',()=>{
    const facts=fixture();for(const c of SEC_STATEMENT_CONCEPTS.filter(c=>c.kind==='annual-duration')){const r=rows(facts,c.tag,c.unit)[0];r.start='2024-01-01';r.end='2024-12-31';r.frame='CY2024';}
    const r=buildSecStatementObservations(request(facts,{start:'2024-01-01',end:'2024-12-31'}));
    for(const o of r.observations){assert.equal(o.filing.filingFiscalYear,2025);assert.equal(o.filing.filingFiscalPeriod,'FY');assert.equal(o.period.fiscalYear,null);assert.equal(o.period.fiscalPeriod,null);}
  });
  it('preserves locator, day precision, unretained original references and false authority',()=>{
    const r=buildSecStatementObservations(request());const o=find(r);
    assert.deepEqual(o.sourceLocator,{namespace:'us-gaap',tag:'CashAndCashEquivalentsAtCarryingValue',unit:'USD',rowIndex:0});
    assert.equal(o.sourceReference.originalSourceUrl,null);assert.equal(o.sourceReference.originalDocumentRetained,false);assert.equal(o.sourceReference.kind,'constructed-companyfacts-and-accession');
    assert.equal(o.sourceReference.companyfactsUrl,'https://data.sec.gov/api/xbrl/companyfacts/CIK0000000001.json');assert.equal(o.publishedAt,null);assert.equal(o.observedAt,null);
    assert.equal(o.publicationWindow.earliest,'2026-02-19T10:00:00.000Z');assert.equal(o.publicationWindow.latest_exclusive,'2026-02-21T12:00:00.000Z');
    for(const item of r.observations){assert.equal(item.sourceAuthenticityVerified,false);assert.equal(item.issuerMappingVerified,false);assert.equal(item.grantsDecisionEligibility,false);assert.equal(item.grantsValuationEligibility,false);assert.equal(item.adjustmentBasis,'unknown');assert.equal(item.valuePrecision,'not-supplied');assert.equal(item.dimensionalScope,'not-established');assert.equal(item.simulationStatus,'not-established');}
  });
  it('does no I/O, reads no ambient clock and leaves original records untouched',t=>{
    const input=request(),before=JSON.stringify(input);t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});t.mock.method(Date,'now',()=>{throw Error('Ambient clock forbidden');});
    const r=buildSecStatementObservations(input);assert.deepEqual(r.usage,{providerCalls:0,modelCalls:0,databaseCalls:0});assert.equal(r.usageScope,'projection-only');assert.equal(JSON.stringify(input),before);
    r.observations[0].period.end='2000-01-01';r.observations[0].filing.filedOn='2000-01-01';assert.equal(JSON.stringify(input),before);
  });
  for(const status of SEC_STATEMENT_FAILURES)it(`preserves ${status} without inventing a retrieval timestamp`,()=>{
    const r=buildSecStatementObservations({...request(),retrievedAt:null,source:{status}});assert.equal(r.status,status);assert.equal(r.sourceStatus,status);assert.equal(r.retrievedAt,null);assert.deepEqual(r.observations,[]);
  });
  it('requires a declared retrieval for loaded data and rejects future retrieval at microsecond precision',()=>{
    assert(has(buildSecStatementObservations({...request(),retrievedAt:null}),'RETRIEVAL_UNAVAILABLE'));
    const r=buildSecStatementObservations({...request(),retrievedAt:'2026-11-14T12:00:00.000001Z'});assert.equal(r.status,'invalid-payload');assert(has(r,'FUTURE_RETRIEVAL'));assert.equal(r.observations.length,0);
  });
  for(const [at,allowed] of [['2026-02-21T11:59:59.999999Z',false],['2026-02-21T12:00:00Z',true],['2026-02-21T12:00:00.000001Z',true]])it(`checks the entire filing-day window by ${at}`,()=>{
    const r=buildSecStatementObservations({...request(),retrievedAt:at});assert.equal(!!find(r),allowed);if(!allowed)assert(has(r,'PUBLICATION_WINDOW_UNCLOSED'));
  });
  it('never treats a loaded empty projection as proof of no statements',()=>{
    const facts=fixture();facts.facts={};const r=buildSecStatementObservations(request(facts));assert.equal(r.status,'unavailable');assert.equal(r.sourceStatus,'loaded');assert.equal(r.sourceCoverage,'unverified');assert(has(r,'NO_SUPPORTED_OBSERVATIONS'));assert.equal(r.missingMetrics.length,6);
  });
  it('does not reuse a different period or assume a missing debt component is zero',()=>{
    const facts=fixture();delete facts.facts['us-gaap'].LongTermDebtNoncurrent;
    const r=buildSecStatementObservations(request(facts));assert.equal(find(r,'long_term_debt_noncurrent'),undefined);assert(r.missingMetrics.includes('long_term_debt_noncurrent'));
    const other=buildSecStatementObservations(request(facts,{start:null,end:'2024-12-31'}));assert.equal(other.observations.length,0);assert(has(other,'PERIOD_NOT_LOADED'));
  });
  for(const value of [null,true,'25',NaN,Infinity,-1,Number.MAX_SAFE_INTEGER+1])it(`does not coerce unsuitable cash value ${String(value)} or fall back to an older row`,()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0],filed:'2026-03-01',accn:'0000000001-26-000002',val:value});
    const r=buildSecStatementObservations(request(facts));assert.equal(find(r),undefined);assert(r.missingMetrics.includes('cash_equivalents'));
  });
  for(const [tag,unit,metric] of [['LongTermDebtCurrent','USD','long_term_debt_current'],['CommonStockSharesOutstanding','shares','common_shares_outstanding']])it(`withholds negative ${metric}`,()=>{
    const facts=fixture();rows(facts,tag,unit)[0].val=-1;assert.equal(find(buildSecStatementObservations(request(facts)),metric),undefined);
  });
  for(const value of [0,-.5,1e-10])it(`preserves EPS ${value} without a valuation or denominator calculation`,()=>{
    const facts=fixture();rows(facts,'EarningsPerShareBasic','USD/shares')[0].val=value;const r=buildSecStatementObservations(duration(facts));assert.equal(find(r,'basic_eps').value,value);assert.equal(r.grantsValuationEligibility,false);
  });
  for(const [tag,unit,wrong,metric] of [['CashAndCashEquivalentsAtCarryingValue','USD','EUR','cash_equivalents'],['CommonStockSharesOutstanding','shares','USD','common_shares_outstanding'],['EarningsPerShareBasic','USD/shares','USD','basic_eps']])it(`preserves the ${unit} versus ${wrong} distinction`,()=>{
    const facts=fixture(),c=facts.facts['us-gaap'][tag];c.units={[wrong]:c.units[unit]};const r=buildSecStatementObservations(tag==='EarningsPerShareBasic'?duration(facts):request(facts));assert.equal(find(r,metric),undefined);assert(has(r,'UNSUPPORTED_OR_MISSING_UNIT'));
  });
  it('rejects malformed unit arrays and excessive rows even in unused periods/units',()=>{
    for(const unit of ['USD','EUR']){const facts=fixture();facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units[unit]={private:'do-not-echo'};const r=buildSecStatementObservations(request(facts));assert.equal(r.status,'invalid-payload');assert(has(r,'INVALID_UNIT_CONTAINER'));assert(!JSON.stringify(r).includes('do-not-echo'));}
    const facts=fixture(),r=rows(facts)[0];facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.EUR=Array(501).fill({...r,end:'2024-12-31'});assert(has(buildSecStatementObservations(request(facts)),'SOURCE_LIMIT'));
    const combined=fixture();combined.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units={USD:Array(300).fill(r),EUR:Array(201).fill(r)};assert(has(buildSecStatementObservations(request(combined)),'SOURCE_LIMIT'));
    const total=fixture();for(const c of SEC_STATEMENT_CONCEPTS.filter(c=>c.namespace==='us-gaap'))total.facts[c.namespace][c.tag].units[c.unit]=Array(250).fill(rows(total,c.tag,c.unit)[0]);assert(has(buildSecStatementObservations(request(total)),'SOURCE_LIMIT'));
  });
  for(const patch of [{form:'10-Q'},{fp:'Q1'},{fy:null},{fy:'2025'},{frame:'private-frame'},{private:'do-not-echo'}])it(`does not recover an older success when newest metadata is unsupported: ${JSON.stringify(patch)}`,()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0],filed:'2026-03-01',accn:'0000000001-26-000002',...patch});const r=buildSecStatementObservations(request(facts));assert.equal(find(r),undefined);assert(!JSON.stringify(r).includes('do-not-echo'));
  });
  for(const patch of [{filed:null},{filed:'2026-02-30'},{accn:null},{end:'2025-02-30'},{start:'invalid'}])it('withholds unresolved vintage/scope instead of filtering it away',()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0],...patch});const r=buildSecStatementObservations(request(facts));assert.equal(find(r),undefined);assert(has(r,'VINTAGE_OR_PERIOD_UNRESOLVED'));
  });
  it('deduplicates identical newest declarations but withholds conflicting values or same-day accessions',()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0]});assert.equal(buildSecStatementObservations(request(facts)).observations.filter(o=>o.metric==='cash_equivalents').length,1);
    list[1].val=99;assert(has(buildSecStatementObservations(request(facts)),'CONFLICTING_NEWEST_FACT'));
    list[1].val=25;list[1].accn='0000000001-26-000002';assert(has(buildSecStatementObservations(request(facts)),'AMBIGUOUS_VINTAGE'));
  });
  it('retains a later amended filing, locator and prior-vintage count without certifying restatement',()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0],form:'10-K/A',filed:'2026-03-01',accn:'0000000001-26-000002',val:30});
    const r=buildSecStatementObservations(request(facts)),o=find(r);assert.equal(o.value,30);assert.equal(o.sourceLocator.rowIndex,1);assert.equal(o.filing.revisionStatus,'amendment-declared');assert.equal(o.filing.priorVintageCount,1);assert.equal(o.filing.priorValuesCompared,false);assert(has(r,'MIXED_FILING_VINTAGES'));
  });
  it('withholds an unclosed newer filing instead of selecting older data',()=>{
    const facts=fixture(),list=rows(facts);list.push({...list[0],filed:'2026-11-09',accn:'0000000001-26-000002',val:30});const r=buildSecStatementObservations(request(facts));assert.equal(find(r),undefined);assert(has(r,'PUBLICATION_WINDOW_UNCLOSED'));
  });
  it('rejects inconsistent metadata for a shared accession across concepts',()=>{
    const facts=fixture();rows(facts,'LongTermDebtCurrent')[0].fy=2024;const r=buildSecStatementObservations(request(facts));assert.equal(r.status,'invalid-payload');assert.equal(r.observations.length,0);assert(has(r,'FILING_METADATA_CONFLICT'));
  });
  it('withholds simulated declarations and does not authenticate an explicit false simulation flag',()=>{
    const facts=fixture();facts.simulated=true;let r=buildSecStatementObservations(request(facts));assert.equal(r.status,'unavailable');assert.equal(r.simulationStatus,'declared-simulated');assert.equal(r.observations.length,0);
    facts.simulated=false;r=buildSecStatementObservations(request(facts));assert.equal(r.simulationStatus,'not-established');assert.equal(r.sourceAuthenticityVerified,false);
  });
  for(const change of [{expectedCik:'1'},{symbol:'fict'},{assessedAt:'2026-11-14'},{retrievedAt:'not-a-time'},{period:{start:'2025-01-01',end:'2025-03-31'}},{period:{start:'2026-01-01',end:'2025-12-31'}},{price:20}])it('rejects an invalid or widened scope without echoing it',()=>assert.throws(()=>buildSecStatementObservations({...request(),...change}),/^Error: Invalid statement scope$/));
  it('rejects source identity/shape errors and strips unrelated issuer/private fields',()=>{
    const facts=fixture();facts.cik=2;assert(has(buildSecStatementObservations(request(facts)),'ISSUER_MISMATCH'));
    facts.cik=1;facts.entityName='private-unused';facts.private='do-not-echo';const r=buildSecStatementObservations(request(facts));assert.equal(r.observations.length,5);assert(!JSON.stringify(r).includes('do-not-echo'));assert(!JSON.stringify(r).includes('private-unused'));
    facts.facts.dei=[];assert(has(buildSecStatementObservations(request(facts)),'INVALID_SOURCE'));
    assert(has(buildSecStatementObservations({...request(),source:{status:'timeout',error:'do-not-echo'}}),'INVALID_SOURCE_ENVELOPE'));
  });
});
