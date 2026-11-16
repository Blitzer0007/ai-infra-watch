import test from 'node:test';
import assert from 'node:assert/strict';
import {readCalendarView,calendarViewParams,readInboxView,inboxViewParams,reviewCompanyHref,reviewReturnHref,canonicalReviewHref,readLocalReviewQuery,boundedReviewQuery,createReviewReadingSession} from './reviewWorkspaceNavigation';

test('calendar range/certainty/timezone round-trip without changing calendar semantics',()=>{
 for(const days of [30,90,180] as const)for(const confirmation of ['all','confirmed','estimated','cancelled'] as const)for(const zone of ['local','UTC','Asia/Kolkata','America/New_York'] as const){
  const view={days,confirmation,zone};assert.deepEqual(readCalendarView(calendarViewParams(view)),view);
 }
});
test('malformed or ambiguous calendar fields cannot extend coverage or supply a timezone',()=>{
 const params=new URLSearchParams('calendar_days=999&calendar_certainty=confirmed&calendar_certainty=cancelled&calendar_zone=Europe/Paris');
 assert.deepEqual(readCalendarView(params),{days:30,confirmation:'all',zone:'local'});
 assert.equal(readCalendarView(new URLSearchParams('calendar_days=90&calendar_days=180')).days,30);
 assert.equal(readCalendarView(new URLSearchParams(),'UTC').zone,'UTC');
});
test('inbox view round-trips known windows, evidence states and local acknowledgement filters',()=>{
 for(const days of [7,30] as const)for(const state of ['all','accepted','rejected','uncertain','sending','unknown'] as const)for(const read of ['all','read','unread'] as const){
  const view={days,state,read};assert.deepEqual(readInboxView(inboxViewParams(view)),view);
 }
 assert.deepEqual(readInboxView(new URLSearchParams('inbox_days=365&inbox_state=delivered&inbox_read=accepted')),{days:7,state:'all',read:'all'});
 assert.equal(readInboxView(new URLSearchParams('inbox_state=accepted&inbox_state=unknown')).state,'all');
});
test('company routes bind only original valid symbols, closed origins and enum view options',()=>{
 const incoming=new URLSearchParams('calendar_days=90&calendar_certainty=cancelled&calendar_zone=UTC&query=private+search&title=private+alert&token=private&notes=private&returnTo=https://evil.invalid&episodeId=private&cursor=private');
 const href=reviewCompanyHref('FICT','calendar',incoming)!;
 assert(!href.includes('private'));const url=new URL(href,'https://example.invalid');
 assert.equal(url.pathname,'/portfolio');assert.equal(url.searchParams.get('research_symbol'),'FICT');assert.equal(url.searchParams.get('portfolio_symbol'),null);
 assert.equal(url.searchParams.get('research_from'),'calendar');
 assert.deepEqual([...url.searchParams.keys()].sort(),['calendar_certainty','calendar_days','calendar_zone','portfolio_tab','research_from','research_symbol']);
 assert.deepEqual(reviewReturnHref(url.searchParams),{href:'/calendar?calendar_days=90&calendar_certainty=cancelled&calendar_zone=UTC',label:'Return to Calendar'});
 for(const symbol of ['', 'fict','<script>','FICT/../../','F'.repeat(16)])assert.equal(reviewCompanyHref(symbol,'calendar',incoming),null);
 assert.equal(reviewCompanyHref('FICT','external' as never,incoming),null);
});
test('delivery records, destinations and cursor references never enter inbox links or returns',()=>{
 const p=new URLSearchParams('inbox_days=30&inbox_state=uncertain&inbox_read=unread&query=private&chat_id=private&providerMessageId=private&cursor=private');
 const href=reviewCompanyHref('FICT','alerts',p)!;assert(!href.includes('private'));
 const back=reviewReturnHref(new URL(href,'https://example.invalid').searchParams)!;
 assert.equal(back.href,'/alerts?inbox_days=30&inbox_state=uncertain&inbox_read=unread');
 assert.equal(back.label,'Return to Alert inbox');
});
test('ambiguous/unrecognized origins cannot turn into an external return',()=>{
 for(const query of ['research_from=calendar&research_from=alerts','research_from=https://evil.invalid','returnTo=/alerts','research_from=opportunities'])assert.equal(reviewReturnHref(new URLSearchParams(query)),null);
});
test('SPA destinations are rebuilt from the same closed contract',()=>{
 for(const href of ['https://evil.invalid/alerts','//evil.invalid/alerts','/alerts/../../settings','/settings','/portfolio?portfolio_tab=holdings','/portfolio?portfolio_tab=research&research_symbol=FICT&research_from=calendar&research_symbol=AMD'])assert.equal(canonicalReviewHref(href),null);
 const href='/portfolio?portfolio_tab=research&research_symbol=FICT&research_from=alerts&inbox_days=30&token=private#private';
 assert.equal(canonicalReviewHref(href),'/portfolio?inbox_days=30&inbox_state=all&inbox_read=all&portfolio_tab=research&research_symbol=FICT&research_from=alerts');
 assert.equal(canonicalReviewHref('/alerts?cursor=private&inbox_days=30'),'/alerts?inbox_days=30&inbox_state=all&inbox_read=all');
});
test('searches are bounded local browser-entry state and never interpreted as route authority',()=>{
 assert.equal(boundedReviewQuery('a\u0000\n'+ 'b'.repeat(100)).length,80);
 assert.equal(readLocalReviewQuery({aiwReviewQuery:{version:1,workspace:'alerts',query:'private search'}},'alerts'),'private search');
 for(const state of [null,[],{aiwReviewQuery:{version:2,workspace:'alerts',query:'x'}},{aiwReviewQuery:{version:1,workspace:'calendar',query:'x'}},{aiwReviewQuery:{version:1,workspace:'alerts',query:77}}])assert.equal(readLocalReviewQuery(state,'alerts'),null);
 const a=createReviewReadingSession(),b=createReviewReadingSession();a.expanded.add('local:private');assert.equal(b.expanded.size,0);assert.equal(a.href,'');
});
