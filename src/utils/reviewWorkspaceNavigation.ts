/** Closed review routes. Links carry view enums and a symbol, never searches or record bodies. */
import {validHoldingSymbol} from './holdingDetailNavigation';
import {REVIEW_TIME_ZONES,type ReviewTimeZone} from './reviewPreferences';
import type {InboxState,ServerInbox} from './alertInboxAdapter';
export type ReviewWorkspace='calendar'|'alerts';
export type CalendarView={days:30|90|180;confirmation:'all'|'confirmed'|'estimated'|'cancelled';zone:ReviewTimeZone};
export type InboxView={days:7|30;state:InboxState|'all';read:'all'|'read'|'unread'};
const one=(p:URLSearchParams,k:string)=>p.getAll(k).length===1?p.get(k):null;
const choice=<T extends string>(v:string|null,values:readonly T[],fallback:T):T=>values.find(x=>x===v)??fallback;
export function readCalendarView(p:URLSearchParams,defaultZone:ReviewTimeZone='local'):CalendarView {
  return {days:one(p,'calendar_days')==='90'?90:one(p,'calendar_days')==='180'?180:30,
    confirmation:choice(one(p,'calendar_certainty'),['all','confirmed','estimated','cancelled'] as const,'all'),
    zone:choice(one(p,'calendar_zone'),REVIEW_TIME_ZONES,REVIEW_TIME_ZONES.includes(defaultZone)?defaultZone:'local')};
}
export function calendarViewParams(view:CalendarView):URLSearchParams {
  const safe=readCalendarView(new URLSearchParams({calendar_days:String(view.days),calendar_certainty:view.confirmation,calendar_zone:view.zone}));
  return new URLSearchParams({calendar_days:String(safe.days),calendar_certainty:safe.confirmation,calendar_zone:safe.zone});
}
export function readInboxView(p:URLSearchParams):InboxView {
  return {days:one(p,'inbox_days')==='30'?30:7,state:choice(one(p,'inbox_state'),['all','accepted','rejected','uncertain','sending','unknown'] as const,'all'),read:choice(one(p,'inbox_read'),['all','read','unread'] as const,'all')};
}
export function inboxViewParams(view:InboxView):URLSearchParams {
  const safe=readInboxView(new URLSearchParams({inbox_days:String(view.days),inbox_state:view.state,inbox_read:view.read}));
  return new URLSearchParams({inbox_days:String(safe.days),inbox_state:safe.state,inbox_read:safe.read});
}
export function readReviewOrigin(p:URLSearchParams):ReviewWorkspace|null {
  const value=one(p,'research_from');return value==='calendar'||value==='alerts'?value:null;
}
export function reviewReturnHref(p:URLSearchParams):{href:string;label:string}|null {
  const origin=readReviewOrigin(p);
  if(origin==='calendar')return {href:'/calendar?'+calendarViewParams(readCalendarView(p)),label:'Return to Calendar'};
  if(origin==='alerts')return {href:'/alerts?'+inboxViewParams(readInboxView(p)),label:'Return to Alert inbox'};
  return null;
}
export function reviewCompanyHref(symbol:string,origin:ReviewWorkspace,view:URLSearchParams):string|null {
  if(!validHoldingSymbol(symbol)||!['calendar','alerts'].includes(origin))return null;
  const p=origin==='calendar'?calendarViewParams(readCalendarView(view)):inboxViewParams(readInboxView(view));
  p.set('portfolio_tab','research');p.set('research_symbol',symbol);p.set('research_from',origin);
  return '/portfolio?'+p.toString();
}
export function boundedReviewQuery(value:unknown):string {return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,80):'';}
export function readLocalReviewQuery(state:unknown,kind:ReviewWorkspace):string|null {
  if(!state||typeof state!=='object'||Array.isArray(state))return null;
  const value=(state as {aiwReviewQuery?:unknown}).aiwReviewQuery;
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const record=value as {version?:unknown;workspace?:unknown;query?:unknown};
  return record.version===1&&record.workspace===kind&&typeof record.query==='string'?boundedReviewQuery(record.query):null;
}
/** App-session memory only. Never persist delivery rows, cursors or expanded record IDs in links/history. */
export type ReviewReadingSession={query:string;href:string;expanded:Set<string>;focusKey:string|null;scrollY:number;restore:boolean;server?:{days:7|30;data:ServerInbox};serverError?:{days:7|30;message:string};inboxReadIds?:Set<string>;inboxReadIssue?:string};
export const createReviewReadingSession=():ReviewReadingSession=>({query:'',href:'',expanded:new Set(),focusKey:null,scrollY:0,restore:false});
/** Rebuild navigation destinations instead of accepting an arbitrary path/query from a caller. */
export function canonicalReviewHref(href:string):string|null {
  if(typeof href!=='string'||href.length>2048||!/^\/(portfolio|calendar|alerts)(?:\?|$)/.test(href))return null;
  const url=new URL(href,'https://review.invalid');
  if(url.pathname==='/calendar')return '/calendar?'+calendarViewParams(readCalendarView(url.searchParams));
  if(url.pathname==='/alerts')return '/alerts?'+inboxViewParams(readInboxView(url.searchParams));
  const p=url.searchParams,origin=readReviewOrigin(p),symbol=one(p,'research_symbol');
  return one(p,'portfolio_tab')==='research'&&origin&&symbol?reviewCompanyHref(symbol,origin,p):null;
}
