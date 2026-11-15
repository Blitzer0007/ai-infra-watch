/** Phase 1 only: bounded fictional replay. No acquisition, persistence or decision authority. */
import { validCalendarInstant } from './catalystCalendar';

export type RadarCoverage = 'available' | 'partial' | 'not-configured' | 'rate-limited' | 'unavailable';
export type RadarSourceKind = 'x-public-post' | 'company-primary' | 'sec-primary' | 'secondary-news';
export type RadarStage = 'discovery-unverified' | 'corroborated' | 'primary-confirmed' | 'disputed' | 'retracted';
export type RadarCategory = 'governance' | 'accounting' | 'export-policy' | 'supply-chain' | 'funding' | 'geopolitical';
export const RADAR_WATCH = Object.freeze({
  handle: 'aravind', url: 'https://x.com/aravind', discoveryPriority: 'high',
  role: 'third-party/unverified', accountId: null, liveCoverage: 'not-configured',
  factConfidenceBoost: 0,
} as const);

export type RadarObservation = {
  fictional: true;
  id: string;
  claimId: string; // Exact proposition: a board change and its alleged cause have separate IDs.
  symbol: string;
  issuerId: string; // Must agree with the supplied issuer registry, not merely a headline ticker.
  category: RadarCategory;
  sourceKind: RadarSourceKind;
  sourceUrl: string;
  publisher: string;
  accountHandle?: string;
  canonicalPostId?: string;
  accountId?: string;
  mappingVerified?: boolean;
  availability: 'present' | 'deleted' | 'unavailable';
  paraphrase: string;
  claimClarity: 'specific' | 'ambiguous';
  publishedAt: string | null;
  reportedAt: string | null;
  firstObservedAt: string;
  retrievedAt: string;
  relation: 'supports' | 'contradicts' | 'retracts';
  originKey: string; // Retained original reporting/post lineage; copies share a key.
  independentReporting: boolean;
  // This receipt exercises binding checks; it cannot authenticate a real publisher.
  receipt?: { basis: 'fictional-only'; reference: string; issuerId: string; publisher: string; checkedAt: string };
};
export type RadarSession = { id: string; opensAt: string; closesAt: string };
export type RadarFixture = {
  fictional: true;
  registry: Record<string, string>;
  observations: RadarObservation[];
  calendarKnownAt: string;
  sessions: RadarSession[];
};
export type RadarEvidence = RadarObservation & {
  verification: 'fictional-binding-checked' | 'unverified';
  discoveryPriority: 'high' | 'normal';
  fingerprint: string;
  limits: string[];
};
export type EventRiskCandidate = {
  id: string;
  symbol: string;
  category: RadarCategory;
  stage: RadarStage;
  firstObservedAt: string;
  confirmedAt: string | null;
  supportingIds: string[];
  contradictingIds: string[];
  evidence: RadarEvidence[];
  independentReportingOrigins: number;
  impactDirection: 'unknown';
  priceImpactPct: null;
  decisionEligible: false;
  sourceAuthenticityVerified: false;
  nextSupportedSession: string | null;
};
const kinds: RadarSourceKind[] = ['x-public-post', 'company-primary', 'sec-primary', 'secondary-news'];
const categories: RadarCategory[] = ['governance', 'accounting', 'export-policy', 'supply-chain', 'funding', 'geopolitical'];
const instant = (s: unknown): s is string => validCalendarInstant(s);
const time = (s: string) => Date.parse(s);
const key = (s: unknown, max = 120): s is string => typeof s === 'string' && s.length > 0 && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);

/** Syntax only. Never proves author identity, existence, publication time or permission to collect. */
export function parsePublicXPostUrl(value: string): { url: string; handle: string; postId: string } | null {
  if (typeof value !== 'string' || value.length > 500) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.search || u.hash || !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(u.hostname)) return null;
    const match = /^\/([a-zA-Z0-9_]{1,15})\/status\/([1-9][0-9]{0,24})\/?$/.exec(u.pathname);
    if (!match) return null;
    return { url: `https://x.com/${match[1].toLowerCase()}/status/${match[2]}`, handle: match[1].toLowerCase(), postId: match[2] };
  } catch { return null; }
}

