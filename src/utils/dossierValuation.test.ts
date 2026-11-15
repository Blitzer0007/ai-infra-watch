import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {fictionalDossierRequest,fictionalDossierStatements} from '../components/portfolio/CompanyDossierPreview';
import {buildSecStatementObservations} from '../../shared/secStatementObservations.js';
import {reviewDossierValuation} from './dossierValuation';
import type {DossierStatementPacket} from './dossierStatements';
const review=(p:unknown=fictionalDossierStatements(),symbol='FICT')=>reviewDossierValuation(symbol,fictionalDossierRequest,p);
const check=(r:ReturnType<typeof review>,group:'pe'|'evEbitda',id:string)=>r[group].checks.find(c=>c.id===id)!;
function rebuilt(p:DossierStatementPacket){p.entries=p.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:p.retrievedAt,source:p.source,period:e.period})}));return p;}
const raw=(p:DossierStatementPacket)=>(p.source as any).facts.facts;
describe('dossier valuation input review',()=>{
  it('uses independently admitted declarations but never grants multiple or decision authority',()=>{
    const r=review();assert.equal(r.statementAdmission.status,'conditional');assert.equal(r.pe.value,null);assert.equal(r.evEbitda.value,null);assert.equal(r.status,'withheld');assert.equal(r.grantsValuationEligibility,false);assert.equal(r.grantsDecisionEligibility,false);assert.equal(r.sourceAuthenticityVerified,false);assert.equal(r.issuerMappingVerified,false);
    assert.equal(check(r,'pe','eps').status,'declaration-only');assert.match(check(r,'pe','eps').detail,/1\.78 USD per share/);assert.equal(check(r,'pe','price').status,'not-connected');assert.equal(check(r,'pe','basis').status,'unverified');assert.equal(check(r,'pe','source').status,'unverified');
  });
  it('keeps point, cover-page and weighted share bases separate from cash and debt scope',()=>{
    const r=review();assert.equal(check(r,'evEbitda','shares').status,'declaration-only');assert.match(check(r,'evEbitda','shares').detail,/2025-12-31/);assert.doesNotMatch(check(r,'evEbitda','shares').detail,/2026-02-10/);assert.equal(check(r,'evEbitda','cash').status,'declaration-only');assert.equal(check(r,'evEbitda','debt').status,'partial');assert.equal(check(r,'evEbitda','ebitda').status,'unsupported');assert.equal(check(r,'evEbitda','claims').status,'unverified');
  });
  it('unconnected inputs remain missing rather than becoming zero EPS, cash, debt or shares',()=>{
    const r=review(null);assert.equal(r.statementAdmission.status,'not-connected');for(const [group,id] of [['pe','eps'],['evEbitda','cash'],['evEbitda','debt'],['evEbitda','shares']] as const)assert.equal(check(r,group,id).status,'missing');assert.equal(r.pe.value,null);assert.equal(r.evEbitda.value,null);
  });
  for(const status of ['not-configured','rate-limited','timeout','transport-error','no-data','unavailable'])it(`does not restore earlier statements after ${status}`,()=>{
    const p=fictionalDossierStatements();p.source={status};p.retrievedAt=null;const r=review(rebuilt(p));assert.equal(r.statementAdmission.status,'needs-data');assert.equal(check(r,'pe','eps').status,'missing');assert.equal(check(r,'evEbitda','cash').status,'missing');assert.equal(r.pe.value,null);
  });
  it('forged values, widened/private fields and mismatched scope supply no checklist figures',()=>{
    for(const change of [(p:any)=>p.entries[1].receipt.observations[0].value=900,(p:any)=>p.entries[0].receipt.grantsValuationEligibility=true,(p:any)=>p.private='private-do-not-echo',(p:any)=>p.symbol='OTHER',(p:any)=>p.assessedAt='2026-11-14T12:00:01Z']){const p=fictionalDossierStatements();change(p);const r=review(p);assert.equal(r.statementAdmission.status,'invalid');assert.equal(check(r,'pe','eps').status,'missing');assert.equal(check(r,'evEbitda','cash').status,'missing');assert(!JSON.stringify(r).includes('private-do-not-echo'));}
    assert.equal(review(fictionalDossierStatements(),'NVDA').statementAdmission.status,'invalid');
  });
  for(const value of [0,-.5,1e-10])it(`distinguishes diluted EPS ${value} from missing data without calculating a multiple`,()=>{
    const p=fictionalDossierStatements();raw(p)['us-gaap'].EarningsPerShareDiluted.units['USD/shares'][0].val=value;const r=review(rebuilt(p));assert.equal(check(r,'pe','eps').status,value<=0?'nonpositive':'declaration-only');assert.equal(r.pe.value,null);assert.equal(r.pe.status,value<=0?'not-meaningful':'withheld');
  });
  it('does not substitute positive basic EPS when diluted EPS is absent',()=>{
    const p=fictionalDossierStatements();delete raw(p)['us-gaap'].EarningsPerShareDiluted;const r=review(rebuilt(p));assert.equal(check(r,'pe','eps').status,'missing');assert.match(check(r,'pe','eps').detail,/Basic EPS is not substituted/);
  });
  it('requires an explicit period choice when more than one annual diluted EPS declaration is supplied',()=>{
    const p=fictionalDossierStatements(),rows=raw(p)['us-gaap'].EarningsPerShareDiluted.units['USD/shares'];rows.push({...rows[0],start:'2024-01-01',end:'2024-12-31',val:1});p.entries=[p.entries[1],{...p.entries[1],period:{start:'2024-01-01',end:'2024-12-31'}}];const r=review(rebuilt(p));assert.equal(r.statementAdmission.status,'conditional');assert.equal(check(r,'pe','eps').status,'selection-needed');assert.equal(r.pe.value,null);
  });
  it('does not silently replace missing point shares with cover-page or duration-weighted shares',()=>{
    const p=fictionalDossierStatements();delete raw(p)['us-gaap'].CommonStockSharesOutstanding;const r=review(rebuilt(p));assert.equal(check(r,'evEbitda','shares').status,'missing');assert.match(check(r,'evEbitda','shares').detail,/Cover-page and weighted-average shares/);
  });
  it('requires a date choice when several point-in-time share declarations exist',()=>{
    const p=fictionalDossierStatements(),rows=raw(p)['us-gaap'].CommonStockSharesOutstanding.units.shares;rows.push({...rows[0],end:'2026-02-10',val:10});const r=review(rebuilt(p));assert.equal(check(r,'evEbitda','shares').status,'selection-needed');assert.equal(r.evEbitda.value,null);
  });
  it('retains observed zero cash and zero borrowing components without asserting complete debt',()=>{
    const p=fictionalDossierStatements();raw(p)['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD[0].val=0;for(const tag of ['LongTermDebtCurrent','LongTermDebtNoncurrent'])raw(p)['us-gaap'][tag].units.USD[0].val=0;const r=review(rebuilt(p));assert.equal(check(r,'evEbitda','cash').status,'declaration-only');assert.match(check(r,'evEbitda','cash').detail,/0 USD/);assert.equal(check(r,'evEbitda','debt').status,'partial');assert.match(check(r,'evEbitda','debt').detail,/not summed/);assert.equal(r.evEbitda.value,null);
  });
  it('does not convert unsupported currency units or imply an EPS scope from cash-only coverage',()=>{
    const p=fictionalDossierStatements();const cash=raw(p)['us-gaap'].CashAndCashEquivalentsAtCarryingValue;raw(p)['us-gaap']={CashAndCashEquivalentsAtCarryingValue:cash};const r=review(rebuilt(p));assert.equal(check(r,'pe','eps').status,'missing');assert.equal(check(r,'evEbitda','cash').status,'declaration-only');cash.units={EUR:cash.units.USD};assert.equal(check(review(rebuilt(p)),'evEbitda','cash').status,'missing');
  });
  it('does not label an annual fiscal declaration TTM or derive EBITDA from other statements',()=>{
    const r=review();assert.match(check(r,'pe','eps').detail,/2025-01-01 to 2025-12-31/);assert.match(check(r,'pe','basis').detail,/not automatically trailing twelve months/);assert.match(check(r,'evEbitda','ebitda').detail,/Operating income and operating cash flow are not substitutes/);
  });
  it('uses no ambient clock, provider or persistence and copies no caller-owned financial references',t=>{
    const p=fictionalDossierStatements(),before=JSON.stringify(p);t.mock.method(Date,'now',()=>{throw Error('Clock forbidden');});t.mock.method(globalThis,'fetch',()=>{throw Error('Network forbidden');});const r=review(p);assert.equal(r.status,'withheld');r.statementAdmission.snapshots[0].observations[0].value=999;assert.equal(JSON.stringify(p),before);
  });
});
