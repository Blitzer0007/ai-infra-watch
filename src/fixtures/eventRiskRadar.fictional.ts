/** Entirely invented 2024 scenarios. No actual post, allegation or company event is represented. */
import type { RadarFixture, RadarObservation, RadarReplayOutcome } from '../utils/eventRiskRadar';

export const RADAR_REPLAY_START = '2024-06-08T13:00:00Z';
export const RADAR_REPLAY_END = '2024-06-12T21:00:00Z';
function observation(id: string, claimId: string, at: string, edits: Partial<RadarObservation> = {}): RadarObservation {
  const row: RadarObservation = {
    fictional: true, id, claimId, symbol: 'NVDA', issuerId: 'fictional-nvda', category: 'governance',
    sourceKind: 'x-public-post', sourceUrl: `https://example.com/fictional/${id}`,
    publisher: 'Simulated priority profile', accountHandle: 'aravind', canonicalPostId: id,
    accountId: 'fictional-account-only', mappingVerified: true, availability: 'present',
    paraphrase: 'Invented scenario: a board change is attributed to a governance dispute. This cause is not established.', claimClarity: 'specific',
    publishedAt: at, reportedAt: at, firstObservedAt: at, retrievedAt: at,
    relation: 'supports', originKey: id, independentReporting: false, ...edits,
  };
  if (row.sourceKind !== 'x-public-post' || row.relation === 'retracts') row.receipt = {
    basis: 'fictional-only', reference: row.sourceUrl, issuerId: row.issuerId, publisher: row.publisher, checkedAt: row.retrievedAt,
  };
  return row;
}

export const EVENT_RISK_FIXTURE: RadarFixture = {
  fictional: true, registry: { NVDA: 'fictional-nvda', AMD: 'fictional-amd' },
  calendarKnownAt: '2024-06-07T00:00:00Z',
  sessions: [
    { id: '2024-06-10', opensAt: '2024-06-10T13:30:00Z', closesAt: '2024-06-10T20:00:00Z' },
    { id: '2024-06-11', opensAt: '2024-06-11T13:30:00Z', closesAt: '2024-06-11T20:00:00Z' },
    { id: '2024-06-12', opensAt: '2024-06-12T13:30:00Z', closesAt: '2024-06-12T20:00:00Z' },
  ],
  observations: [
    observation('lead-cause', 'board-change-cause', '2024-06-08T12:00:00Z'),
    observation('copy-cause', 'board-change-cause', '2024-06-08T12:20:00Z', { publisher: 'Simulated other account', accountHandle: 'fixture_copy', originKey: 'lead-cause' }),
    observation('denial', 'board-change-cause', '2024-06-10T14:00:00Z', { sourceKind: 'company-primary', publisher: 'Simulated issuer', relation: 'contradicts', paraphrase: 'Invented issuer denial of the alleged cause; the earlier lead remains visible.' }),
    observation('board-event', 'board-change-event', '2024-06-10T14:00:00Z', { sourceKind: 'sec-primary', publisher: 'Simulated filing', paraphrase: 'Invented board change confirmed in a fictional filing. This says nothing about its cause.' }),
    observation('export-lead', 'export-policy', '2024-06-10T12:00:00Z', { category: 'export-policy', paraphrase: 'Invented hypothesis: an AI-chip export review opens by the end of the replay window.' }),
    observation('export-copy', 'export-policy', '2024-06-10T12:10:00Z', { sourceKind: 'secondary-news', publisher: 'Simulated republisher', category: 'export-policy', originKey: 'export-lead' }),
    observation('export-news-a', 'export-policy', '2024-06-10T13:00:00Z', { sourceKind: 'secondary-news', publisher: 'Fictional newsroom A', category: 'export-policy', independentReporting: true }),
    observation('export-news-b', 'export-policy', '2024-06-10T13:15:00Z', { sourceKind: 'secondary-news', publisher: 'Fictional newsroom B', category: 'export-policy', independentReporting: true }),
    observation('funding-lead', 'funding-concern', '2024-06-10T15:00:00Z', { category: 'funding', paraphrase: 'Invented hypothesis: a funding facility expires during the replay window. Used to test a false lead.' }),
    observation('funding-retraction', 'funding-concern', '2024-06-11T10:00:00Z', { category: 'funding', relation: 'retracts', originKey: 'funding-lead', paraphrase: 'The simulated original publisher retracts the fictional concern.' }),
    observation('late-official', 'late-comment', '2024-06-10T16:00:00Z', { sourceKind: 'company-primary', publisher: 'Simulated issuer', category: 'supply-chain' }),
    observation('late-social', 'late-comment', '2024-06-10T16:30:00Z', { category: 'supply-chain', paraphrase: 'Invented commentary first observed after the fictional announcement.' }),
    observation('deleted-social', 'unknown-post', '2024-06-10T17:00:00Z', { availability: 'deleted', canonicalPostId: undefined, publishedAt: null, claimClarity: 'ambiguous' }),
    observation('amd-geopolitical', 'amd-policy', '2024-06-10T18:00:00Z', { symbol: 'AMD', issuerId: 'fictional-amd', category: 'geopolitical', paraphrase: 'Invented regional exposure concern for a second example holding.' }),
    observation('wrong-issuer', 'wrong-issuer', '2024-06-10T18:30:00Z', { issuerId: 'fictional-unrelated-issuer', paraphrase: 'Headline ticker and underlying issuer disagree; this row must be rejected.' }),
  ],
};

const label = (claimId: string, outcome: RadarReplayOutcome['outcome'], edits: Partial<RadarReplayOutcome> = {}): RadarReplayOutcome => ({
  claimId, symbol: 'NVDA', outcome, windowEnd: '2024-06-11T20:00:00Z', labelledAt: '2024-06-12T20:00:00Z', priceBaselineObservedAt: null, ...edits,
});
export const EVENT_RISK_OUTCOMES: RadarReplayOutcome[] = [
  label('board-change-cause', 'no-event'), label('board-change-event', 'event'),
  label('export-policy', 'event', { priceBaselineObservedAt: '2024-06-10T14:00:00Z' }),
  label('funding-concern', 'no-event'), label('late-comment', 'event'), label('unknown-post', 'unknown'),
  label('amd-policy', 'unknown', { symbol: 'AMD' }),
];
