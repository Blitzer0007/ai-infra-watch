import test from 'node:test';
import assert from 'node:assert/strict';
import { readAlertInboxPage, deliveryEvidence } from './alertInbox.js';
const now=Date.parse('2026-11-08T12:00:00Z');
const config={url:'https://fixture.example',key:'fixture-key-only',recipient:'-12345'};
const row=(overrides={})=>({id:20,delivery_key:'private-episode-material',symbol:'FICT',status:'accepted',telegram_message_id:42,created_at:'2026-11-08T10:00:00Z',completed_at:'2026-11-08T10:01:00Z',...overrides});
const read=(rows,query={},options={})=>readAlertInboxPage({config,query,nowMs:now,fetchImpl:async()=>({ok:true,json:async()=>rows}),...options});
test('inbox executes one scoped SELECT-only request and redacts private/provider fields',async()=>{
  let calls=0;
  const result=await read([row({chat_id:config.recipient,last_error:'private-error',token:'private-token',payload:{destination:'private'}})],{}, {fetchImpl:async(url,init)=>{
    calls++;const u=new URL(url);assert.equal(u.pathname,'/rest/v1/reentry_telegram_deliveries');assert.equal(u.searchParams.get('chat_id'),'eq.'+config.recipient);assert.equal(u.searchParams.get('limit'),'101');assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.doesNotMatch(u.searchParams.get('select'),/chat_id|last_error|payload|token/);
    assert.deepEqual(u.searchParams.getAll('created_at'),['gte.2026-11-01T12:00:00.000Z','lte.2026-11-08T12:00:00.000Z']);
    return {ok:true,json:async()=>[row({chat_id:config.recipient,last_error:'private-error'})]};
  }});
  assert.equal(calls,1);assert.equal(result.items[0].deliveryState,'accepted');assert.match(result.items[0].id,/^server:[\w-]{43}$/);
  assert.doesNotMatch(JSON.stringify(result),/private-episode|private-error|private-token|-12345|fixture-key/);
  assert.equal(result.coverage,'partial');assert.equal(result.nextCursor,null);
});
test('provider acceptance requires an ID and is never a read receipt',()=>{
  assert.equal(deliveryEvidence(row()).deliveryState,'accepted');
  assert.match(deliveryEvidence(row()).explanation,/does not establish.*read/);
  for(const id of [null,0,-1,'42',Infinity])assert.equal(deliveryEvidence(row({telegram_message_id:id})).deliveryState,'uncertain');
});
test('known acceptance survives uncertain persistence; contradictory records require reconciliation',()=>{
  const accepted=deliveryEvidence(row({status:'uncertain'}));assert.equal(accepted.deliveryState,'accepted');assert.equal(accepted.reconciliationRequired,true);assert.match(accepted.explanation,/Do not resend/);
  for(const status of ['sending','rejected'])assert.equal(deliveryEvidence(row({status})).deliveryState,'unknown');
  assert.equal(deliveryEvidence(row({status:'rejected',telegram_message_id:null})).deliveryState,'rejected');
  assert.equal(deliveryEvidence(row({status:'sending',telegram_message_id:null})).reconciliationRequired,true);
});
test('empty read is available but still has limited source coverage',async()=>{
  const result=await read([]);assert.equal(result.ok,true);assert.equal(result.items.length,0);assert.equal(result.coverage,'partial');
});
test('missing recipient/configuration and invalid parameters fail before any request',async()=>{
  let calls=0;const fetchImpl=async()=>{calls++;throw new Error('not allowed');};
  for(const cfg of [{...config,recipient:''},{...config,key:''},{...config,recipient:'x,chat_id.neq.y'}])await assert.rejects(read([],{}, {config:cfg,fetchImpl}));
  for(const query of [{days:'0'},{days:'31'},{days:['7']},{recipient:'other'},{chat_id:'other'},{refresh:'true'},{notify:'1'},{cursor:'tampered'}])await assert.rejects(read([],query,{fetchImpl}),error=>error.status===400);
  assert.equal(calls,0);
});
test('read failure or malformed/contradictory data is unavailable, never an empty success',async()=>{
  await assert.rejects(read([],{}, {fetchImpl:async()=>({ok:false,json:async()=>{throw new Error('private');}})}));
  for(const rows of [{},[null],[row({id:0})],[row({symbol:'BAD/PAIR'})],[row({chat_id:'other-recipient'})],[row({created_at:'invalid'})],[row({created_at:'2026-10-01T00:00:00Z'})],[row({created_at:'2026-11-09T00:00:00Z'})],[row(),row()]])await assert.rejects(read(rows));
});
test('pagination uses a stable bounded window, signed keyset cursor, and recipient scope',async()=>{
  const first=await read(Array.from({length:101},(_,i)=>row({id:200-i})));
  assert.equal(first.items.length,100);assert.ok(first.nextCursor);
  let url='';const next=await read([row({id:100})],{cursor:first.nextCursor},{nowMs:now+1000,fetchImpl:async(value)=>{url=value;return {ok:true,json:async()=>[row({id:100})]};}});
  assert.equal(next.until,first.until);assert.equal(next.from,first.from);assert.match(new URL(url).searchParams.get('or'),/id.lt.101/);
  await assert.rejects(read([],{cursor:first.nextCursor+'x'}),error=>error.status===400);
  await assert.rejects(read([],{days:'30',cursor:first.nextCursor}),error=>error.status===400);
  await assert.rejects(read([],{cursor:first.nextCursor},{config:{...config,recipient:'-54321'}}),error=>error.status===400);
  await assert.rejects(read([],{cursor:first.nextCursor},{nowMs:now+31*60000}),error=>error.status===400);
  await assert.rejects(read([row({id:102})],{cursor:first.nextCursor}));
});
test('opaque secret keys stay in apikey only; no sender or RPC is called',async()=>{
  let calls=0;await read([],{}, {config:{...config,key:'sb_secret_fixture'},fetchImpl:async(url,init)=>{calls++;assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers.apikey,'sb_secret_fixture');assert.doesNotMatch(url,/rpc|telegram.org|scan/);return {ok:true,json:async()=>[]};}});assert.equal(calls,1);
});
test('pagination preserves PostgreSQL microseconds and does not discard sub-millisecond boundary rows',async()=>{
  const rows=Array.from({length:99},(_,i)=>row({id:300-i,created_at:'2026-11-08T10:00:00.124000+00:00'}));
  rows.push(row({id:201,created_at:'2026-11-08T10:00:00.123456+00:00'}),row({id:200,created_at:'2026-11-08T10:00:00.123455+00:00'}));
  const first=await read(rows);let url='';
  const next=await read([rows.at(-1)],{cursor:first.nextCursor},{fetchImpl:async(value)=>{url=value;return {ok:true,json:async()=>[rows.at(-1)]};}});
  assert.match(new URL(url).searchParams.get('or'),/123456\+00:00/);assert.equal(next.items.length,1);
  // Different microsecond timestamps can have IDs in either order.
  const valid=await read([row({id:1,created_at:'2026-11-08T10:00:00.123999Z'}),row({id:2,created_at:'2026-11-08T10:00:00.123001Z'})]);
  assert.equal(valid.items.length,2);
});
