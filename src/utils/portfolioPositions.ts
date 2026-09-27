import type { IntelligenceSnapshot, PricePoint } from './intelligence';

export type PortfolioPosition = {
  symbol: string;
  name: string;
  group: string;
  theme: string;
  peers: string[];
  geo: string;
  quantity: number;
  averageCost: number;
  investedValue: number;
  snapshotCurrentValue: number;
  notes?: string;
};

export type PositionAnalysis = PortfolioPosition & {
  livePrice: number | null;
  currentValue: number;
  pnl: number;
  pnlPct: number;
  dailyChangePct: number | null;
  groupScore: number | null;
  groupBreadth: number | null;
  relativeToUniverse: number | null;
  peerAverageChange: number | null;
  vsPeers: number | null;
  state: 'ADD REVIEW' | 'HOLD / WATCH' | 'RISK REVIEW' | 'INSUFFICIENT DATA';
  rationale: string;
  addTrigger: string;
  riskTrigger: string;
};

export const PORTFOLIO_SNAPSHOT = {
  asOf: 'Broker snapshot • 27 Sep 2026 • 8:04 shown',
  investedValue: 521.02,
  currentValue: 526.03,
  unrealizedPnl: 5.00,
  unrealizedPct: 0.96,
  oneDayReturn: 0.29,
  oneDayPct: 0.06,
  buyingPower: 0.19,
};

