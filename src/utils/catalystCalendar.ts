/** Pure, bounded adapters for already-loaded calendar data. No fetching or notification transport. */
export type CatalystKind = 'earnings' | 'guidance' | 'filing' | 'investor-day' | 'other';
export type CatalystConfirmation = 'confirmed' | 'estimated' | 'cancelled';
export type CatalystEvent = {
  id: string;
  source: string;
  symbol: string;
  kind: CatalystKind;
  title: string;
  date: string;
  precision: 'date-only' | 'exact-time';
  timeZone: string | null;
  confirmation: CatalystConfirmation;
  confirmationEvidence: 'issuer' | 'regulator' | null;
  sourceUrl: string | null;
  publishedAt: string | null;
  retrievedAt: string | null;
  supersedesId: string | null;
  issues: string[];
};
export type CatalystSnapshot = {
  status: 'unavailable' | 'available' | 'partial';
  receivedAt: string | null;
  responseAsOf: string | null;
  requestedLookaheadDays: number | null;
  sourceCoverage: 'unknown';
  events: CatalystEvent[];
  issues: string[];
  rejectedRows: number;
};
export const MAX_CATALYST_EVENTS = 500;
const DAY_MS = 86_400_000;
const kinds: CatalystKind[] = ['earnings', 'guidance', 'filing', 'investor-day', 'other'];
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 160) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
export function validCalendarDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function validCalendarInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && validCalendarDay(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
    && Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60;
}
export function validCalendarZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 80) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; }
}
export function publicCalendarUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    // Token-bearing URLs and fragments never enter calendar state or rendered links.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
export function unavailableCatalystSnapshot(): CatalystSnapshot {
  return { status: 'unavailable', receivedAt: null, responseAsOf: null, requestedLookaheadDays: null, sourceCoverage: 'unknown', events: [], issues: ['No earnings snapshot has been loaded in this session.'], rejectedRows: 0 };
}
const key = (event: CatalystEvent) => JSON.stringify([event.source, event.id]);
const same = (a: CatalystEvent, b: CatalystEvent) => JSON.stringify(a) === JSON.stringify(b);

