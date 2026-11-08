import test from 'node:test';
import assert from 'node:assert/strict';
import { INBOX_READ_KEY, loadInboxReadIds, normalizeServerInbox, readBrowserInbox, saveInboxReadIds, selectInboxItems } from './alertInboxAdapter';
const now=Date.parse('2026-11-08T12:00:00Z');
const local=(more={})=>({id:'price:FICT:1',type:'price',severity:'high',symbol:'FICT',title:'Fictional target reached',message:'A fictional price condition was detected.',timestamp:now-1000,...more});
const browser=(rows:unknown)=>readBrowserInbox({getItem:()=>JSON.stringify(rows)},now);
const server=(more={})=>({ok:true,source:'reentry-telegram-ledger',from:'2026-11-01T12:00:00Z',until:'2026-11-08T12:00:00Z',items:[{id:'server:'+'a'.repeat(43),episodeId:'b'.repeat(43),origin:'reentry-server',symbol:'FICT',observedAt:'2026-11-08T10:00:00Z',deliveryState:'accepted',providerMessageId:'42',...more}]});
test('browser detections cannot forge provider acceptance or episode correlation',()=>{
  const result=browser([local({deliveryState:'accepted',providerMessageId:'42',episodeId:'forged',chat_id:'private',token:'private'})]);const item=result.items[0];
  assert.equal(item.deliveryState,'unknown');assert.equal(item.providerMessageId,null);assert.equal(item.episodeId,null);assert.doesNotMatch(JSON.stringify(result),/forged|private/);
});
test('browser empty, unavailable, corrupt and fully invalid histories stay distinct',()=>{
  assert.equal(readBrowserInbox({getItem:()=>null},now).status,'available');assert.equal(browser([]).items.length,0);
  assert.equal(readBrowserInbox({getItem:()=>{throw new Error();}},now).status,'unavailable');assert.equal(readBrowserInbox({getItem:()=>'{bad'},now).status,'unavailable');
  for(const rows of [{},[null],[local({timestamp:now+1})],[local({simulated:true})]])assert.equal(browser(rows).status,'unavailable');
});
test('browser rows are bounded, deduplicated, redacted and conflicting IDs withheld',()=>{
  assert.equal(browser([local(),local()]).items.length,1);
  assert.equal(browser([local(),local({message:'contradictory'})]).status,'unavailable');
  const result=browser([local(),null]);assert.equal(result.status,'partial');assert.equal(result.items.length,1);
  assert.equal(browser(Array.from({length:101},(_,i)=>local({id:String(i)}))).items.length,100);
  assert.doesNotMatch(browser([local({message:'See https://example.com/?token=fixture-secret Bearer fixture-auth'})]).items[0].explanation,/fixture-secret|fixture-auth/);
});
test('server normalization validates source/window and strips all unknown payload data',()=>{
  const payload=server();const result=normalizeServerInbox({...payload,token:'private',chat_id:'private'});assert.equal(result.items[0].deliveryState,'accepted');assert.doesNotMatch(JSON.stringify(result),/private/);
  for(const value of [null,{}, {...payload,source:'other'},{...payload,simulated:true},{...payload,from:'2026-01-01T00:00:00Z'},{...payload,items:[{}]}])assert.throws(()=>normalizeServerInbox(value));
});
test('acceptance without an ID becomes uncertain; known acceptance plus reconciliation retains both facts',()=>{
  assert.equal(normalizeServerInbox(server({providerMessageId:null})).items[0].deliveryState,'uncertain');
  const accepted=normalizeServerInbox(server({reconciliationRequired:true})).items[0];assert.equal(accepted.deliveryState,'accepted');assert.equal(accepted.reconciliationRequired,true);assert.match(accepted.explanation,/incomplete/);
});
test('filtering keeps browser and server records separate despite identical symbols and dates',()=>{
  const items=[...browser([local()]).items,...normalizeServerInbox(server()).items];const params={nowMs:now,days:7 as const,query:'',state:'all' as const,read:'all' as const,readIds:new Set<string>()};
  assert.equal(selectInboxItems(items,params).length,2);assert.equal(selectInboxItems(items,{...params,state:'accepted'}).length,1);
  assert.equal(selectInboxItems(items,{...params,read:'unread'}).length,2);assert.equal(selectInboxItems(items,{...params,query:'no match'}).length,0);
  assert.equal(selectInboxItems(items,{...params,read:'read',readIds:new Set([items[0].id])}).length,1);
});
test('local acknowledgement uses only its own bounded key and tolerates storage failure',()=>{
  let key='';let data='';const storage={getItem:()=>data||null,setItem:(k:string,v:string)=>{key=k;data=v;}};
  assert.equal(saveInboxReadIds(storage,new Set(['local:fixture'])),true);assert.equal(key,INBOX_READ_KEY);assert.deepEqual([...loadInboxReadIds(storage)],['local:fixture']);
  assert.equal(saveInboxReadIds({setItem:()=>{throw new Error();}},new Set()),false);
});
