import type {ReviewRecordContext} from '../../utils/reviewRecordContext';
import type {ReviewWorkspace} from '../../utils/reviewWorkspaceNavigation';
/** The exact clicked record only. No fetch, inference, retry, persistence or correlated episodes. */
export default function ReviewOriginContext({origin,record,symbol}:{origin:ReviewWorkspace|null;record:ReviewRecordContext|null;symbol:string}){
 if(!origin)return null;
 const item=record?.origin===origin&&record.symbol===symbol?record:null;
 return <section data-testid="research-origin-context" aria-label="Original opened record" className="min-w-0 space-y-2 rounded-xl border border-amber-200/25 p-4 text-sm">
   <h3 className="text-base font-semibold">Original {origin==='calendar'?'Calendar event':'Alert Inbox record'}</h3>
   {!item?<p role="status" className="text-amber-100">The exact opened {origin==='calendar'?'event':'alert'} context is unavailable in this app session. Direct links and reloads do not select a replacement record. Return to the source view and open a loaded record.</p>
   :item.origin==='calendar'?<>
     <p className="break-words font-semibold">{item.title}</p>
     <p>Original event date: <time dateTime={item.date}>{item.date}</time> · {item.precision==='date-only'?'Date only; no event time supplied':'Exact timestamp supplied'}</p>
     <p>Feed certainty: {item.confirmation} · {item.confirmationEvidence?'Issuer/regulator confirmation declared: '+item.confirmationEvidence:'Issuer/regulator confirmation not independently established'}</p>
     <p>Source: {item.source} · Published: {item.publishedAt??'unavailable'} · Retrieved: {item.retrievedAt??'unavailable'}</p>
     {item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-cyan-100 underline">Open original public event source</a>}
     {item.lineageIssue&&<p className="text-amber-100">Correction needs review: {item.lineageIssue}</p>}
     {!!item.priorVersions.length&&<div><p>Earlier reported versions (not independently verified):</p><ul className="list-disc pl-5">{item.priorVersions.map((p,i)=><li key={i}>{p.date} · {p.confirmation} · {p.source}</li>)}</ul>{item.earlierVersionsOmitted&&<p>More earlier versions omitted; return to Calendar.</p>}</div>}
     {!!item.issues.length&&<ul className="list-disc pl-5 text-amber-100">{item.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}
     <p className="text-white/65">The original feed record does not independently prove the event or issuer.</p>
   </>:<>
     <p className="break-words font-semibold">{item.title}</p>
     <p>{item.sourceOrigin==='browser'?'Local browser detection':'Server re-entry delivery record'} · {item.deliveryState} · {item.severity?item.severity+' severity':'Trigger severity unavailable'}</p>
     <p>First recorded: <time dateTime={item.observedAt}>{item.observedAt}</time> · Source: {item.source||'unavailable'}</p>
     <p className="break-words">{item.explanation}</p>
     <p>{item.messageReference==='provider-accepted-not-read'?'Provider acceptance was recorded; this is not a read receipt.':item.messageReference==='unconfirmed'?'A provider message reference conflicts with delivery evidence; acceptance is unconfirmed.':'No provider acceptance receipt is established by this record.'}</p>
     {item.reconciliationRequired&&<p className="text-amber-100">Delivery reconciliation required; no safe retry can be inferred.</p>}
     <p className="text-white/65">{item.episodeReferencePresent?'An original episode reference exists; it has not been correlated with a browser detection.':'No episode correlation reference is available.'} Matching symbols or dates do not prove related delivery. “Read here” is only local browser acknowledgement.</p>
   </>}
 </section>;
}
