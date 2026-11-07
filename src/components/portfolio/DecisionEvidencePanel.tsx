import type { DecisionCardModel } from '../../utils/decisionCardAdapter';
export default function DecisionEvidencePanel({ position }: { position: DecisionCardModel }) {
  return <div className="mt-3 space-y-3 text-sm text-white/80">
    {position.reasons.map(reason => <div key={reason.code}><h4 className="font-bold">{reason.title} · {reason.direction}</h4><p>{reason.explanation}</p><p className="text-white/60 break-words">Origin: {reason.code}</p>{!reason.evidenceIds.length && <p className="text-amber-200">Unresolved evidence — this is a configured condition, not verified event evidence.</p>}</div>)}
    <ul>{position.evidence.map(e => <li key={e.id}>{e.label} · {e.source} · {e.observedAt ? new Date(e.observedAt).toLocaleString() : 'Timestamp unavailable'}</li>)}</ul>
    {position.missingInputs.length > 0 && <div><h4 className="font-bold">Missing information</h4><ul className="list-disc pl-5">{position.missingInputs.map((text,i) => <li key={i}>{text}</li>)}</ul></div>}
    <p>Next review: {position.reviewTrigger}</p>
    <p>Leverage exposure: {position.riskLeverage}×. Leveraged products require their existing stricter review conditions.</p>
    <details><summary className="cursor-pointer">Methodology and prior engine output</summary><p>The existing portfolioPositions engine supplies states and thresholds. Quality gates can withhold them, never upgrade them. The 2–12 month horizon is research context, not a forecast.</p><p>Ungated engine output: {position.historicalAssessment.state} · observation {position.historicalAssessment.asOf ?? 'unknown'}. This is not an archived, validated historical signal.</p><p>Historical signal performance: unavailable in this view. See the existing forecast and research screens.</p></details>
  </div>;
}