function fictionalReference(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'example.com' && u.pathname.startsWith('/fictional/') && !u.username && !u.password && !u.search && !u.hash && !u.port;
  } catch { return false; }
}

function checkedSource(row: RadarObservation, asOf: number): boolean {
  const receipt = row.receipt;
  return !!receipt && receipt.basis === 'fictional-only' && receipt.reference === row.sourceUrl
    && receipt.issuerId === row.issuerId && receipt.publisher === row.publisher
    && instant(receipt.checkedAt) && time(receipt.checkedAt) >= time(row.retrievedAt) && time(receipt.checkedAt) <= asOf
    && row.availability === 'present' && instant(row.publishedAt);
}

function nextSession(fixture: RadarFixture, at: string, asOf: number): string | null {
  if (!instant(fixture.calendarKnownAt) || time(fixture.calendarKnownAt) > asOf || !Array.isArray(fixture.sessions) || fixture.sessions.length > 100) return null;
  let previousClose = -Infinity;
  for (const s of fixture.sessions) {
    if (!key(s.id) || !instant(s.opensAt) || !instant(s.closesAt) || time(s.opensAt) >= time(s.closesAt) || time(s.opensAt) <= previousClose) return null;
    previousClose = time(s.closesAt);
  }
  return fixture.sessions.find(s => time(at) < time(s.closesAt))?.id ?? null;
}

