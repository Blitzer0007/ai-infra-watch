import { useEffect, useRef, useState } from 'react';
import { authFetch } from '../../utils/apiAuth';
import { loadInboxReadIds, normalizeServerInbox, readBrowserInbox, saveInboxReadIds, selectInboxItems, type InboxState, type ServerInbox } from '../../utils/alertInboxAdapter';
import { loadReviewTimeZone } from '../../utils/reviewPreferences';
import { formatReviewDate } from '../../utils/portfolioReview';
import { FilterInput, FilterSelect } from '../FilterControls';
const inboxStorage={getItem:(key:string)=>localStorage.getItem(key),setItem:(key:string,value:string)=>localStorage.setItem(key,value)};
const labels:Record<InboxState,string>={accepted:'Provider accepted',rejected:'Rejected',uncertain:'Uncertain',sending:'Sending / pending',unknown:'Delivery unknown'};
export default function AlertInbox({onOpenHealth}:{onOpenHealth:()=>void}){
  const [browser,setBrowser]=useState(()=>readBrowserInbox(inboxStorage,Date.now()));
  const [readIds,setReadIds]=useState(()=>loadInboxReadIds(inboxStorage));
  const [days,setDays]=useState<7|30>(7);const [query,setQuery]=useState('');
  const [state,setState]=useState<InboxState|'all'>('all');const [read,setRead]=useState<'all'|'read'|'unread'>('all');
  const [server,setServer]=useState<ServerInbox|null>(null);const [serverError,setServerError]=useState('');const [loading,setLoading]=useState(false);const [readIssue,setReadIssue]=useState('');
  const request=useRef<AbortController|null>(null);const sequence=useRef(0);
  useEffect(()=>()=>{sequence.current++;request.current?.abort();},[]);
  const zone=loadReviewTimeZone();const timeZone=zone==='local'?undefined:zone;
  const loadServer=async(append=false)=>{
    const current=++sequence.current;request.current?.abort();request.current=new AbortController();setLoading(true);setServerError('');
    try{
      const response=await authFetch('/api/alert-inbox?days='+days+(append&&server?.nextCursor?'&cursor='+encodeURIComponent(server.nextCursor):''),{cache:'no-store',signal:request.current.signal});
      if(!response.ok)throw new Error();const page=normalizeServerInbox(await response.json());if(current!==sequence.current)return;
      setServer(previous=>append&&previous?{...page,items:[...new Map([...previous.items,...page.items].map(item=>[item.id,item])).values()].slice(0,1000)}:page);
    }catch{if(current===sequence.current)setServerError('Server delivery history is unavailable. Previously loaded records, if shown, have not been refreshed.');}
    finally{if(current===sequence.current)setLoading(false);}
  };
  const items=selectInboxItems([...browser.items,...(server?.items||[])],{nowMs:Date.now(),days,query,state,read,readIds});
  const toggleRead=(id:string)=>{const next=new Set<string>(readIds);if(next.has(id))next.delete(id);else next.add(id);setReadIds(next);setReadIssue(saveInboxReadIds(inboxStorage,next)?'':'Read status is temporary because browser storage is unavailable.');};
  return <div className="space-y-5" data-testid="alert-inbox">
    <header className="aiw-page-header flex flex-col border-b border-white/10"><span>Detection and delivery evidence</span><h1>Alert inbox</h1><p>Review why a condition was detected and what delivery evidence exists. “Read here” is only your local acknowledgement.</p></header>
    <section aria-label="Alert source coverage" className="rounded-xl border border-white/15 p-4 text-sm space-y-3">
      <h2 className="text-lg font-semibold">Sources and coverage</h2>
      <p>Browser history: {browser.status==='unavailable'?'unavailable':`${browser.items.length} retained detections${browser.status==='partial'?' · partial':''}`}.</p>
      <p>Server history: {server?`${server.items.length} loaded re-entry delivery records${server.nextCursor?' · more pages available':''}`:serverError?'unavailable':'not loaded'}.</p>
      <p className="text-amber-100">Server coverage is limited to the configured recipient’s re-entry Telegram ledger. Other alert classes are not covered. Browser detections and server records are kept separate; matching symbols or dates are not proof of correlation.</p>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>setBrowser(readBrowserInbox(inboxStorage,Date.now()))} className="rounded-lg border border-white/25 px-3 py-2">Refresh browser history</button><button type="button" disabled={loading} onClick={()=>void loadServer()} className="rounded-lg border border-cyan-200/40 px-3 py-2 text-cyan-100">{loading?'Loading server history…':'Load server delivery history'}</button><button type="button" onClick={onOpenHealth} className="rounded-lg border border-white/25 px-3 py-2">Open scheduler health</button></div>
      <details><summary className="cursor-pointer font-semibold">How to read delivery states</summary><p className="mt-2 text-white/75">Detection does not establish a send attempt. Provider acceptance needs a message ID and does not prove a person read the message. Pending, uncertain, conflicting or unreconciled records need review; this inbox never retries, resends, changes recipients or enables a scheduler.</p><p className="mt-2 text-white/75">Read marks for the latest 300 records are saved in this browser. They do not update Telegram or the delivery ledger.</p></details>
    </section>
    <div role="group" aria-label="Inbox filters" className="grid gap-3 rounded-xl border border-white/15 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <FilterInput type="search" label="Search alerts" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Symbol, reason, or source" />
      <FilterSelect label="Delivery evidence" value={state} onChange={event=>setState(event.target.value as InboxState|'all')}><option value="all">All states</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</FilterSelect>
      <FilterSelect label="Read here" value={read} onChange={event=>setRead(event.target.value as typeof read)}><option value="all">All records</option><option value="unread">Unread here</option><option value="read">Read here</option></FilterSelect>
      <FilterSelect label="History window" value={days} onChange={event=>{sequence.current++;request.current?.abort();setLoading(false);setDays(Number(event.target.value) as 7|30);setServer(null);setServerError('');}}><option value="7">Last 7 days</option><option value="30">Last 30 days</option></FilterSelect>
    </div>
    {browser.issue&&<p role="status" className="text-sm text-amber-100">{browser.issue}</p>}{serverError&&<p role="alert" className="text-sm text-amber-100">{serverError}</p>}{readIssue&&<p role="status" className="text-sm text-amber-100">{readIssue}</p>}
    <p className="text-sm text-white/75" aria-live="polite">{items.length} loaded records match these filters. This is not a count of all alerts or successful deliveries.</p>
    {!items.length&&<p className="rounded-xl border border-white/15 p-4 text-sm">{browser.status==='unavailable'&&!server?'Alert history is unavailable.':'No loaded records match this window and these filters.'} Server coverage may be unavailable or incomplete.</p>}
    <section aria-label="Alert records" className="space-y-3">{items.map(item=><article key={item.id} data-testid="inbox-record" className="space-y-3 rounded-xl border border-white/15 bg-[#15181e] p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-cyan-100">{item.symbol||'Portfolio'}</span><span>{item.origin==='browser'?'Browser detection':'Server delivery record'}</span><span className="rounded-full border border-white/25 px-2 py-1">{labels[item.deliveryState]}</span><span>{item.severity} severity</span>{readIds.has(item.id)&&<span>Read here</span>}</div>
      <h2 className="text-lg font-semibold break-words">{item.title}</h2><p className="text-sm text-white/80">{item.explanation}</p>
      <p className="text-sm text-white/70">First recorded: <time dateTime={item.observedAt}>{formatReviewDate(item.observedAt,undefined,timeZone)}</time></p>
      <details><summary className="cursor-pointer text-sm font-semibold">Delivery explanation for {item.symbol||'portfolio'}</summary><div className="mt-2 space-y-2 text-sm text-white/80"><p>Source: {item.source}.</p>{item.origin==='reentry-server'&&<p>The original trigger and message text are not stored in this ledger. Only delivery-state evidence is available.</p>}{item.origin==='browser'&&<p>No correlated server delivery proof is stored with this browser detection. A Telegram attempt or acceptance is not inferred.</p>}{item.providerMessageId&&<p>Provider message reference: {item.providerMessageId}. {item.deliveryState==='accepted'?'This is acceptance evidence, not a read receipt.':'The reference conflicts with the ledger state; acceptance remains unconfirmed.'}</p>}{item.reconciliationRequired&&<p className="text-amber-100">Reconciliation required. Do not automatically retry this episode.</p>}<p>{item.episodeId?'The server record includes a real episode reference. It has not been matched to a browser detection.':'An episode correlation reference is unavailable.'}</p></div></details>
      <button type="button" onClick={()=>toggleRead(item.id)} className="rounded-lg border border-white/25 px-3 py-2 text-sm">{readIds.has(item.id)?'Mark unread here':'Mark read here'}</button>
    </article>)}</section>
    {server?.nextCursor&&<button type="button" disabled={loading||server.items.length>=1000} onClick={()=>void loadServer(true)} className="rounded-lg border border-white/25 px-4 py-2 text-sm">Load next server page</button>}
    {!!server&&<p className="text-sm text-white/70">Loaded server window: {formatReviewDate(server.from,undefined,timeZone)} through {formatReviewDate(server.until,undefined,timeZone)}. At most 1,000 records are retained in this view; refine the window if needed.</p>}
  </div>;
}
