import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { calendarDayInZone, catalystRange, resolveCatalystRevisions, selectCatalystEvents, type CatalystConfirmation, type CatalystSnapshot } from '../../utils/catalystCalendar';
import { formatReviewDate } from '../../utils/portfolioReview';
import { loadReviewTimeZone, saveReviewTimeZone, type ReviewTimeZone } from '../../utils/reviewPreferences';
import { FilterBar, FilterInput, FilterSelect } from '../FilterControls';
import CatalystEventCard, { CatalystEvidence } from './CatalystEventCard';

type Props = { snapshot: CatalystSnapshot; onOpenWatchlist: () => void };
export default function CatalystCalendar({ snapshot, onOpenWatchlist }: Props) {
  const [days, setDays] = useState<30 | 90 | 180>(30);
  const [query, setQuery] = useState('');
  const [confirmation, setConfirmation] = useState<CatalystConfirmation | 'all'>('all');
  const [zone, setZone] = useState<ReviewTimeZone>(loadReviewTimeZone);
  const timeZone = zone === 'local' ? undefined : zone;
  const nowMs = Date.now();
  const range = catalystRange(nowMs, days, timeZone);
  const revisions = resolveCatalystRevisions(snapshot.events);
  const rows = selectCatalystEvents(snapshot, { nowMs, days, timeZone, query, confirmation });
  const active = revisions.filter(row => !row.supersededBy);
  const shownDays = new Set<string>();
  const stale = snapshot.receivedAt && nowMs - Date.parse(snapshot.receivedAt) > 86_400_000;
  return <div data-testid="catalyst-calendar" className="space-y-6">
    <header className="aiw-page-header flex flex-col border-b border-white/10">
      <span><CalendarDays aria-hidden="true" className="mr-2 h-4 w-4" />Catalysts and events</span>
      <h1>Catalyst calendar</h1>
      <p>Review loaded earnings dates, their certainty, and their sources. Event dates do not predict market returns.</p>
    </header>
    <section aria-label="Calendar source coverage" className="space-y-3 rounded-2xl border border-amber-200/25 p-4 text-sm">
      <h2 className="text-base font-semibold">Loaded feed coverage</h2>
      <p className="text-amber-100">Source-confirmed coverage: unknown. An empty list does not establish that no future events exist.</p>
      <p>Requested view: {days} calendar days · {range.from} through {range.to}.</p>
      {stale && <p role="status" className="text-amber-100">This snapshot is more than 24 hours old. Review an updated feed before relying on these dates.</p>}
      <details>
        <summary className="cursor-pointer font-semibold">Coverage and feed details</summary>
        <div className="mt-2 space-y-2 text-white/80">
          <p>{snapshot.requestedLookaheadDays ? `The loaded feed requested ${snapshot.requestedLookaheadDays} days; a larger view does not extend its source coverage.` : 'The source has not supplied a reliable coverage window.'} Only loaded earnings-feed events are included; this is not a complete corporate-actions calendar.</p>
          <p>Feed received: {snapshot.receivedAt ? formatReviewDate(snapshot.receivedAt, undefined, timeZone) : 'Not loaded'} · Response as of: {snapshot.responseAsOf ? formatReviewDate(snapshot.responseAsOf, undefined, timeZone) : 'Unavailable'}.</p>
          <p>Data stays in this session’s memory. Opening Calendar, changing filters, or inspecting evidence makes no request and sends no notification.</p>
          <p>Watchlist loads its existing earnings feed. Return here afterward to inspect that snapshot; Calendar does not refresh it automatically.</p>
        </div>
      </details>
      <button type="button" onClick={onOpenWatchlist} className="rounded-lg border border-cyan-200/40 px-3 py-2 font-semibold text-cyan-100">Open Watchlist earnings feed</button>
    </section>
    <div className="flex flex-wrap items-end gap-4">
      <fieldset className="min-w-0"><legend className="mb-2 text-sm font-semibold">Calendar range</legend><div className="flex flex-wrap gap-2">{([30, 90, 180] as const).map(value => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)} className={'rounded-lg border px-3 py-2 text-sm ' + (days === value ? 'border-cyan-200 bg-cyan-200 text-black' : 'border-white/25 text-white/80')}>{value} days</button>)}</div></fieldset>
      <FilterSelect label="Review timezone" value={zone} onChange={event => { const value = event.target.value as ReviewTimeZone; setZone(value); saveReviewTimeZone(value); }}>
        <option value="local">Device local time</option><option value="UTC">UTC</option><option value="Asia/Kolkata">India (Asia/Kolkata)</option><option value="America/New_York">US market (America/New_York)</option>
      </FilterSelect>
    </div>
    <p className="text-sm text-white/75">Exact times use {timeZone || 'device local time'}. Date-only events keep their original calendar date; “time not supplied” never means midnight.</p>
    <FilterBar resultCount={snapshot.status === 'unavailable' ? undefined : rows.length} totalCount={active.length} onClear={() => { setQuery(''); setConfirmation('all'); }}>
      <FilterInput label="Search calendar" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Symbol, event, or source" />
      <FilterSelect label="Event certainty" value={confirmation} onChange={event => setConfirmation(event.target.value as CatalystConfirmation | 'all')}><option value="all">All statuses</option><option value="confirmed">Confirmed only</option><option value="estimated">Estimated only</option><option value="cancelled">Cancelled only</option></FilterSelect>
    </FilterBar>
    {!!snapshot.issues.length && <ul role="status" className="list-disc space-y-1 rounded-xl border border-amber-200/20 p-4 pl-8 text-sm text-amber-100">{snapshot.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    {!!revisions.filter(row => row.lineageIssue).length && <p role="status" className="text-sm text-amber-100">Some corrections could not be resolved. Conflicting versions remain separate; inspect their evidence.</p>}
    {snapshot.status === 'unavailable' ? <p role="status" className="rounded-xl border border-white/15 p-5">Calendar data is unavailable. Load the existing Watchlist earnings feed to populate this view.</p> : !rows.length ? <p role="status" className="rounded-xl border border-white/15 p-5">No loaded events match this range and these filters. Source coverage remains unknown.</p> : <section aria-label="Calendar events" className="space-y-4">
      {rows.map(row => {
        const day = row.event.precision === 'date-only' ? row.event.date : calendarDayInZone(Date.parse(row.event.date), timeZone);
        const first = !shownDays.has(day); shownDays.add(day);
        return <div key={JSON.stringify([row.event.source, row.event.id])} className="space-y-3">{first && <h2 className="text-base font-semibold text-white/80">{day}</h2>}<CatalystEventCard row={row} revisions={revisions} timeZone={timeZone} /></div>;
      })}
    </section>}
    {!!revisions.filter(row => row.supersededBy).length && <details className="rounded-xl border border-white/15 p-4"><summary className="cursor-pointer text-sm font-semibold">All superseded events ({revisions.filter(row => row.supersededBy).length})</summary><ul className="mt-3 space-y-4 text-sm text-white/80">{revisions.filter(row => row.supersededBy).map(row => <li key={JSON.stringify([row.event.source, row.event.id])}><p>{row.event.symbol} · {formatReviewDate(row.event.date, undefined, timeZone)} · {row.event.confirmation} · superseded by {row.supersededBy}</p><CatalystEvidence event={row.event} timeZone={timeZone} /></li>)}</ul></details>}
  </div>;
}
