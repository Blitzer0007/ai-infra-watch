import test from 'node:test';
import assert from 'node:assert/strict';
import { readHoldingNavigation, writeHoldingNavigation, validHoldingSymbol, HOLDING_FILTERS, HOLDING_SORTS } from './holdingDetailNavigation';
test('holding URL defaults preserve a plain list without opening detail',()=>{
  assert.deepEqual(readHoldingNavigation(new URLSearchParams()),{filter:'All',sort:'Symbol',detail:null});
});
test('holding status and sort deep links round-trip every supported option',()=>{
  for(const filter of HOLDING_FILTERS)for(const sort of HOLDING_SORTS){
    const params=writeHoldingNavigation(new URLSearchParams('portfolio_tab=holdings'),{filter,sort,detail:'NVDA'});
    assert.deepEqual(readHoldingNavigation(params),{filter,sort,detail:'NVDA'});
  }
});
test('detail symbols are bounded and never inferred from the selected holding',()=>{
  for(const symbol of ['NVDA','BRK.B','ABC-A'])assert.equal(validHoldingSymbol(symbol),true);
  for(const symbol of [null,'','nvda','<script>','A/B','A'.repeat(16)])assert.equal(validHoldingSymbol(symbol),false);
  assert.equal(readHoldingNavigation(new URLSearchParams('portfolio_tab=holdings&portfolio_symbol=NVDA')).detail,null);
});
test('unknown filter, sort and malformed detail parameters fail to list defaults',()=>{
  assert.deepEqual(readHoldingNavigation(new URLSearchParams('portfolio_tab=holdings&portfolio_status=private&portfolio_sort=unknown&portfolio_detail=%3Cscript%3E')),{filter:'All',sort:'Symbol',detail:null});
});
test('detail parameter cannot open a dialog in another portfolio workspace',()=>{
  const params=new URLSearchParams('portfolio_tab=evidence&portfolio_detail=NVDA');
  assert.equal(readHoldingNavigation(params).detail,null);
  assert.equal(writeHoldingNavigation(params,{filter:'All',sort:'Symbol',detail:'NVDA'}).has('portfolio_detail'),false);
});
test('writing view state preserves legacy query keys without mutating the input',()=>{
  const original=new URLSearchParams('portfolio_tab=holdings&portfolio_q=NVDA&portfolio_group=Compute&portfolio_symbol=NVDA&other=kept');
  const next=writeHoldingNavigation(original,{filter:'Needs attention',sort:'Attention',detail:'NVDA'});
  assert.equal(original.has('portfolio_detail'),false);assert.equal(next.get('portfolio_q'),'NVDA');assert.equal(next.get('portfolio_group'),'Compute');assert.equal(next.get('other'),'kept');
  const closed=writeHoldingNavigation(next,{filter:'Needs attention',sort:'Attention',detail:null});
  assert.equal(closed.has('portfolio_detail'),false);assert.equal(closed.get('portfolio_status'),'Needs attention');assert.equal(closed.get('portfolio_sort'),'Attention');
});
