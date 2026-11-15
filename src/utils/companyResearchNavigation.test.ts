import test from 'node:test';
import assert from 'node:assert/strict';
import {readOpportunityView,opportunityViewParams,companyResearchHref,opportunityReturnHref,readResearchSelection} from './companyResearchNavigation';

test('research selection never lets a malformed explicit company fall back to a holding',()=>{
 for(const query of ['research_symbol=%3Cscript%3E','research_symbol=','research_symbol=AMD&research_symbol=NVDA','research_symbol=amd']){
  assert.deepEqual(readResearchSelection(new URLSearchParams(query+'&portfolio_symbol=NVDA')),{symbol:null,invalid:true});
 }
 assert.deepEqual(readResearchSelection(new URLSearchParams('research_symbol=AMD&portfolio_symbol=NVDA')),{symbol:'AMD',invalid:false});
 assert.deepEqual(readResearchSelection(new URLSearchParams('portfolio_symbol=NVDA')),{symbol:'NVDA',invalid:false});
 assert.deepEqual(readResearchSelection(new URLSearchParams()),{symbol:null,invalid:false});
});
test('scanner views round-trip supported statuses and bounded display limits',()=>{
 for(const status of ['all','needs-data','monitor','research-candidate','excluded'] as const)for(const limit of [20,40,80,200]){
  const view={query:'AMD components',status,limit};assert.deepEqual(readOpportunityView(opportunityViewParams(view)),view);
 }
});
test('ambiguous and unsupported scanner inputs do not become view authority',()=>{
 for(const limit of ['0','1','21','-20','1e2','Infinity','1000'])assert.equal(readOpportunityView(new URLSearchParams('opportunity_limit='+limit)).limit,20);
 assert.deepEqual(readOpportunityView(new URLSearchParams('opportunity_q=first&opportunity_q=second&opportunity_status=buy&opportunity_limit=40&opportunity_limit=80')),{query:'',status:'all',limit:20});
 assert.equal(readOpportunityView(new URLSearchParams({opportunity_q:'A'.repeat(200)+'\u0000'})).query.length,80);
});
test('unheld company links use a separate symbol and only view-safe state',()=>{
 const view={query:'AMD',status:'needs-data' as const,limit:40};
 const url=new URL(companyResearchHref('AMD',view)!,'https://example.invalid');
 assert.equal(url.pathname,'/portfolio');assert.equal(url.searchParams.get('research_symbol'),'AMD');
 assert.equal(url.searchParams.has('portfolio_symbol'),false);assert.equal(url.searchParams.get('portfolio_tab'),'research');
 assert.deepEqual(readOpportunityView(url.searchParams),view);
 for(const symbol of ['<script>','A/B','nvda','A'.repeat(16)])assert.equal(companyResearchHref(symbol,view),null);
});
test('return links cannot redirect outside Opportunities or serialize unrelated inputs',()=>{
 const params=new URLSearchParams('opportunity_q=AMD&opportunity_status=monitor&opportunity_limit=80&returnTo=https://evil.invalid&quantity=999&notes=private&token=private&portfolio_symbol=NVDA&research_symbol=AMD');
 const path=opportunityReturnHref(params);const url=new URL(path,'https://example.invalid');
 assert.equal(url.pathname,'/opportunities');assert.equal(url.origin,'https://example.invalid');
 assert.deepEqual([...url.searchParams.keys()].sort(),['opportunity_limit','opportunity_q','opportunity_status']);
 assert.equal(path.includes('private'),false);assert.equal(path.includes('NVDA'),false);
 assert.equal(opportunityReturnHref(new URLSearchParams('returnTo=https://evil.invalid')),'/opportunities');
});