export function buildEventRiskRadar(fixture: RadarFixture, symbols: string[], asOf: string) {
  if (!instant(asOf) || fixture.fictional !== true || !Array.isArray(fixture.observations) || fixture.observations.length > 200 || symbols.length > 100) throw new Error('A bounded fictional fixture and explicit replay clock are required.');
  const cutoff = time(asOf);
  const allowed = new Set(symbols.filter(s => /^[A-Z][A-Z0-9.-]{0,9}$/.test(s)));
  const issues: { id: string; reason: string }[] = [];
  const rows: RadarEvidence[] = [];
  const ids = new Set<string>();
  for (const r of fixture.observations) {
    let reason = '';
    if (!r || r.fictional !== true || !key(r.id) || !key(r.claimId) || !key(r.publisher) || !key(r.originKey) || !key(r.paraphrase, 400) || !['specific', 'ambiguous'].includes(r.claimClarity) || !kinds.includes(r.sourceKind) || !categories.includes(r.category) || !['supports', 'contradicts', 'retracts'].includes(r.relation) || !['present', 'deleted', 'unavailable'].includes(r.availability) || !fictionalReference(r.sourceUrl)) reason = 'Malformed or non-fictional reference.';
    else if (!allowed.has(r.symbol)) continue;
    else if (!fixture.registry[r.symbol] || fixture.registry[r.symbol] !== r.issuerId) reason = 'Ticker and underlying issuer disagree.';
    else if (!instant(r.firstObservedAt) || !instant(r.retrievedAt) || time(r.firstObservedAt) > time(r.retrievedAt)
      || (r.publishedAt !== null && (!instant(r.publishedAt) || time(r.publishedAt) > time(r.firstObservedAt)))
      || (r.reportedAt !== null && (!instant(r.reportedAt) || time(r.reportedAt) > time(r.retrievedAt)))) reason = 'Invalid or inconsistent source clocks.';
    else if (time(r.firstObservedAt) > cutoff || time(r.retrievedAt) > cutoff) reason = 'Not available at replay cutoff (lookahead excluded).';
    else if (ids.has(r.id)) reason = 'Duplicate observation ID withheld.';
    if (reason) { issues.push({ id: r?.id ?? 'unknown', reason }); continue; }
    ids.add(r.id);
    const limits: string[] = ['Fictional evidence; real publisher authenticity is unverified.'];
    if (r.sourceKind === 'x-public-post') {
      if (!r.canonicalPostId || !r.accountId || r.mappingVerified !== true) limits.push('Original post/account mapping is incomplete; historical lead time is unscorable.');
      if (r.accountHandle?.toLowerCase() === RADAR_WATCH.handle) limits.push('Priority affects discovery only; this is not an official issuer source.');
    }
    if (r.publishedAt === null) limits.push('Original publication time is unknown.');
    if (r.claimClarity === 'ambiguous') limits.push('Ambiguous claim; unscorable as a dated advance warning.');
    if (r.availability !== 'present') limits.push(`Original source is ${r.availability}; no factual promotion.`);
    rows.push({ ...r, receipt: r.receipt ? { ...r.receipt } : undefined,
      verification: checkedSource(r, cutoff) ? 'fictional-binding-checked' : 'unverified',
      discoveryPriority: r.sourceKind === 'x-public-post' && r.accountHandle?.toLowerCase() === RADAR_WATCH.handle ? 'high' : 'normal',
      fingerprint: JSON.stringify([r.sourceKind === 'x-public-post' ? 'x' : 'report', r.originKey]), limits });
  }
  rows.sort((a, b) => time(a.firstObservedAt) - time(b.firstObservedAt) || a.id.localeCompare(b.id));
  const groups = new Map<string, RadarEvidence[]>();
  for (const r of rows) {
    const id = JSON.stringify([r.symbol, r.claimId]);
    groups.set(id, [...(groups.get(id) ?? []), r]);
  }
  const events: EventRiskCandidate[] = [];
  for (const [id, evidence] of groups) {
    const checked = evidence.filter(r => r.verification === 'fictional-binding-checked');
    const primary = (r: RadarEvidence) => r.sourceKind === 'company-primary' || r.sourceKind === 'sec-primary';
    const supporting = checked.filter(r => r.relation === 'supports');
    const confirmations = supporting.filter(primary);
    const confirmedAt = confirmations.map(r => [r.firstObservedAt, r.receipt!.checkedAt].sort((a, b) => time(a) - time(b))[1]).sort((a, b) => time(a) - time(b))[0] ?? null;
    const opposing = checked.filter(r => r.relation === 'contradicts' && r.sourceKind !== 'x-public-post');
    // A retraction must come from the same original publisher/lineage, or a primary source.
    const retractions = checked.filter(r => r.relation === 'retracts' && (primary(r) || evidence.some(original => original.relation === 'supports' && original.publisher === r.publisher && original.originKey === r.originKey)));
    const news = supporting.filter(r => r.sourceKind === 'secondary-news' && r.independentReporting === true);
    // Both independent publishers and independent original reporting are necessary.
    const publishers = new Set<string>(); const origins = new Set<string>();
    for (const r of news) { if (!publishers.has(r.publisher) && !origins.has(r.originKey)) { publishers.add(r.publisher); origins.add(r.originKey); } }
    const stage: RadarStage = retractions.length ? 'retracted' : opposing.length ? 'disputed' : confirmations.length ? 'primary-confirmed' : origins.size >= 2 ? 'corroborated' : 'discovery-unverified';
    events.push({ id, symbol: evidence[0].symbol, category: evidence[0].category, stage,
      firstObservedAt: evidence[0].firstObservedAt, confirmedAt,
      supportingIds: evidence.filter(r => r.relation === 'supports').map(r => r.id),
      contradictingIds: evidence.filter(r => r.relation !== 'supports').map(r => r.id), evidence,
      independentReportingOrigins: origins.size, impactDirection: 'unknown', priceImpactPct: null,
      decisionEligible: false, sourceAuthenticityVerified: false,
      nextSupportedSession: nextSession(fixture, evidence[0].firstObservedAt, cutoff) });
  }
  return { mode: 'fictional-offline' as const, liveCoverage: RADAR_WATCH.liveCoverage, events, issues,
    coverage: 'partial' as RadarCoverage, asOf, decisionEligible: false as const };
}

