import assert from 'node:assert/strict';
import test from 'node:test';
import {marketHistoryPacket} from './marketHistoryPacket';
const now='2026-11-24T12:00:00Z';
const point={date:'2026-11-23',price:100};

test('price display retains provider cache/stale/currency and original browser load time',()=>{
  const p=marketHistoryPacket('FICT',{symbol:'FICT',points:[point],provider:'yahoo',currency:'USD',stale:true,cached:true,cacheAgeMs:600000},now);
  assert.equal(p.symbol,'FICT');assert.equal(p.provider,'yahoo');assert.equal(p.currency,'USD');
  assert.equal(p.stale,true);assert.equal(p.cached,true);assert.equal(p.cacheAgeMs,600000);assert.equal(p.loadedAt,now);
  assert.deepEqual(p.points,[point]);assert.equal('accountingReconciled' in p,false);
});
test('missing declarations remain unknown instead of fresh verified USD',()=>{
  const p=marketHistoryPacket('FICT',{points:[point],provider:'private provider prose',currency:'usd',stale:'false',cacheAgeMs:-1},now);
  assert.equal(p.provider,null);assert.equal(p.currency,null);assert.equal(p.stale,null);assert.equal(p.cached,null);assert.equal(p.cacheAgeMs,null);
});
test('invalid dates future bars and coercible values cannot create zero-price or phantom chart points',()=>{
  const invalid=[{date:'2026-02-30',price:1},{date:'2026-11-25',price:1},{date:'2026-11-24T00:00:00Z',price:1},
    ...[null,false,'100',0,-1,NaN,Infinity].map(price=>({date:'2026-11-24',price}))];
  const p=marketHistoryPacket('FICT',{points:[...invalid,point]},now);
  assert.deepEqual(p.points,[point]);assert.equal(p.excludedPoints,invalid.length);
});
test('identical duplicate bars are collapsed; conflicting closes cannot silently win',()=>{
  const p=marketHistoryPacket('FICT',{points:[point,{date:'2026-11-20',price:99},point]},now);
  assert.deepEqual(p.points,[{date:'2026-11-20',price:99},point]);assert.equal(p.excludedPoints,1);
  assert.throws(()=>marketHistoryPacket('FICT',{points:[point,{...point,price:101}]},now),/conflicting/);
});
test('wrong-symbol empty oversized or invalid-clock responses are withheld',()=>{
  for(const body of [{symbol:'OTHER',points:[point]},{points:[]},{points:Array(20001).fill(point)},{}])
    assert.throws(()=>marketHistoryPacket('FICT',body,now));
  assert.throws(()=>marketHistoryPacket('FICT',{points:[point]},'bad clock'));
});
