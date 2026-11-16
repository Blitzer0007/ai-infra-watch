import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarRecordContext,inboxRecordContext} from './reviewRecordContext';
import type {CalendarRevision} from './catalystCalendar';
import type {InboxItem} from './alertInboxAdapter';
const event=(id:string,title:string):CalendarRevision=>({event:{
  id,symbol:'FICT',kind:'earnings',title,date:'2026-11-12',precision:'date-only',timeZone:null,
  confirmation:'estimated',confirmationEvidence:null,source:'Fictional calendar',sourceUrl:'https://example.com/event',
  publishedAt:'2026-11-08T12:00:00Z',retrievedAt:'2026-11-08T13:00:00Z',supersedesId:null,issues:['Unverified issuer confirmation'],
},supersededBy:null,lineageIssue:null});
const inbox=(id:string,origin:InboxItem['origin'],state:InboxItem['deliveryState']):InboxItem=>({
 id,episodeId:'fictional-episode',origin,symbol:'FICT',severity:origin==='browser'?'high':null,title:'Fictional notice',
 explanation:'Fictional browser trigger',observedAt:'2026-11-08T11:00:00Z',deliveryState:state,providerMessageId:null,
 reconciliationRequired:false,source:'Fixture'
});
test('two same-symbol events retain distinct clicked titles and no invented time',()=>{
 const a=calendarRecordContext(event('a','First fictional event'));
 const b=calendarRecordContext(event('b','Second fictional event'));
 assert.equal(a?.title,'First fictional event');assert.equal(b?.title,'Second fictional event');
 assert.equal(b?.precision,'date-only');assert.equal(b?.confirmationEvidence,null);
});
test('correction ambiguity and bounded versions survive without leaking token URLs',()=>{
 const row=event('b','Corrected');row.lineageIssue='Unresolved correction';
 row.event.sourceUrl='https://example.com/event?access_token=private';
 row.event.issues=['Bearer fictional-private-secret'];
 const ctx=calendarRecordContext(row,Array.from({length:8},(_,i)=>event(String(i),'Prior')));
 assert.equal(ctx?.sourceUrl,null);assert.equal(ctx?.lineageIssue,'Unresolved correction');
 assert.equal(ctx?.priorVersions.length,5);assert.equal(ctx?.earlierVersionsOmitted,true);
 assert.ok(!JSON.stringify(ctx).includes('fictional-private-secret'));assert.ok(!JSON.stringify(ctx).includes('access_token'));
});
test('browser detections and server delivery remain separate without raw IDs',()=>{
 const a=inboxRecordContext(inbox('a','browser','unknown'));
 const b=inboxRecordContext(inbox('b','reentry-server','accepted'));
 assert.equal(a?.sourceOrigin,'browser');assert.equal(a?.messageReference,'none');
 assert.match(b?.explanation||'',/Original trigger and message text are absent/);
 assert.ok(!JSON.stringify(b).includes('fictional-episode'));
});
test('message acceptance is not a read receipt, and contradiction is not acceptance',()=>{
 const item=inbox('a','reentry-server','accepted');item.providerMessageId='42';
 assert.equal(inboxRecordContext(item)?.messageReference,'provider-accepted-not-read');
 item.deliveryState='uncertain';item.reconciliationRequired=true;
 assert.equal(inboxRecordContext(item)?.messageReference,'unconfirmed');
 assert.ok(!JSON.stringify(inboxRecordContext(item)).includes('"42"'));
});
test('unknown symbol or invalid date cannot become record context',()=>{
 const a=event('a','Title');a.event.symbol='';assert.equal(calendarRecordContext(a),null);
 const b=inbox('b','browser','unknown');b.observedAt='not-a-date';assert.equal(inboxRecordContext(b),null);
});
