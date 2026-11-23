import test from 'node:test';
import assert from 'node:assert/strict';
import {fictionalSecDossier} from '../../qa/fixtures/sec-dossier.fictional.mjs';
import {connectSecDossierSources,retainDossierFacts} from '../../shared/secDossierConnection.js';
import {admitSecDossierPayload} from './secDossierConnection';
import {reviewDossierOperating} from './dossierOperating';

test('SEC connector binds original declarations to the dossier without promoting classification or eligibility',()=>{
  const packet=fictionalSecDossier(),before=JSON.stringify(packet);
  const c=admitSecDossierPayload('DEMO',{ok:true,cacheStatus:'miss',packet})!;
  assert(c);assert.equal(c.cik,'0000000001');assert.equal(c.assetClass,'unknown');assert.equal(c.issuerMappingVerified,false);assert.equal(c.grantsDecisionEligibility,false);assert.equal(c.grantsValuationEligibility,false);
  const r=reviewDossierOperating('DEMO',c.request,c.statements,c.operations);
  assert.equal(r.operating.status,'conditional');assert(r.operating.sourceRows.some(o=>o.metric==='net_income_loss'&&o.value===-8));
  assert.equal(r.valuation.statementAdmission.status,'conditional');assert(r.valuation.statementAdmission.snapshots.some(s=>s.observations.some(o=>o.metric==='cash_equivalents')));
  assert.equal(r.valuation.pe.value,null);assert.equal(r.financials.snapshot?.observations.length,0);
  assert.equal(JSON.stringify(packet),before);assert.equal(c.operations?.entries.length,2);assert(c.statements!.entries.length<=3);
});
test('SEC connector rejects issuer disagreement, duplicate directory declarations and altered envelopes',()=>{
  for(const edit of [(p:any)=>p.symbol='OTHER',(p:any)=>p.directory.push({...p.directory[0]}),(p:any)=>p.directory[0].cik_str=2,(p:any)=>p.submissions.cik=2,(p:any)=>p.submissions.tickers=['OTHER'],(p:any)=>p.submissions.tickers.push('DEMO'),(p:any)=>p.facts.cik=2,(p:any)=>p.private='do-not-echo',(p:any)=>p.retrievedAt='2026-11-15T12:00:00Z']){
    const p=fictionalSecDossier();edit(p);const r=connectSecDossierSources('DEMO',p);assert.equal(r.connection,null);assert(!JSON.stringify(r).includes('do-not-echo'));
  }
  assert.equal(admitSecDossierPayload('DEMO',{ok:true,cacheStatus:'miss',packet:fictionalSecDossier(),grantsDecisionEligibility:true}),null);
});
test('newest malformed or conflicting facts are retained and withheld, never replaced with older success',()=>{
  const p=fictionalSecDossier(),rows=p.facts.facts['us-gaap'].NetIncomeLoss.units.USD;
  rows.push({...rows[0],val:999});
  const c=connectSecDossierSources('DEMO',p).connection!;
  assert(c);assert.equal((c.operations!.source as any).facts.facts['us-gaap'].NetIncomeLoss.units.USD.length,3);
  const review=reviewDossierOperating('DEMO',c.request,c.statements,c.operations);
  assert(!review.operating.sourceRows.some(o=>o.metric==='net_income_loss'&&o.period.end==='2025-12-31'));
  assert(review.operating.sourceRows.some(o=>o.metric==='net_income_loss'&&o.period.end==='2024-12-31'));
});
test('oversized or simulated sources cannot be trimmed into apparently supported declarations',()=>{
  const p=fictionalSecDossier();(p.facts as any).simulated=true;assert.equal(retainDossierFacts(p.facts),null);
  const q=fictionalSecDossier(),rows=q.facts.facts['us-gaap'].NetIncomeLoss.units;rows.EUR=Array(501).fill(rows.USD[0]);assert.equal(retainDossierFacts(q.facts),null);
  const e=fictionalSecDossier();e.facts.facts={'us-gaap':{},dei:{}};const r=connectSecDossierSources('DEMO',e);assert.equal(r.status,'unavailable');assert.equal(r.code,'NO_SUPPORTED_OBSERVATIONS');assert(r.connection);assert.equal(r.connection.operations,null);
});
test('a newer unclosed filing window withholds its metric rather than resurrecting an older vintage',()=>{
  const p=fictionalSecDossier(),rows=p.facts.facts['us-gaap'].NetIncomeLoss.units.USD;
  rows.push({...rows[0],accn:'0000000001-26-000002',filed:'2026-11-14',val:999});
  const c=connectSecDossierSources('DEMO',p).connection!;
  const latest=c.operations!.entries.find(e=>e.period.end==='2025-12-31')!.receipt as any;
  assert(!latest.observations.some((o:any)=>o.metric==='net_income_loss'));
  assert(latest.issues.some((i:any)=>i.code==='PUBLICATION_WINDOW_UNCLOSED'));
});