/** Legacy earnings rows have no issuer-confirmation evidence: they remain estimates. */
export function captureEarningsCalendar(payload: unknown, receivedAt: string, responseOk = true): CatalystSnapshot {
  if (!validCalendarInstant(receivedAt)) throw new Error('Calendar capture requires an explicit, offset-aware receipt timestamp.');
  const body = object(payload);
  const result: CatalystSnapshot = { ...unavailableCatalystSnapshot(), receivedAt, issues: [] };
  if (!responseOk || body.ok !== true || !Array.isArray(body.upcoming)) {
    result.issues = ['The earnings feed is unavailable or returned an invalid response.'];
    return result;
  }
  const rows = body.upcoming;
  if ((body.simulated != null && body.simulated !== false) || body.status === 'simulated') {
    result.issues = ['The feed is marked simulated or has an invalid simulation marker. No real calendar data is available.'];
    result.rejectedRows = rows.length;
    return result;
  }
  if (rows.length > MAX_CATALYST_EVENTS) {
    result.issues = ['The event limit was exceeded. The snapshot is withheld to avoid silently losing corrections.'];
    result.rejectedRows = rows.length;
    return result;
  }
  result.status = 'available';
  result.responseAsOf = validCalendarInstant(body.as_of) && Date.parse(body.as_of) <= Date.parse(receivedAt) ? body.as_of : null;
  result.requestedLookaheadDays = Number.isInteger(body.lookahead_days) && Number(body.lookahead_days) >= 1 && Number(body.lookahead_days) <= 365 ? Number(body.lookahead_days) : null;
  const events = new Map<string, CatalystEvent>();
  const conflicts = new Set<string>();
  const occurrences = new Map<string, number>();
  let simulatedRows = 0;
  for (const value of rows) {
    const row = object(value);
    if ((row.simulated != null && row.simulated !== false) || row.status === 'simulated') { result.rejectedRows++; simulatedRows++; continue; }
    const id = typeof row.id === 'string' && row.id.length <= 160 ? text(row.id) : '';
    const symbol = text(row.symbol, 15).toUpperCase();
    const date = row.date;
    const dateOnly = validCalendarDay(date);
    if (!id || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) || (!dateOnly && !validCalendarInstant(date))) { result.rejectedRows++; continue; }
    const issues: string[] = [];
    const source = text(row.source) || text(body.source) || 'Source not supplied';
    const sourceUrl = publicCalendarUrl(row.sourceUrl);
    const publishedAt = validCalendarInstant(row.publishedAt) && Date.parse(row.publishedAt) <= Date.parse(receivedAt) ? row.publishedAt : null;
    const retrievedAt = validCalendarInstant(row.retrievedAt) && Date.parse(row.retrievedAt) <= Date.parse(receivedAt)
      && (!publishedAt || Date.parse(row.retrievedAt) >= Date.parse(publishedAt)) ? row.retrievedAt : null;
    const sourcedConfirmation = source !== 'Source not supplied' && !!sourceUrl && !!publishedAt && !!retrievedAt && ['issuer', 'regulator'].includes(String(row.confirmationBasis));
    const confirmation = row.confirmation === 'cancelled' ? 'cancelled' : row.confirmation === 'confirmed' && sourcedConfirmation ? 'confirmed' : 'estimated';
    if (confirmation === 'estimated') issues.push(row.confirmation === 'confirmed' ? 'Confirmation evidence is incomplete; shown as an estimate.' : 'Issuer confirmation has not been supplied.');
    if (!sourceUrl) issues.push('A public event source link is unavailable.');
    if (!publishedAt) issues.push('Source publication time is unavailable.');
    if (!retrievedAt) issues.push('Source retrieval time is unavailable; feed receipt time is shown separately.');
    if (row.confirmation === 'cancelled' && !sourcedConfirmation) issues.push('Cancellation is reported by the feed; issuer verification is unavailable.');
    const timeZone = validCalendarZone(row.timeZone) ? row.timeZone : null;
    if (!dateOnly && !timeZone) issues.push('Source timezone is unavailable; the supplied UTC offset defines the instant.');
    const kind = kinds.includes(row.kind as CatalystKind) ? row.kind as CatalystKind : row.kind == null ? 'earnings' : 'other';
    const supersedesId = typeof row.supersedesId === 'string' && row.supersedesId.length <= 160 ? text(row.supersedesId) || null : null;
    if (row.supersedesId != null && !supersedesId) issues.push('The correction reference is invalid and has not been applied.');
    const event: CatalystEvent = { id, symbol, source, title: text(row.title, 240) || `${symbol} ${kind}`, kind, date: String(date), precision: dateOnly ? 'date-only' : 'exact-time', timeZone, confirmation, confirmationEvidence: sourcedConfirmation && confirmation !== 'estimated' ? row.confirmationBasis as 'issuer' | 'regulator' : null, sourceUrl, publishedAt, retrievedAt, supersedesId, issues };
    const eventKey = key(event);
    occurrences.set(eventKey, (occurrences.get(eventKey) || 0) + 1);
    const previous = events.get(eventKey);
    if (previous && !same(previous, event)) conflicts.add(eventKey);
    else events.set(eventKey, event);
  }
  // Conflicting stable IDs are withheld, never resolved by arrival order.
  for (const id of conflicts) { events.delete(id); result.rejectedRows += occurrences.get(id) || 0; }
  if (conflicts.size) result.issues.push(`${conflicts.size} conflicting event IDs were withheld.`);
  if (simulatedRows) result.issues.push('Simulated calendar records or invalid simulation markers were withheld.');
  result.events = [...events.values()].sort((a, b) => key(a).localeCompare(key(b)));
  if (result.rejectedRows) result.issues.push(`${result.rejectedRows} invalid or conflicting event rows were withheld.`);
  if (result.rejectedRows || result.events.some(event => event.issues.length)) result.status = 'partial';
  if (result.rejectedRows && !result.events.length) result.status = 'unavailable';
  return result;
}

