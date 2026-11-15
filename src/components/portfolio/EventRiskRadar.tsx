import { useId, useState } from 'react';
import { buildEventRiskRadar, parsePublicXPostUrl, RADAR_WATCH, scoreEventRiskReplay, type RadarStage } from '../../utils/eventRiskRadar';
import { EVENT_RISK_FIXTURE, EVENT_RISK_OUTCOMES, RADAR_REPLAY_END, RADAR_REPLAY_START } from '../../fixtures/eventRiskRadar.fictional';

const stages: Record<RadarStage, string> = {
  'discovery-unverified': 'Unverified', corroborated: 'Corroborated', 'primary-confirmed': 'Confirmed event', disputed: 'Disputed', retracted: 'Retracted',
};
const reasons = {
  governance: 'Review management continuity and your holding thesis. A confirmed change does not confirm its alleged cause.',
  accounting: 'Review reported-financial assumptions only after the specific allegation is independently checked.',
  'export-policy': 'Review export exposure, customer concentration and upcoming catalysts.',
  'supply-chain': 'Review delivery dependencies and concentration assumptions.',
  funding: 'Review financing assumptions; an unverified funding concern is not a financial fact.',
  geopolitical: 'Review regional business exposure and policy-sensitive catalysts.',
};
const formatTime = (at: string | null) => at ? `${at.replace('T', ' ').replace('Z', '')} UTC` : 'Unknown';
const control = 'min-h-11 min-w-0 rounded-lg border border-white/30 bg-[#15181e] px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-200';