export type RadarReplayOutcome = {
  claimId: string; symbol: string; outcome: 'event' | 'no-event' | 'unknown';
  windowEnd: string; labelledAt: string; priceBaselineObservedAt: string | null;
};

/** Outcomes enter only the scorer, never discovery. Measures fictional detection, not price prediction. */
export function scoreEventRiskReplay(fixture: RadarFixture, outcomes: RadarReplayOutcome[], asOf: string) {
  if (outcomes.length > 100 || !instant(asOf)) throw new Error('Invalid bounded replay.');
  const ids = outcomes.map(o => JSON.stringify([o.symbol, o.claimId]));
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate replay label.');
  const result = buildEventRiskRadar(fixture, Object.keys(fixture.registry), asOf);
  const cases = outcomes.map(o => {
    const event = result.events.find(e => e.id === JSON.stringify([o.symbol, o.claimId]));
    const available = instant(o.windowEnd) && instant(o.labelledAt) && time(o.windowEnd) <= time(o.labelledAt) && time(o.labelledAt) <= time(asOf) && ['event', 'no-event', 'unknown'].includes(o.outcome);
    const priority = event?.evidence.filter(r => r.discoveryPriority === 'high' && r.relation === 'supports') ?? [];
    const social = priority.find(r => r.claimClarity === 'specific' && r.availability === 'present' && r.mappingVerified === true && !!r.accountId && !!r.canonicalPostId && instant(r.publishedAt) && time(r.firstObservedAt) <= time(o.windowEnd));
    const baseline = (kind: 'primary' | 'news') => event?.evidence.filter(r => r.verification === 'fictional-binding-checked' && r.relation === 'supports' && (kind === 'news' ? r.sourceKind === 'secondary-news' && r.independentReporting === true : ['company-primary', 'sec-primary'].includes(r.sourceKind)))
      .map(r => [r.firstObservedAt, r.receipt!.checkedAt].sort((a, b) => time(a) - time(b))[1])
      .filter(at => time(at) <= time(o.windowEnd)).sort((a, b) => time(a) - time(b))[0] ?? null;
    const official = baseline('primary'), news = baseline('news');
    const officialPublished = event?.evidence.filter(r => r.verification === 'fictional-binding-checked' && r.relation === 'supports' && ['company-primary', 'sec-primary'].includes(r.sourceKind) && instant(r.publishedAt) && time(r.publishedAt) <= time(o.windowEnd))
      .map(r => r.publishedAt!).sort((a, b) => time(a) - time(b))[0] ?? null;
    const lead = (at: string | null) => social && at ? (time(at) - time(social.firstObservedAt)) / 60_000 : null;
    const status = !available || o.outcome === 'unknown' || (priority.length > 0 && !social) ? 'unscorable' : o.outcome === 'no-event' ? (social ? 'false-positive' : 'no-priority-lead') : !social ? 'missed' : (official && time(social.firstObservedAt) >= time(official)) || (officialPublished && time(social.publishedAt!) >= time(officialPublished)) ? 'post-event' : 'detected';
    const priceBaseline = instant(o.priceBaselineObservedAt) && time(o.priceBaselineObservedAt) <= time(o.windowEnd) ? o.priceBaselineObservedAt : null;
    return { claimId: o.claimId, status, officialLeadMinutes: status === 'unscorable' ? null : lead(official), newsLeadMinutes: status === 'unscorable' ? null : lead(news), priceAlertLeadMinutes: status === 'unscorable' ? null : lead(priceBaseline) };
  });
  const count = (s: string) => cases.filter(c => c.status === s).length;
  return { cases, labelledCases: cases.length, scorableCases: cases.length - count('unscorable'), falsePositives: count('false-positive'), detected: count('detected'), missed: count('missed'), postEvent: count('post-event'), unscorable: count('unscorable'),
    verdict: 'Insufficient historical evidence to measure predictive accuracy.' as const, predictiveAuthority: false as const };
}
