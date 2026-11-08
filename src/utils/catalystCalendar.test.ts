import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDayInZone, captureEarningsCalendar, catalystRange, MAX_CATALYST_EVENTS, publicCalendarUrl, resolveCatalystRevisions, selectCatalystEvents, unavailableCatalystSnapshot, validCalendarDay, validCalendarInstant } from './catalystCalendar';

const received = '2026-11-08T12:00:00Z';
const nowMs = Date.parse(received);
const event = (overrides: Record<string, unknown> = {}) => ({ id:'report-1', symbol:'FICT', kind:'earnings', title:'Fictional issuer results', date:'2026-11-12', source:'Fictional issuer', sourceUrl:'https://example.com/investors/results', confirmation:'confirmed', confirmationBasis:'issuer', publishedAt:'2026-11-01T12:00:00Z', retrievedAt:'2026-11-08T10:00:00Z', ...overrides });
const capture = (rows: unknown[], rest: Record<string, unknown> = {}) => captureEarningsCalendar({ ok:true, source:'Fictional feed', upcoming:rows, ...rest }, received);
const select = (rows: unknown[], overrides = {}) => selectCatalystEvents(capture(rows), { nowMs, days:30, timeZone:'UTC', ...overrides });

test('legacy feed dates remain estimates; source coverage and event time are not inferred', () => {
  const snapshot = capture([{ id:'earnings:FICT:2026-11-12', symbol:'FICT', date:'2026-11-12', hour:'amc' }], { lookahead_days:14, as_of:received });
  assert.equal(snapshot.status,'partial');
  assert.equal(snapshot.events[0].confirmation,'estimated');
  assert.equal(snapshot.events[0].precision,'date-only');
  assert.equal(snapshot.events[0].retrievedAt,null);
  assert.equal(snapshot.events[0].timeZone,null);
  assert.equal(snapshot.sourceCoverage,'unknown');
  assert.equal(snapshot.requestedLookaheadDays,14);
  assert.equal(snapshot.responseAsOf,received);
});
test('confirmed rows require issuer/regulator evidence with ordered source timestamps', () => {
  assert.equal(capture([event()]).events[0].confirmation,'confirmed');
  assert.equal(capture([event({confirmationBasis:'regulator'})]).events[0].confirmationEvidence,'regulator');
  for (const missing of [{ sourceUrl:null },{ confirmationBasis:'provider' },{ publishedAt:null },{ retrievedAt:null },{ publishedAt:'2026-11-09T00:00:00Z' },{ retrievedAt:'2026-10-31T00:00:00Z' },{ retrievedAt:'2026-11-09T00:00:00Z' }]) {
    assert.equal(capture([event(missing)]).events[0].confirmation,'estimated');
  }
});
test('date validation rejects normalization, impossible dates, and timezone-free instants', () => {
  for (const date of ['2026-02-29','2026-11-31','2026-13-01','2026-1-01','invalid']) assert.equal(validCalendarDay(date),false);
  assert.equal(validCalendarDay('2028-02-29'),true);
  for (const date of ['2026-11-12T12:00:00','2026-11-12T24:00:00Z','2026-02-30T12:00:00Z','2026-11-12T12:99:00Z']) assert.equal(validCalendarInstant(date),false);
  assert.equal(validCalendarInstant('2026-11-12T10:30:00+05:30'),true);
  assert.throws(() => captureEarningsCalendar({},'2026-11-08'));
  assert.equal(capture([event({date:'2026-11-31'}),event({id:'other',date:'2026-11-12T12:00:00'})]).rejectedRows,2);
});
test('empty success is distinct from unavailable/malformed responses', () => {
  assert.equal(capture([]).status,'available');
  assert.equal(capture([]).sourceCoverage,'unknown');
  assert.equal(unavailableCatalystSnapshot().status,'unavailable');
  for (const payload of [null,{},[],{ok:false,upcoming:[]},{ok:true,upcoming:null}]) assert.equal(captureEarningsCalendar(payload,received).status,'unavailable');
  assert.equal(captureEarningsCalendar({ok:true,upcoming:[event()]},received,false).events.length,0);
});
test('withholds oversized snapshots, invalid symbols, long IDs, and malformed rows', () => {
  const large = capture(Array.from({length:MAX_CATALYST_EVENTS+1},(_,i)=>event({id:String(i)})));
  assert.equal(large.status,'unavailable'); assert.equal(large.events.length,0);
  const bad = capture([null,5,event({symbol:'INVALID/PAIR'}),event({id:'x'.repeat(161)})]);
  assert.equal(bad.events.length,0); assert.equal(bad.rejectedRows,4);
});
test('exact duplicate IDs deduplicate and conflicting IDs are withheld in either arrival order', () => {
  assert.equal(capture([event(),event()]).events.length,1);
  for (const rows of [[event(),event({date:'2026-11-13'})],[event({date:'2026-11-13'}),event()]]) {
    const result = capture(rows); assert.equal(result.events.length,0); assert.equal(result.rejectedRows,2); assert.match(result.issues.join(' '),/conflicting/);
  }
  assert.equal(capture([event(),event({source:'Independent source'})]).events.length,2);
});
test('allows only HTTPS links without credentials, queries or fragments and selects metadata only', () => {
  for (const url of ['javascript:alert(1)','http://example.com','https://user:secret@example.com','https://example.com/?token=private','https://example.com/#private']) assert.equal(publicCalendarUrl(url),null);
  const snapshot=capture([event({sourceUrl:'https://example.com/?api_key=fixture-secret',token:'fixture-secret',chat_id:123,rawBody:'private-destination'})],{notification:{token:'fixture-secret'}});
  assert.equal(snapshot.events[0].sourceUrl,null);
  assert.doesNotMatch(JSON.stringify(snapshot),/fixture-secret|chat_id|private-destination/);
});
test('does not infer future response timestamps or claimed lookahead/coverage', () => {
  const result=capture([],{as_of:'2026-11-09T00:00:00Z',lookahead_days:10000,coverage:{complete:true}});
  assert.equal(result.responseAsOf,null); assert.equal(result.requestedLookaheadDays,null); assert.equal(result.sourceCoverage,'unknown');
});
test('explicit corrections replace earlier versions while preserving their history', () => {
  const rows=capture([event(),event({id:'report-2',date:'2026-11-14',supersedesId:'report-1',publishedAt:'2026-11-07T12:00:00Z'})]);
  const revisions=resolveCatalystRevisions(rows.events);
  assert.equal(revisions.find(row=>row.event.id==='report-1')?.supersededBy,'report-2');
  assert.equal(revisions.length,2);
  assert.deepEqual(selectCatalystEvents(rows,{nowMs,days:30,timeZone:'UTC'}).map(row=>row.event.id),['report-2']);
});
test('cancellation remains visible, replaces a confirmed event only with confirmation evidence', () => {
  const cancellation=event({id:'cancel-1',confirmation:'cancelled',supersedesId:'report-1',publishedAt:'2026-11-07T12:00:00Z'});
  assert.deepEqual(select([event(),cancellation]).map(row=>row.event.confirmation),['cancelled']);
  const unverified=select([event(),{...cancellation,confirmationBasis:null}]);
  assert.equal(unverified.length,2); assert.ok(unverified.some(row=>row.lineageIssue));
  assert.equal(capture([{...cancellation,confirmationBasis:null}]).events[0].confirmationEvidence,null);
});
test('never guesses revisions from a matching symbol/date', () => {
  assert.equal(select([event(),event({id:'other'})]).length,2);
  const invalid=[{symbol:'DEMO'},{kind:'guidance'},{source:'Other source'},{publishedAt:'2026-10-01T00:00:00Z'},{sourceUrl:null},{supersedesId:'missing'},{confirmation:'estimated',confirmationBasis:null}];
  for (const overrides of invalid) {
    const rows=select([event(),event({id:'changed',supersedesId:'report-1',publishedAt:'2026-11-07T12:00:00Z',...overrides})]);
    assert.equal(rows.length,2); assert.ok(rows.some(row=>row.lineageIssue));
  }
});
test('conflicting correction branches do not silently pick the latest', () => {
  const rows=select([event(),event({id:'a',supersedesId:'report-1',publishedAt:'2026-11-06T12:00:00Z'}),event({id:'b',supersedesId:'report-1',publishedAt:'2026-11-07T12:00:00Z'})]);
  assert.equal(rows.length,3); assert.equal(rows.filter(row=>row.lineageIssue).length,2);
});
test('strict publication order prevents cycles and same-time revisions', () => {
  const rows=select([event({supersedesId:'b'}),event({id:'b',supersedesId:'report-1'})]);
  assert.equal(rows.length,2); assert.ok(rows.every(row=>row.lineageIssue));
});
test('revision chains remain linked when the newest event moves beyond the requested view', () => {
  const rows=[event(),event({id:'b',date:'2027-01-01',supersedesId:'report-1',publishedAt:'2026-11-06T12:00:00Z'}),event({id:'c',date:'2027-02-01',supersedesId:'b',publishedAt:'2026-11-07T12:00:00Z'})];
  assert.equal(select(rows).length,0);
  assert.deepEqual(select(rows,{days:180}).map(row=>row.event.id),['c']);
  assert.equal(resolveCatalystRevisions(capture(rows).events).filter(row=>row.supersededBy).length,2);
});
test('ranges include today and exactly N calendar days through DST changes', () => {
  for (const days of [30,90,180] as const) {
    const range=catalystRange(Date.parse('2026-10-31T23:30:00Z'),days,'America/New_York');
    assert.equal((Date.parse(range.to)-Date.parse(range.from))/86400000+1,days);
  }
  assert.equal(calendarDayInZone(Date.parse('2026-11-08T01:00:00Z'),'America/New_York'),'2026-11-07');
  assert.equal(calendarDayInZone(Date.parse('2026-11-08T01:00:00Z'),'Asia/Kolkata'),'2026-11-08');
  assert.throws(()=>catalystRange(NaN,30)); assert.throws(()=>catalystRange(nowMs,30,'bad/zone'));
});
test('date-only days never shift timezone; exact instants are filtered by review day and actual time', () => {
  const clock=Date.parse('2026-11-08T01:00:00Z');
  const rows=[event({id:'day',date:'2026-11-07'}),event({id:'instant',date:'2026-11-08T02:00:00Z',timeZone:'UTC'}),event({id:'past',date:'2026-11-08T00:00:00Z',timeZone:'UTC'})];
  assert.deepEqual(select(rows,{nowMs:clock,timeZone:'America/New_York'}).map(row=>row.event.id),['day','instant']);
  assert.deepEqual(select(rows,{nowMs:clock,timeZone:'Asia/Kolkata'}).map(row=>row.event.id),['instant']);
});
test('range end, certainty and query filters operate on the selected snapshot', () => {
  const end=catalystRange(nowMs,30,'UTC').to;
  const after=new Date(Date.parse(end)+86400000).toISOString().slice(0,10);
  const rows=[event({date:end}),event({id:'late',date:after}),event({id:'estimate',symbol:'DEMO',confirmation:'estimated'})];
  assert.equal(select(rows).length,2);
  assert.deepEqual(select(rows,{confirmation:'confirmed'}).map(row=>row.event.id),['report-1']);
  assert.deepEqual(select(rows,{query:'demo'}).map(row=>row.event.id),['estimate']);
  assert.equal(select(rows,{query:'no match'}).length,0);
});
test('mixed precision sorting is deterministic and does not imply midnight', () => {
  const rows=[event({id:'z',date:'2026-11-12T10:00:00Z'}),event({id:'m'}),event({id:'a',date:'2026-11-12T09:00:00Z'})];
  assert.deepEqual(select(rows).map(row=>row.event.id),['m','a','z']);
  assert.deepEqual(select([...rows].reverse()).map(row=>row.event.id),['m','a','z']);
});
test('unknown kinds and invalid correction references cannot alias known event IDs', () => {
  const snapshot=capture([event({kind:'unsupported',supersedesId:'x'.repeat(161)})]);
  assert.equal(snapshot.events[0].kind,'other');
  assert.equal(snapshot.events[0].supersedesId,null);
  assert.ok(snapshot.events[0].issues.some(issue=>issue.includes('correction reference')));
});
test('an explicitly estimated date never presents issuer confirmation evidence', () => {
  const result=capture([event({confirmation:'estimated'})]);
  assert.equal(result.events[0].confirmation,'estimated');
  assert.equal(result.events[0].confirmationEvidence,null);
});
test('simulated feed/row metadata cannot become a real confirmed catalyst or healthy empty data', () => {
  for (const simulated of [true,'true',1]) {
    const result=capture([event()],{simulated});
    assert.equal(result.status,'unavailable'); assert.equal(result.events.length,0);
    const row=capture([event({simulated})]);
    assert.equal(row.status,'unavailable'); assert.equal(row.events.length,0);
  }
  assert.equal(capture([event({status:'simulated'})]).status,'unavailable');
  assert.equal(capture([event()],{status:'simulated'}).status,'unavailable');
  const mixed=capture([event(),event({id:'fake',simulated:true})]);
  assert.equal(mixed.status,'partial'); assert.equal(mixed.events.length,1); assert.equal(mixed.rejectedRows,1);
  assert.equal(capture([event({simulated:false})],{simulated:false}).events[0].confirmation,'confirmed');
});