/** Loaded holding symbols only; all timeline data below are explicitly fictional and remain in memory. */
export default function EventRiskRadar({ holdingSymbols, holdingsStatus = 'ready', initialSymbol }: {
  holdingSymbols: string[]; holdingsStatus?: 'ready' | 'loading' | 'unavailable'; initialSymbol?: string;
}) {
  const heading = useId(), symbolInput = useId(), cutoffInput = useId(), urlInput = useId();
  const [chosenSymbol, setChosenSymbol] = useState(initialSymbol ?? 'NVDA');
  const symbols = [...new Set(['NVDA', ...holdingSymbols])];
  const symbol = symbols.includes(chosenSymbol) ? chosenSymbol : 'NVDA';
  const [cutoff, setCutoff] = useState(RADAR_REPLAY_END);
  const [loaded, setLoaded] = useState<{ symbol: string; cutoff: string } | null>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [url, setUrl] = useState('');
  const [urlVerdict, setUrlVerdict] = useState<string | null>(null);
  const result = loaded?.symbol === symbol && loaded.cutoff === cutoff ? buildEventRiskRadar(EVENT_RISK_FIXTURE, [symbol], cutoff) : null;
  const score = showEvaluation && result ? scoreEventRiskReplay(EVENT_RISK_FIXTURE, EVENT_RISK_OUTCOMES, cutoff) : null;
  return <section aria-labelledby={heading} data-testid="event-risk-radar" className="space-y-4 rounded-xl border border-cyan-200/25 bg-[#15181e] p-4 text-white/90">
    <header className="space-y-2">
      <p className="text-sm font-semibold text-cyan-100">Manual research · fictional offline prototype</p>
      <h3 id={heading} className="text-xl font-semibold">Event Risk Radar</h3>
      <p className="text-sm leading-relaxed">Follow emerging concerns, their sources and counter-evidence. These invented historical scenarios test the workflow. No real post was collected or attributed to any person; no actual company event is represented.</p>
    </header>
    <div className="space-y-2 rounded-lg border border-amber-200/30 bg-amber-200/5 p-3 text-sm" data-testid="radar-source-health">
      <p className="font-semibold">X · @{RADAR_WATCH.handle} · third-party/unverified</p>
      <p>High discovery priority · factual confidence unchanged · account identity not verified.</p>
      <p><strong>Live X: not configured.</strong> No live monitoring or collection. Official issuer/SEC verification and independent news coverage are also not connected to this prototype.</p>
      <a className="inline-block min-h-11 py-2 text-cyan-100 underline" href={RADAR_WATCH.url} target="_blank" rel="noopener noreferrer">Requested public source profile ↗</a>
    </div>
    {holdingsStatus !== 'ready' ? <p role="status" className="text-sm">{holdingsStatus === 'loading' ? 'Loading holding scope…' : 'Holding scope is unavailable; portfolio coverage cannot be established.'}</p>
      : <p className="text-sm">{holdingSymbols.length ? `Loaded holding scope: ${holdingSymbols.join(', ')}.` : 'No holdings loaded. NVDA is a reference demo, not an inferred position.'} No portfolio data is sent anywhere by this panel.</p>}
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid min-w-0 gap-1"><label htmlFor={symbolInput} className="text-sm">Radar holding</label><select id={symbolInput} className={control} value={symbol} onChange={event => { setChosenSymbol(event.target.value); setLoaded(null); setShowEvaluation(false); }}>
        {symbols.map(s => <option key={s} value={s}>{s}{!holdingSymbols.includes(s) ? ' · reference demo only' : ''}</option>)}
      </select></div>
      <div className="grid min-w-0 gap-1"><label htmlFor={cutoffInput} className="text-sm">Fictional replay cutoff</label><select id={cutoffInput} className={control} value={cutoff} onChange={event => { setCutoff(event.target.value); setLoaded(null); setShowEvaluation(false); }}>
        <option value={RADAR_REPLAY_START}>8 Jun 2024 · before confirmation</option><option value={RADAR_REPLAY_END}>12 Jun 2024 · completed scenarios</option>
      </select></div>
      <button type="button" className={control + ' text-cyan-100'} onClick={() => { setLoaded({ symbol, cutoff }); setShowEvaluation(false); }}>Load fictional timeline</button>
    </div>
    <p role="status" className="text-sm" data-testid="radar-load-status">{!result ? 'Timeline not loaded. Use the manual button to inspect fictional evidence.' : `Fictional ${symbol} timeline loaded · fixture coverage partial. Live coverage remains unknown; this is not an all clear.`}</p>
    {result && <>
      <p className="text-sm">Replay as of {formatTime(result.asOf)}. All stages below describe fictional evidence only. Price impact is withheld: no supported quote, adjustment basis or price window is connected. This panel cannot authorize trades or notifications.</p>
      {!result.events.length && <p className="rounded-lg border border-white/20 p-3 text-sm">No fictional scenarios for this holding at this cutoff. This says nothing about real events or source coverage.</p>}
      <ol className="space-y-3" aria-label="Fictional event timeline">
        {result.events.map(event => <li key={event.id} data-testid="radar-event" className="min-w-0 space-y-3 rounded-lg border border-white/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-base font-semibold">{event.symbol} · {event.evidence[0].claimId.replaceAll('-', ' ')}</h4><span className="rounded border border-white/30 px-2 py-1 text-sm">Fictional · {stages[event.stage]}</span></div>
          <p className="text-sm leading-relaxed">{reasons[event.category]}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-white/65">Category</dt><dd>{event.category}</dd></div>
            <div><dt className="text-white/65">First seen by tracker</dt><dd>{formatTime(event.firstObservedAt)}</dd></div>
            <div><dt className="text-white/65">Event confirmation seen</dt><dd>{formatTime(event.confirmedAt)}</dd></div>
            <div><dt className="text-white/65">Next supported session</dt><dd>{event.nextSupportedSession ?? 'Unknown; no supported calendar mapping'}</dd></div>
          </dl>
          <p className="text-sm">Supporting references: {event.supportingIds.length} · counter-evidence/retractions: {event.contradictingIds.length} · independent original newsrooms: {event.independentReportingOrigins}. Copies do not add corroboration.</p>
          <details className="rounded-lg border border-white/15 px-3">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Sources and counter-evidence ({event.evidence.length})</summary>
            <ol className="space-y-4 pb-3">{event.evidence.map(evidence => <li key={evidence.id} className="space-y-2 border-t border-white/15 pt-3 text-sm">
              <p className="font-semibold">Fictional source: {evidence.publisher} · {evidence.sourceKind} · {evidence.relation}</p>
              <p>{evidence.paraphrase}</p>
              <p>First posted: {formatTime(evidence.publishedAt)}<br/>First seen by tracker: {formatTime(evidence.firstObservedAt)}<br/>Publisher reported: {formatTime(evidence.reportedAt)}<br/>Last retrieval: {formatTime(evidence.retrievedAt)}</p>
              <p>Verification: {evidence.verification === 'fictional-binding-checked' ? 'Fictional reference binding checked; no real publisher verified' : 'Unverified'}</p>
              <ul className="list-disc space-y-1 pl-5">{evidence.limits.map(limit => <li key={limit}>{limit}</li>)}</ul>
              <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-block min-h-11 break-all py-2 text-cyan-100 underline">Fictional reference placeholder · {evidence.id} ↗</a>
            </li>)}</ol>
          </details>
        </li>)}
      </ol>
      {!!result.issues.length && <details className="rounded-lg border border-white/20 px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">Excluded or unavailable evidence ({result.issues.length})</summary><ul className="list-disc space-y-2 pb-3 pl-5 text-sm">{result.issues.map((issue, index) => <li key={`${issue.id}-${index}`}>{issue.id}: {issue.reason}</li>)}</ul></details>}
      <button type="button" className={control} aria-expanded={showEvaluation} onClick={() => setShowEvaluation(value => !value)}>Inspect offline replay evaluation</button>
      {score && <div data-testid="radar-replay-score" className="space-y-2 rounded-lg border border-white/20 p-3 text-sm">
        <h4 className="font-semibold">Fictional test corpus · all 7 declared cases (NVDA and AMD)</h4>
        <p>{score.scorableCases} scorable · {score.detected} early lead · {score.falsePositives} false leads · {score.missed} missed · {score.postEvent} post-event · {score.unscorable} unscorable.</p>
        <p>Lead times use first observation, never a backdated post timestamp. Baselines exclude the priority account and copies; missing baselines remain unknown. This developer-authored corpus is not a sample of real posts.</p>
        <ul className="space-y-2">{score.cases.map(c => <li key={c.claimId} className="break-words">{c.claimId}: {c.status}. Lead versus official / original news / price-alert baseline: {[c.officialLeadMinutes, c.newsLeadMinutes, c.priceAlertLeadMinutes].map(n => n === null ? 'unknown' : `${n} min`).join(' / ')}.</li>)}</ul>
        <p className="font-semibold text-amber-100">{score.verdict}</p>
      </div>}
    </>}
    <details className="rounded-lg border border-white/20 px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">Check a public original-post URL format</summary>
      <form className="space-y-3 pb-3" onSubmit={event => { event.preventDefault(); const parsed = parsePublicXPostUrl(url); setUrlVerdict(parsed ? `Format accepted for @${parsed.handle}, post ${parsed.postId}. Existence, account identity and timestamps remain unverified. No content was fetched or retained.` : 'Unsupported URL. Use an HTTPS x.com or twitter.com handle/status/numeric-ID URL without query parameters or fragments.'); }}>
        <label htmlFor={urlInput} className="block text-sm">Public original-post URL (format only)</label><input id={urlInput} type="text" maxLength={500} autoComplete="off" value={url} onChange={event => { setUrl(event.target.value); setUrlVerdict(null); }} className={control + ' w-full'} />
        <button type="submit" className={control}>Validate URL format only</button><p role="status" className="break-words text-sm">{urlVerdict ?? 'No request, collection, monitoring or persistence. Acquisition needs a separately approved plan.'}</p>
      </form>
    </details>
  </section>;
}
