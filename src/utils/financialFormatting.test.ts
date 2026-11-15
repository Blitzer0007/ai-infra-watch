import test from 'node:test';
import assert from 'node:assert/strict';
import {formatPrice,formatPct} from '../utils';

test('unavailable Overview quotes cannot crash formatting or become zero',()=>{
 for(const input of [null,undefined,NaN,Infinity,-Infinity,false,'',[],{}]){
  assert.equal(formatPrice(input as any),'—');
  assert.equal(formatPct(input as any),'—');
 }
 assert.equal(formatPrice(0),'0.00');
 assert.equal(formatPct(0),'+0.00%');
});
test('tiny signed prices remain distinguishable from zero',()=>{
 for(const price of [1e-10,-1e-10]){
  assert.notEqual(formatPrice(price),'0.00');
  assert.equal(Number(formatPrice(price)),price);
 }
 assert.equal(formatPrice(1234.5),'1,234.50');
});
