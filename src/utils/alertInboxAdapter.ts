import { ALERT_EVENTS_KEY } from './alertContracts';
import { deliveryEvidence } from '../../shared/alertDeliveryEvidence.js';
import { validCalendarInstant } from './catalystCalendar';
export type InboxState = 'accepted'|'rejected'|'uncertain'|'sending'|'unknown';
export type InboxItem = {id:string;episodeId:string|null;origin:'browser'|'reentry-server';symbol:string|null;severity:'info'|'medium'|'high'|'critical'|null;title:string;explanation:string;observedAt:string;deliveryState:InboxState;providerMessageId:string|null;reconciliationRequired:boolean;source:string};
export type BrowserInbox = {status:'available'|'partial'|'unavailable';items:InboxItem[];issue:string|null};
export type ServerInbox = {items:InboxItem[];nextCursor:string|null;from:string;until:string};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const safeText=(value:unknown,max=160)=>typeof value==='string'?value.replace(/https?:\/\/\S+/gi,'[link omitted]').replace(/Bearer\s+\S+/gi,'[authorization omitted]').replace(/bot\d+:[\w-]+/gi,'[credential omitted]').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const symbol=(value:unknown)=>typeof value==='string'&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(value)?value:null;
export function readBrowserInbox(storage:Pick<Storage,'getItem'>,nowMs:number):BrowserInbox {
  let rows:unknown[];
  try { const raw=storage.getItem(ALERT_EVENTS_KEY);if(raw==null)return {status:'available',items:[],issue:null};if(raw.length>256000)throw new Error();const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error();rows=parsed; }
  catch {return {status:'unavailable',items:[],issue:'Browser history could not be read. This is not an empty-history result.'};}
  let invalid=0;
  const byId=new Map<string,InboxItem>();const conflicts=new Set<string>();
  for(const value of rows.slice(0,100)){
    const row=object(value);const id=safeText(row.id,256);const title=safeText(row.title);const time=typeof row.timestamp==='number'?row.timestamp:NaN;
    if(!id||!title||!['price','large-move','catalyst'].includes(row.type as string)||!['info','medium','high','critical'].includes(row.severity as string)||!Number.isFinite(time)||time<=0||time>nowMs||!Number.isFinite(new Date(time).getTime())||row.simulated===true){invalid++;continue;}
    const item:InboxItem={id:'local:'+id,episodeId:null,origin:'browser',symbol:symbol(row.symbol),severity:['info','medium','high','critical'].includes(row.severity as string)?row.severity as InboxItem['severity']:'info',title,
      explanation:safeText(row.message,1000)||'A condition was detected in this browser.',observedAt:new Date(time).toISOString(),deliveryState:'unknown',providerMessageId:null,reconciliationRequired:false,source:safeText(row.source)||'Browser detection'};
    const previous=byId.get(item.id);if(previous&&JSON.stringify(previous)!==JSON.stringify(item))conflicts.add(item.id);else byId.set(item.id,item);
  }
  for(const id of conflicts)byId.delete(id);
  const partial=invalid>0||conflicts.size>0||rows.length>100;
  const items=[...byId.values()].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id));
  return {status:!items.length&&partial?'unavailable':partial?'partial':'available',items,issue:partial?'Some browser records were invalid, conflicting, simulated, or outside the 100-record retention window. Coverage is partial.':null};
}
export function normalizeServerInbox(payload:unknown):ServerInbox {
  const body=object(payload);
  if(body.ok!==true||body.source!=='reentry-telegram-ledger'||body.simulated===true||!Array.isArray(body.items)||body.items.length>100||!validCalendarInstant(body.from)||!validCalendarInstant(body.until)||Date.parse(body.from)>Date.parse(body.until)||Date.parse(body.until)-Date.parse(body.from)>30*86400000)throw new Error('Invalid inbox response');
  if(body.nextCursor!=null&&(typeof body.nextCursor!=='string'||body.nextCursor.length>2048))throw new Error('Invalid inbox continuation');
  const seen=new Set<string>();
  const items=body.items.map(value=>{
    const row=object(value);
    if(typeof row.id!=='string'||!/^server:[A-Za-z0-9_-]{43}$/.test(row.id)||seen.has(row.id)||row.origin!=='reentry-server'||!symbol(row.symbol)||!validCalendarInstant(row.observedAt)||Date.parse(row.observedAt)<Date.parse(body.from as string)||Date.parse(row.observedAt)>Date.parse(body.until as string)||row.simulated===true)throw new Error('Invalid inbox record');
    seen.add(row.id);
    const rawId=typeof row.providerMessageId==='string'&&/^\d{1,16}$/.test(row.providerMessageId)?Number(row.providerMessageId):null;
    const evidence=deliveryEvidence({status:row.deliveryState==='accepted'&&row.reconciliationRequired===true?'uncertain':row.deliveryState,telegram_message_id:rawId});
    const item:InboxItem={id:row.id,episodeId:typeof row.episodeId==='string'&&/^[A-Za-z0-9_-]{43}$/.test(row.episodeId)?row.episodeId:null,origin:'reentry-server',symbol:symbol(row.symbol),severity:null,title:row.symbol+' re-entry delivery record',observedAt:row.observedAt,...evidence,source:'Re-entry Telegram ledger'};
    if(row.reconciliationRequired===true)item.reconciliationRequired=true;
    return item;
  });
  return {items,nextCursor:body.nextCursor as string||null,from:body.from,until:body.until};
}
export function selectInboxItems(items:readonly InboxItem[],input:{nowMs:number;days:7|30;query:string;state:InboxState|'all';read:'all'|'read'|'unread';readIds:ReadonlySet<string>}){
  const query=input.query.trim().toLowerCase();
  return items.filter(item=>Date.parse(item.observedAt)>=input.nowMs-input.days*86400000&&Date.parse(item.observedAt)<=input.nowMs
    &&(input.state==='all'||item.deliveryState===input.state)&&(input.read==='all'||input.readIds.has(item.id)===(input.read==='read'))
    &&(!query||[item.symbol,item.title,item.explanation,item.source].join(' ').toLowerCase().includes(query)))
    .sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||a.id.localeCompare(b.id));
}
export const INBOX_READ_KEY='aiw-alert-inbox-read-v1';
export function loadInboxReadIds(storage:Pick<Storage,'getItem'>):Set<string>{
  try{const raw=storage.getItem(INBOX_READ_KEY);if(!raw||raw.length>100000)return new Set();const ids=JSON.parse(raw);return new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'&&/^(local|server):/.test(id)&&id.length<280).slice(0,300):[]);}catch{return new Set();}
}
export function saveInboxReadIds(storage:Pick<Storage,'setItem'>,ids:ReadonlySet<string>):boolean{
  try{storage.setItem(INBOX_READ_KEY,JSON.stringify([...ids].slice(-300)));return true;}catch{return false;}
}
