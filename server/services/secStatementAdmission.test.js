import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSecStatementObservations,SEC_STATEMENT_FAILURES} from '../../shared/secStatementObservations.js';
import {validateSecStatementReceipt} from '../../shared/secStatementAdmission.js';
const facts=()=>JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json','utf8')).facts;
const request=(period={start:null,end:'2025-12-31'})=>({symbol:'FICT',expectedCik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',retrievedAt:'2026-11-09T12:00:00Z',period,source:{status:'loaded',facts:facts()}});
const rows=r=>r.source.facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD;
const reject=(r,s)=>{const a=validateSecStatementReceipt(r,s);assert.equal(a.status,'invalid');assert.equal(a.snapshot,null);assert.equal(a.verifiesSourceRecords,false);assert.equal(a.grantsDecisionEligibility,false);return a;};
describe('independent original-row statement admission',()=>{
  for(const period of [{start:null,end:'2025-12-31'},{start:'2025-01-01',end:'2025-12-31'},{start:null,end:'2026-02-10'}])it('binds a valid producer receipt without granting source or financial authority',()=>{
    const r=request(period),s=buildSecStatementObservations(r),a=validateSecStatementReceipt(r,JSON.parse(JSON.stringify(s)));
    assert.equal(a.status,'conditional');assert.deepEqual(a.snapshot,s);assert.notEqual(a.snapshot,s);assert.equal(a.verifiesSourceRecords,false);assert.equal(a.issuerMappingVerified,false);assert.equal(a.grantsValuationEligibility,false);assert.equal(a.aggregationEligibility,false);assert.deepEqual(a.usage,{providerCalls:0,modelCalls:0,databaseCalls:0});
  });
  for(const status of SEC_STATEMENT_FAILURES)it(`preserves a verified ${status} disposition without invented financial data`,()=>{
    const r={...request(),retrievedAt:null,source:{status}},a=validateSecStatementReceipt(r,buildSecStatementObservations(r));assert.equal(a.status,'needs-data');assert.equal(a.snapshot.status,status);assert.equal(a.snapshot.retrievedAt,null);assert.deepEqual(a.snapshot.observations,[]);
  });
  it('rejects value, unit, quantity-basis, period and locator tampering',()=>{
    const r=request(),original=buildSecStatementObservations(r);
    for(const mutate of [s=>s.observations[0].value++,s=>s.observations[0].unit='shares',s=>s.observations[0].currency=null,s=>s.observations[0].measurementBasis='total-debt',s=>s.observations[0].period.end='2024-12-31',s=>s.observations[0].period.fiscalYear=2025,s=>s.observations[0].sourceLocator.rowIndex=1,s=>s.observations[0].sourceLocator.tag='Liabilities']){const s=structuredClone(original);mutate(s);reject(r,s);}
  });
  it('rejects changed filing, timestamps, uncertainty bounds and source references',()=>{
    const r=request(),original=buildSecStatementObservations(r);
    for(const mutate of [s=>s.observations[0].filing.filingFiscalYear=2024,s=>s.observations[0].filing.form='10-K/A',s=>s.observations[0].filing.priorVintageCount++,s=>s.observations[0].retrievedAt=r.assessedAt,s=>s.observations[0].publishedAt='2026-02-20T00:00:00Z',s=>s.observations[0].publicationWindow.latest_exclusive='2026-02-20T00:00:00Z',s=>s.observations[0].sourceReference.filingIndexUrl='https://example.com/forged',s=>s.observations[0].sourceReference.originalDocumentRetained=true]){const s=structuredClone(original);mutate(s);reject(r,s);}
  });
  it('rejects upgraded authority and widened/private fields with no echo',()=>{
    const r=request(),original=buildSecStatementObservations(r);
    for(const mutate of [s=>s.grantsDecisionEligibility=true,s=>s.grantsValuationEligibility=true,s=>s.sourceAuthenticityVerified=true,s=>s.issuerMappingVerified=true,s=>s.observations[0].aggregationEligibility=true,s=>s.private='do-not-echo',s=>s.observations[0].private='do-not-echo']){const s=structuredClone(original);mutate(s);assert(!JSON.stringify(reject(r,s)).includes('do-not-echo'));}
  });
  it('requires complete scoped coverage, diagnoses omissions and forbids invented total debt',()=>{
    const r=request(),original=buildSecStatementObservations(r);
    for(const mutate of [s=>s.observations.pop(),s=>s.observations.push({...s.observations[0],metric:'total-interest-bearing-debt'}),s=>s.missingMetrics=[],s=>s.issues=[],s=>s.rowsInspected++,s=>s.requestedMetrics.reverse(),s=>s.status='unavailable']){const s=structuredClone(original);mutate(s);reject(r,s);}
  });
  it('rechecks supplied originals rather than trusting unchanged normalized values',()=>{
    const r=request(),s=buildSecStatementObservations(r);rows(r)[0].val=999;reject(r,s);
    rows(r)[0].val=25;rows(r).push({...rows(r)[0],val:30,filed:'2026-03-01',accn:'0000000001-26-000002'});reject(r,s);
    const fresh=buildSecStatementObservations(r),accepted=validateSecStatementReceipt(r,fresh);assert.equal(accepted.status,'conditional');assert.equal(accepted.snapshot.observations[0].value,30);
  });
  it('rechecks newest duplicate ambiguity and unavailable newer filings',()=>{
    const r=request(),old=buildSecStatementObservations(r);rows(r).push({...rows(r)[0],accn:'0000000001-26-000002'});reject(r,old);
    let s=buildSecStatementObservations(r),a=validateSecStatementReceipt(r,s);assert.equal(a.status,'conditional');assert(!a.snapshot.observations.some(o=>o.metric==='cash_equivalents'));
    rows(r)[1].filed='2026-11-09';s=buildSecStatementObservations(r);a=validateSecStatementReceipt(r,s);assert.equal(a.status,'conditional');assert(a.snapshot.missingMetrics.includes('cash_equivalents'));reject(r,old);
  });
  it('independently withholds malformed newest fields and inconsistent shared filings',()=>{
    for(const patch of [{val:null},{val:true},{val:'25'},{val:-1},{val:Infinity},{fy:null},{frame:'invalid'},{form:'10-Q'},{filed:'2026-02-30'}]){
      const r=request();rows(r).push({...rows(r)[0],filed:'2026-03-01',accn:'0000000001-26-000002',...patch});const s=buildSecStatementObservations(r),a=validateSecStatementReceipt(r,s);assert.notEqual(a.status,'invalid');assert(!a.snapshot.observations.some(o=>o.metric==='cash_equivalents'));
    }
    const r=request();r.source.facts.facts['us-gaap'].LongTermDebtCurrent.units.USD[0].fy=2024;const a=validateSecStatementReceipt(r,buildSecStatementObservations(r));assert.equal(a.status,'needs-data');assert.equal(a.snapshot.observations.length,0);
  });
  it('preserves quarterly point, comparative filing focus, loss and tiny EPS semantics',()=>{
    const r=request();rows(r)[0].form='10-Q/A';rows(r)[0].fp='Q2';rows(r)[0].fy=2026;rows(r)[0].accn='0000000001-26-000002';rows(r)[0].filed='2026-08-01';let a=validateSecStatementReceipt(r,buildSecStatementObservations(r));assert.equal(a.status,'conditional');assert.equal(a.snapshot.observations[0].filing.filingFiscalPeriod,'Q2');
    for(const value of [0,-.5,1e-10]){const annual=request({start:'2025-01-01',end:'2025-12-31'});annual.source.facts.facts['us-gaap'].EarningsPerShareBasic.units['USD/shares'][0].val=value;a=validateSecStatementReceipt(annual,buildSecStatementObservations(annual));assert.equal(a.status,'conditional');assert.equal(a.snapshot.observations.find(o=>o.metric==='basic_eps').value,value);}
  });
  it('rejects altered assessment, malformed scope and oversized original packets',()=>{
    const r=request(),s=buildSecStatementObservations(r);reject({...r,symbol:'OTHER'},s);reject({...r,assessedAt:'2026-11-14T12:00:00.000001Z'},s);reject({...r,period:{start:'2025-01-01',end:'2025-12-31'}},s);reject(null,s);
    rows(r).push(...Array(501).fill(rows(r)[0]));reject(r,s);const a=validateSecStatementReceipt(r,buildSecStatementObservations(r));assert.equal(a.snapshot.observations.length,0);
  });
  it('uses no network/ambient clock and returns no references to caller objects',t=>{
    const r=request(),s=buildSecStatementObservations(r),before=JSON.stringify([r,s]);t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});t.mock.method(Date,'now',()=>{throw Error('Clock forbidden');});const a=validateSecStatementReceipt(r,s);assert.equal(a.status,'conditional');a.snapshot.observations[0].value=700;assert.equal(JSON.stringify([r,s]),before);
  });
});