export type CalendarRevision = { event: CatalystEvent; supersededBy: string | null; lineageIssue: string | null };
export function resolveCatalystRevisions(events: readonly CatalystEvent[]): CalendarRevision[] {
  const byKey = new Map(events.map(event => [key(event), event]));
  const replacements = new Map<string, string>();
  const errors = new Map<string, string>();
  const proposed = new Map<string, CatalystEvent[]>();
  for (const event of events) {
    if (!event.supersedesId) continue;
    const targetKey = JSON.stringify([event.source, event.supersedesId]);
    const target = byKey.get(targetKey);
    if (!target || event.symbol !== target.symbol || event.kind !== target.kind || event.id === target.id
      || !event.publishedAt || !target.publishedAt || Date.parse(event.publishedAt) <= Date.parse(target.publishedAt)
      || !event.sourceUrl || !event.retrievedAt || (target.confirmation === 'confirmed' && !event.confirmationEvidence)) {
      errors.set(key(event), 'The correction could not be verified against an earlier event from the same source.');
      continue;
    }
    proposed.set(targetKey, [...(proposed.get(targetKey) || []), event]);
  }
  for (const [target, revisions] of proposed) {
    // Two independent corrections need an explicit chain; do not silently pick a winner.
    if (revisions.length === 1) replacements.set(target, revisions[0].id);
    else revisions.forEach(event => errors.set(key(event), 'Multiple corrections conflict; no replacement was inferred.'));
  }
  return events.map(event => ({ event, supersededBy: replacements.get(key(event)) || null, lineageIssue: errors.get(key(event)) || null }));
}

export function calendarDayInZone(nowMs: number, timeZone?: string): string {
  if (!Number.isFinite(nowMs) || (timeZone && !validCalendarZone(timeZone))) throw new Error('Calendar range requires a finite clock and a valid timezone.');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(nowMs);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function catalystRange(nowMs: number, days: 30 | 90 | 180, timeZone?: string) {
  if (![30, 90, 180].includes(days)) throw new Error('Unsupported calendar range.');
  const from = calendarDayInZone(nowMs, timeZone);
  const to = new Date(Date.parse(from) + (days - 1) * DAY_MS).toISOString().slice(0, 10);
  return { from, to };
}
export function selectCatalystEvents(snapshot: CatalystSnapshot, input: { nowMs: number; days: 30 | 90 | 180; timeZone?: string; query?: string; confirmation?: CatalystConfirmation | 'all' }) {
  const range = catalystRange(input.nowMs, input.days, input.timeZone);
  const query = (input.query || '').trim().toLowerCase();
  return resolveCatalystRevisions(snapshot.events).filter(row => {
    const event = row.event;
    if (row.supersededBy || (input.confirmation && input.confirmation !== 'all' && event.confirmation !== input.confirmation)) return false;
    if (query && !`${event.symbol} ${event.title} ${event.source}`.toLowerCase().includes(query)) return false;
    const day = event.precision === 'date-only' ? event.date : calendarDayInZone(Date.parse(event.date), input.timeZone);
    return day >= range.from && day <= range.to && (event.precision === 'date-only' || Date.parse(event.date) >= input.nowMs);
  }).sort((a, b) => {
    // Sort by the displayed calendar day; date-only events have no invented time.
    const day = (event: CatalystEvent) => event.precision === 'date-only' ? event.date : calendarDayInZone(Date.parse(event.date), input.timeZone);
    return day(a.event).localeCompare(day(b.event)) || (a.event.precision === b.event.precision ? 0 : a.event.precision === 'date-only' ? -1 : 1)
      || (a.event.precision === 'exact-time' && b.event.precision === 'exact-time' ? Date.parse(a.event.date) - Date.parse(b.event.date) : 0) || key(a.event).localeCompare(key(b.event));
  });
}
