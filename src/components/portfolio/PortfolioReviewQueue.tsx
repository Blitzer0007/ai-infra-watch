import { useId, useState } from 'react';
import { decisionLabels, type DecisionCardModel, type DecisionState } from '../../utils/decisionCardAdapter';
import { filterReviewQueue, type ExplanationLevel } from '../../utils/portfolioReview';
import PositionDecisionCard from './PositionDecisionCard';

type Props = {
  positions: DecisionCardModel[];
  timeZone?: string;
  explanationLevel?: ExplanationLevel;
  onSelectPosition: (symbol: string) => void;
  onOpenEvidence: (symbol: string) => void;
};

export default function PortfolioReviewQueue({ positions, timeZone, explanationLevel = 'simple', onSelectPosition, onOpenEvidence }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<DecisionState | 'all'>('all');
  const id = useId();
  const visible = filterReviewQueue(positions, query, state);
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <label htmlFor={id + '-query'} className="text-sm">Search review queue
        <input id={id + '-query'} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Symbol or company"
          className="mt-1 block w-full min-w-0 rounded border border-white/25 bg-[#15181e] px-3 py-2 focus-visible:outline focus-visible:outline-cyan-300" />
      </label>
      <label htmlFor={id + '-state'} className="text-sm">Review classification
        <select id={id + '-state'} value={state} onChange={event => setState(event.target.value as DecisionState | 'all')}
          className="mt-1 block w-full min-w-0 rounded border border-white/25 bg-[#15181e] px-3 py-2 focus-visible:outline focus-visible:outline-cyan-300">
          <option value="all">All classifications</option>
          {(Object.keys(decisionLabels) as DecisionState[]).map(value => <option key={value} value={value}>{decisionLabels[value]}</option>)}
        </select>
      </label>
    </div>
    <p role="status" className="text-sm text-white/70">Showing {visible.length} of {positions.length} holdings · risk and missing-data reviews first</p>
    {!visible.length && <p className="rounded border border-white/20 p-4 text-sm">No positions match these filters. Clear your search or choose another classification.</p>}
    {visible.map(position => <PositionDecisionCard key={position.symbol} position={position} timeZone={timeZone} explanationLevel={explanationLevel} onSelectPosition={onSelectPosition} onOpenEvidence={onOpenEvidence} />)}
  </div>;
}
