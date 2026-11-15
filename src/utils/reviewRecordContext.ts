/** Session-only, bounded snapshots of the exact selected Calendar/Inbox record. No IO. */
import {publicCalendarUrl,validCalendarDay,validCalendarInstant,type CalendarRevision} from './catalystCalendar';
import {validHoldingSymbol} from './holdingDetailNavigation';
import type {InboxItem} from './alertInboxAdapter';
export type CalendarRecordContext={
  origin:'calendar';symbol:string;title:string;kind:string;date:string;precision:'date-only'|'exact-time';
  confirmation:'confirmed'|'estimated'|'cancelled';confirmationEvidence:'issuer'|'regulator'|null;
  source:string;sourceUrl:string|null;publishedAt:string|null;retrievedAt:string|null;
  lineageIssue:string|null;issues:string[];priorVersions:{date:string;confirmation:string;source:string}[];
  earlierVersionsOmitted:boolean;
};
export type InboxRecordContext={
  origin:'alerts';symbol:string;sourceOrigin:'browser'|'reentry-server';title:string;explanation:string;
  observedAt:string;source:string;deliveryState:'accepted'|'rejected'|'uncertain'|'sending'|'unknown';
  severity:'info'|'medium'|'high'|'critical'|null;
  messageReference:'none'|'provider-accepted-not-read'|'unconfirmed';
  reconciliationRequired:boolean;episodeReferencePresent:boolean;
};
export type ReviewRecordContext=CalendarRecordContext|InboxRecordContext;
const safe=(v:unknown,max=180)=>typeof v==='string'?v.replace(/https?:\/\/\S+/gi,'[link omitted]')
  .replace(/Bearer\s+\S+/gi,'[authorization omitted]')
  .replace(/bot\d+:[\w-]+/gi,'[credential omitted]')
  .replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const instant=(v:unknown)=>validCalendarInstant(v)?v:null;
export function calendarRecordContext(row:CalendarRevision,prior:readonly CalendarRevision[]=[]):CalendarRecordContext|null{
  const e=row?.event;
  if(!e||!validHoldingSymbol(e.symbol)||!(validCalendarDay(e.date)||validCalendarInstant(e.date)))return null;
  return {origin:'calendar',symbol:e.symbol,title:safe(e.title,240),kind:e.kind,date:e.date,precision:e.precision,
    confirmation:e.confirmation,confirmationEvidence:e.confirmationEvidence,source:safe(e.source,120)||'Source unavailable',
    sourceUrl:publicCalendarUrl(e.sourceUrl),publishedAt:instant(e.publishedAt),retrievedAt:instant(e.retrievedAt),
    lineageIssue:safe(row.lineageIssue,240)||null,issues:e.issues.slice(0,10).map(x=>safe(x,180)),
    priorVersions:prior.slice(0,5).map(p=>({date:p.event.date,confirmation:p.event.confirmation,source:safe(p.event.source,120)})),
    earlierVersionsOmitted:prior.length>5};
}
export function inboxRecordContext(item:InboxItem):InboxRecordContext|null{
  if(!validHoldingSymbol(item.symbol||'')||!validCalendarInstant(item.observedAt))return null;
  const messageReference=item.providerMessageId?
    item.deliveryState==='accepted'&&!item.reconciliationRequired?'provider-accepted-not-read':'unconfirmed':'none';
  return {origin:'alerts',symbol:item.symbol!,sourceOrigin:item.origin,title:safe(item.title,200),
    explanation:item.origin==='browser'?safe(item.explanation,320):'Original trigger and message text are absent from this delivery ledger.',
    observedAt:item.observedAt,source:safe(item.source,120),deliveryState:item.deliveryState,severity:item.severity,
    messageReference,reconciliationRequired:item.reconciliationRequired,episodeReferencePresent:!!item.episodeId};
}
