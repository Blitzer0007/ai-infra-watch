import test from 'node:test';
import assert from 'node:assert/strict';
import {admitRuleHistory} from '../../shared/ruleHistoryAdmission.js';
const NOW=Date.parse('2026-11-14T12:00:00Z');
function packet(){return {points:[{date:'2026-11-12',price:100,availableAt:'2026-11-12T21:00:00Z'}],provenance:{
  contractVersion:'retained-rule-history-v1',symbol:'FICT',currency:'USD',priceBasis:'raw-close',sourceMode:'retained-declarations',
  retrievedAt:'2026-11-14T11:00:00Z',corporateActions:'declared-none',expectedSessionDates:['2026-11-12']}};}
test('retained declarations support consistency only and never authenticate source or authorize decisions',()=>{
  const input=packet(),before=JSON.stringify(input),result=admitRuleHistory('FICT',input,NOW);
  assert.equal(result.eligible,true);assert.equal(result.verifiesSourceRecords,false);assert.equal(result.grantsDecisionEligibility,false);assert.equal(JSON.stringify(input),before);
});
for(const change of [{contractVersion:'other'},{symbol:'OTHER'},{currency:'EUR'},{priceBasis:'adjusted-close'},
  {sourceMode:'live'},{corporateActions:'verified'},{retrievedAt:'2026-11-15T12:00:00Z'},
  {expectedSessionDates:[]},{expectedSessionDates:['2026-11-12','2026-11-13']},
  {expectedSessionDates:['2026-11-12','2026-11-12']},{private:'must not echo'}]){
  test('incompatible original history declarations are withheld: '+JSON.stringify(change),()=>{
    const h=packet();Object.assign(h.provenance,change);const result=admitRuleHistory('FICT',h,NOW);
    assert.equal(result.eligible,false);assert(!JSON.stringify(result).includes('must not echo'));
  });
}
for(const change of [{availableAt:null},{availableAt:'2026-11-12'},
  {availableAt:'2026-11-14T11:01:00Z'},{date:'2026-11-11'}, {adjustedPrice:99},{price:0},{price:true},{price:Infinity}]){
  test('missing/future/mismatched bar availability cannot establish calendar coverage: '+JSON.stringify(change),()=>{
    const h=packet();Object.assign(h.points[0],change);assert.equal(admitRuleHistory('FICT',h,NOW).eligible,false);
  });
}
test('a complete flag alone is not a history contract',()=>{
  assert.equal(admitRuleHistory('FICT',{points:[{date:'2026-11-12',price:100}],coverage:{status:'complete'}},NOW).eligible,false);
});
test('a missing or malformed clock cannot admit retained history',()=>{
  for(const clock of [undefined,null,NaN,Infinity,-1,0.5])assert.equal(admitRuleHistory('FICT',packet(),clock).eligible,false);
});
