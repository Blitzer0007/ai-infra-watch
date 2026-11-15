import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSecStatementObservations} from '../../shared/secStatementObservations.js';
import {admitDossierStatements,statementRows,formatStatementValue,type DossierStatementPacket} from './dossierStatements';
import {fictionalDossierStatements} from '../components/portfolio/CompanyDossierPreview';
const facts=()=>JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json','utf8')).facts;
const reference={symbol:'FICT',cik:'0000000001',assessedAt:'2026-11-14T12:00:00Z',source:{status:'not-configured' as const}};
const packet=():DossierStatementPacket=>{
  const base={symbol:'FICT',expectedCik:'0000000001',assessedAt:reference.assessedAt,retrievedAt:'2026-11-09T12:00:00Z',source:{status:'loaded',facts:facts()}};
  return {contractVersion:'company-dossier-statements-v2',...base,entries:[{start:null,end:'2025-12-31'},{start:'2025-01-01',end:'2025-12-31'},{start:null,end:'2026-02-10'}].map(period=>({period,receipt:buildSecStatementObservations({...base,period})}))};
};
describe('versioned dossier statement consumer',()=>{
  it('admits only bound scoped receipts and keeps units/bases in separate sections',()=>{
    const a=admitDossierStatements('FICT',reference,packet());assert.equal(a.status,'conditional');assert.equal(a.snapshots.length,3);assert.equal(statementRows(a,'Financial health').length,4);assert.equal(statementRows(a,'Valuation').length,6);assert.equal(a.verifiesSourceRecords,false);assert.equal(a.grantsValuationEligibility,false);assert.equal(a.aggregationEligibility,false);
  });
  it('keeps development fixture originals identical to the adapter test fixture',()=>assert.deepEqual(JSON.parse(readFileSync('src/data/companyStatements.fictional.json','utf8')),JSON.parse(readFileSync('qa/fixtures/sec-statements.fictional.json','utf8'))));
  it('isolates each fictional inspection to its own source copy without modifying the bundled fixture',()=>{
    const first=fictionalDossierStatements();(first.source as any).facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD[0].val=999;
    const second=fictionalDossierStatements();assert.equal((second.source as any).facts.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue.units.USD[0].val,25);assert.equal(admitDossierStatements('FICT',reference,first).status,'invalid');assert.equal(admitDossierStatements('FICT',reference,second).status,'conditional');
  });
  it('keeps unconnected states distinct from malformed or empty receipt packets',()=>{
    assert.equal(admitDossierStatements('FICT',null,null).status,'not-connected');
    for(const bad of [{},[],{...packet(),entries:[]}])assert.equal(admitDossierStatements('FICT',reference,bad).status,'invalid');
  });
  it('binds display identity, CIK and assessment to the existing dossier context',()=>{
    for(const change of [{symbol:'OTHER'},{expectedCik:'0000000002'},{assessedAt:'2026-11-14T12:00:01Z'}])assert.equal(admitDossierStatements('FICT',reference,{...packet(),...change}).status,'invalid');
    assert.equal(admitDossierStatements('NVDA',null,packet()).status,'invalid');
  });
  it('withholds every new figure when any receipt is forged or a field is widened',()=>{
    for(const edit of [(p:any)=>p.entries[1].receipt.observations[0].value++,(p:any)=>p.entries[0].receipt.grantsValuationEligibility=true,(p:any)=>p.private='do-not-echo']){const p=packet();edit(p);const a=admitDossierStatements('FICT',reference,p);assert.equal(a.status,'invalid');assert.deepEqual(a.snapshots,[]);assert(!JSON.stringify(a).includes('do-not-echo'));}
  });
  it('rejects duplicate periods regardless of object-key order and excessive scope',()=>{
    const p=packet();p.entries[1]={...p.entries[0],period:{end:'2025-12-31',start:null}};assert.equal(admitDossierStatements('FICT',reference,p).status,'invalid');
    const q=packet();q.entries.push(q.entries[0]);assert.equal(admitDossierStatements('FICT',reference,q).status,'invalid');
  });
  it('rejects malformed or cyclic period identifiers without serializing them',()=>{
    const cycle:any={};cycle.self=cycle;
    for(const value of [cycle,1n,{},'private-invalid-period']){const p=packet();(p.entries[0].period as any).start=value;assert.equal(admitDossierStatements('FICT',reference,p).status,'invalid');}
  });
  it('rejects shared-accession metadata conflicts across different requested periods',()=>{
    const p=packet(),source=(p.source as any).facts;
    for(const tag of ['WeightedAverageNumberOfSharesOutstandingBasic','WeightedAverageNumberOfDilutedSharesOutstanding','EarningsPerShareBasic','EarningsPerShareDiluted'])for(const rows of Object.values(source.facts['us-gaap'][tag].units) as any[])rows[0].fy=2024;
    p.entries=p.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:p.retrievedAt,source:p.source,period:e.period})}));
    const a=admitDossierStatements('FICT',reference,p);assert.equal(a.status,'invalid');assert(a.reason.includes('conflicts'));
  });
  it('preserves a genuine source timeout with no retrieval or admitted observations',()=>{
    const p=packet();p.source={status:'timeout'};p.retrievedAt=null;p.entries=p.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:null,source:p.source,period:e.period})}));
    const a=admitDossierStatements('FICT',reference,p);assert.equal(a.status,'needs-data');assert(a.snapshots.every(s=>s.status==='timeout'&&s.retrievedAt===null));assert.deepEqual(statementRows(a,'Valuation'),[]);
  });
  it('keeps a cash-only partial packet separate from unavailable share/EPS inputs',()=>{
    const p=packet(),raw=(p.source as any).facts;raw.facts={'us-gaap':{CashAndCashEquivalentsAtCarryingValue:raw.facts['us-gaap'].CashAndCashEquivalentsAtCarryingValue}};
    p.entries=p.entries.map(e=>({...e,receipt:buildSecStatementObservations({symbol:p.symbol,expectedCik:p.expectedCik,assessedAt:p.assessedAt,retrievedAt:p.retrievedAt,source:p.source,period:e.period})}));
    const a=admitDossierStatements('FICT',reference,p);assert.equal(a.status,'conditional');assert.equal(statementRows(a,'Financial health').length,1);assert.deepEqual(statementRows(a,'Valuation'),[]);
  });
  for(const [value,unit,want] of [[25,'USD','25 USD'],[0,'shares','0 shares'],[-.5,'USD/shares','-0.5 USD per share'],[1e-10,'USD/shares','1.0000e-10 USD per share'],[9,'shares','9 shares']] as const)it('preserves admitted units, zero, losses and tiny EPS in display',()=>assert.equal(formatStatementValue(value,unit),want));
  it('does not relabel unsupported or malformed values as observed zero',()=>{assert.equal(formatStatementValue(NaN,'shares'),'Unavailable');assert.equal(formatStatementValue(1,'ratio'),'Unavailable');assert.equal(formatStatementValue(null as any,'USD'),'Unavailable');});
});
