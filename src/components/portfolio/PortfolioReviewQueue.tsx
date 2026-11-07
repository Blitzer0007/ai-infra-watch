import type { DecisionCardModel } from '../../utils/decisionCardAdapter';
import PositionDecisionCard from './PositionDecisionCard';
export default function PortfolioReviewQueue({ positions, onSelectPosition, onOpenEvidence }: { positions: DecisionCardModel[]; onSelectPosition: (s: string) => void; onOpenEvidence: (s: string) => void }) {
  const priority = { 'RISK REVIEW': 0, 'INSUFFICIENT DATA': 1, 'ADD REVIEW': 2, 'HOLD / WATCH': 3 };
  return <div className="grid gap-3">{[...positions].sort((a,b) => priority[a.state] - priority[b.state] || a.symbol.localeCompare(b.symbol)).map(position => <PositionDecisionCard key={position.symbol} position={position} onSelectPosition={onSelectPosition} onOpenEvidence={onOpenEvidence} />)}</div>;
}