export const PORTFOLIO_POSITIONS: PortfolioPosition[] = [
  { symbol:'DGXX', name:'Digi Power X', group:'AI Infrastructure', theme:'GPU hosting / power', peers:['IREN','CIFR'], geo:'Power + grid', quantity:19.720138, averageCost:5.36, investedValue:105.74, snapshotCurrentValue:90.91 },
  { symbol:'DRAM', name:'Roundhill Memory ETF', group:'Memory', theme:'HBM / DRAM / NAND', peers:['MU','SNDK','000660.KS'], geo:'Korea + Taiwan', quantity:0.981925, averageCost:61.94, investedValue:60.82, snapshotCurrentValue:60.87 },
  { symbol:'SOXL', name:'Direxion Daily Semiconductor Bull 3X', group:'Semiconductors', theme:'3x semiconductor beta', peers:['SOXX','NVDA','AMD'], geo:'Broad semiconductor beta', quantity:0.338551, averageCost:163.48, investedValue:55.35, snapshotCurrentValue:51.38, notes:'Leveraged exposure: stricter signal thresholds apply.' },
  { symbol:'NVDA', name:'NVIDIA', group:'AI Compute', theme:'Accelerators / AI systems', peers:['AMD','QCOM','TSM'], geo:'China export + Taiwan', quantity:0.243377, averageCost:209.14, investedValue:50.90, snapshotCurrentValue:54.75 },
  { symbol:'MSFT', name:'Microsoft', group:'AI Platform', theme:'Azure / Copilot / capex', peers:['GOOGL','AMZN'], geo:'Cloud capex + rates', quantity:0.109887, averageCost:417.43, investedValue:45.87, snapshotCurrentValue:56.91 },
  { symbol:'NBIS', name:'Nebius', group:'AI Infrastructure', theme:'AI cloud / GPU capacity', peers:['IREN','DGXX'], geo:'U.S. + Europe capacity', quantity:0.242165, averageCost:230.55, investedValue:55.83, snapshotCurrentValue:57.68 },
  { symbol:'VIVO', name:'VivoPower', group:'AI Infrastructure', theme:'Power + data centers', peers:['IREN','CIFR'], geo:'Power / Nordic exposure', quantity:7, averageCost:5.11, investedValue:35.77, snapshotCurrentValue:28.84 },
  { symbol:'META', name:'Meta Platforms', group:'AI Platform', theme:'AI monetization / capex', peers:['GOOGL','MSFT'], geo:'AI capex + regulation', quantity:0.057984, averageCost:604.14, investedValue:35.03, snapshotCurrentValue:43.36 },
  { symbol:'NOW', name:'ServiceNow', group:'Enterprise Software', theme:'AI workflow software', peers:['CRM','TEAM'], geo:'Rates + enterprise spend', quantity:0.391484, averageCost:104.37, investedValue:40.86, snapshotCurrentValue:53.09 },
  { symbol:'PHVS', name:'Pharvaris', group:'Healthcare', theme:'Clinical catalyst', peers:['APLS','ARWR'], geo:'Clinical / regulatory', quantity:0.895409, averageCost:38.93, investedValue:34.86, snapshotCurrentValue:28.24 },
];

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function buildPositionAnalyses(
  prices: Record<string, PricePoint>,
  intelligence: IntelligenceSnapshot,
): PositionAnalysis[] {
  return PORTFOLIO_POSITIONS.map((position) => {
    const quote = prices[position.symbol];
    const livePrice = quote?.price ?? null;
    const currentValue = livePrice != null ? livePrice * position.quantity : position.snapshotCurrentValue;
    const pnl = currentValue - position.investedValue;
    const pnlPct = position.investedValue ? (pnl / position.investedValue) * 100 : 0;
    const group = intelligence.groups.find((item) => item.name === position.group) ?? null;

    const peerReturns = position.peers
      .map((symbol) => prices[symbol]?.changePct)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const peerAverageChange = avg(peerReturns);
    const dailyChangePct = quote?.changePct ?? null;
    const vsPeers = dailyChangePct != null && peerAverageChange != null
      ? dailyChangePct - peerAverageChange
      : null;

    const isLeveraged = position.symbol === 'SOXL';
    const groupScore = group?.score ?? null;
    const groupBreadth = group?.breadth ?? null;
    const relativeToUniverse = group?.relativeToUniverse ?? null;

    const addEligible = groupScore != null &&
      groupBreadth != null &&
      relativeToUniverse != null &&
      groupScore >= (isLeveraged ? 68 : 62) &&
      groupBreadth >= (isLeveraged ? 0.67 : 0.50) &&
      relativeToUniverse >= 0 &&
      (vsPeers == null || vsPeers >= 0);

    const riskEligible = groupScore != null && (
      (groupScore <= (isLeveraged ? 45 : 38) && pnlPct <= -10) ||
      (vsPeers != null && vsPeers <= (isLeveraged ? -1.5 : -1.0) && groupBreadth != null && groupBreadth < 0.50)
    );

    let state: PositionAnalysis['state'] = 'HOLD / WATCH';
    if (!quote && position.snapshotCurrentValue == null) state = 'INSUFFICIENT DATA';
    else if (riskEligible) state = 'RISK REVIEW';
    else if (addEligible) state = 'ADD REVIEW';

    const rationale = state === 'ADD REVIEW'
      ? 'Group momentum, breadth and relative strength currently align with the portfolio model.'
      : state === 'RISK REVIEW'
        ? 'The model shows weaker group conditions and/or peer-relative deterioration while the position is under pressure.'
        : 'Current evidence does not meet the model thresholds for an add or risk review trigger.';

    const addTrigger = isLeveraged
      ? 'Review an add only when semiconductor group score ≥68, breadth ≥67%, and peer-relative return is non-negative.'
      : 'Review an add when group score ≥62, breadth ≥50%, group relative strength is ≥0, and peer-relative return is non-negative.';

    const riskTrigger = isLeveraged
      ? 'Reassess exposure when group score falls below 45 or the position trails tracked peers by ≥1.5 percentage points while group breadth is weak.'
      : 'Reassess exposure when group score ≤38 with a ≥10% position drawdown, or when the position trails tracked peers by ≥1.0 point with group breadth below 50%.';

    return {
      ...position,
      livePrice,
      currentValue,
      pnl,
      pnlPct,
      dailyChangePct,
      groupScore,
      groupBreadth,
      relativeToUniverse,
      peerAverageChange,
      vsPeers,
      state,
      rationale,
      addTrigger,
      riskTrigger,
    };
  });
}
