import type { CalendarRevision, CatalystEvent } from '../../utils/catalystCalendar';
import { formatReviewDate } from '../../utils/portfolioReview';

export function CatalystEvidence({ event, timeZone }: { event: CatalystEvent; timeZone?: string }) {
  return <div className="space-y-2 text-sm text-white/75">
    <p>Source: {event.source}{event.sourceUrl && <> · <a className="text-cyan-200 underline" href={event.sourceUrl} target="_blank" rel="noreferrer">Open event source <span className="sr-only">for {event.symbol}: {event.title}</span></a></>}</p>
    <p>Source publication: {event.publishedAt ? formatReviewDate(event.publishedAt, undefined, timeZone) : 'Unavailable'}</p>
    <p>Source retrieval: {event.retrievedAt ? formatReviewDate(event.retrievedAt, undefined, timeZone) : 'Unavailable'}</p>
    <p>Source timezone: {event.timeZone || 'Not supplied'} · {event.precision === 'date-only' ? 'Original calendar date retained; no time inferred.' : 'Exact instant supplied with a UTC offset.'}</p>
    {event.confirmationEvidence && <p>Confirmation evidence: {event.confirmationEvidence} statement supplied by the feed. Verify the linked source before relying on the date.</p>}
    {!!event.issues.length && <ul className="list-disc pl-5 text-amber-100">{event.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
  </div>;
}

export default function CatalystEventCard({ row, revisions, timeZone }: { row: CalendarRevision; revisions: CalendarRevision[]; timeZone?: string }) {
  const event = row.event;
  const history: CalendarRevision[] = [];
  let previousId = row.lineageIssue ? null : event.supersedesId;
  const seen = new Set<string>();
  while (previousId && !seen.has(previousId)) {
    seen.add(previousId);
    const previous = revisions.find(item => item.event.id === previousId && item.event.source === event.source && item.event.symbol === event.symbol && item.event.kind === event.kind);
    if (!previous || previous.supersededBy !== (history.length ? history[history.length - 1].event.id : event.id)) break;
    history.push(previous);
    previousId = previous.lineageIssue ? null : previous.event.supersedesId;
  }
  return <article data-testid="catalyst-event" className="space-y-3 rounded-2xl border border-white/15 bg-[#15181E] p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-bold text-cyan-200">{event.symbol}</span>
      <span className="rounded-full border border-white/25 px-2 py-1">{event.kind === 'investor-day' ? 'Investor day' : event.kind}</span>
      <span className={'rounded-full border px-2 py-1 font-semibold ' + (event.confirmation === 'confirmed' ? 'border-emerald-300/40 text-emerald-200' : event.confirmation === 'cancelled' ? 'border-rose-300/40 text-rose-200' : 'border-amber-300/40 text-amber-100')}>
        {event.confirmation === 'confirmed' ? 'Confirmed' : event.confirmation === 'cancelled' ? 'Cancelled' : 'Estimated'}
      </span>
      {event.supersedesId && <span className="text-white/75">{row.lineageIssue ? 'Correction needs review' : 'Corrected date / status'}</span>}
    </div>
    <h3 className="text-lg font-semibold break-words">{event.title}</h3>
    <p className="text-base font-semibold"><time dateTime={event.date}>{formatReviewDate(event.date, undefined, timeZone)}</time></p>
    {event.confirmation === 'cancelled' && <p className="text-sm text-rose-100">This event is reported cancelled. It is retained for context and is not an upcoming confirmed catalyst.</p>}
    {row.lineageIssue && <p className="text-sm text-amber-100">{row.lineageIssue}</p>}
    <details className="rounded-xl border border-white/10 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Source evidence and revisions for {event.symbol}</summary>
      <div className="mt-3"><CatalystEvidence event={event} timeZone={timeZone} /></div>
      {!!history.length && <div className="mt-4 space-y-3">
        <h4 className="font-semibold">Earlier reported versions</h4>
        {history.map(previous => <div key={previous.event.id} className="space-y-2 border-l-2 border-white/20 pl-3 text-sm">
          <p>{formatReviewDate(previous.event.date, undefined, timeZone)} · {previous.event.confirmation} · {previous.supersededBy ? 'Superseded' : 'Not superseded; correction unverified'}</p>
          <CatalystEvidence event={previous.event} timeZone={timeZone} />
        </div>)}
      </div>}
    </details>
  </article>;
}
