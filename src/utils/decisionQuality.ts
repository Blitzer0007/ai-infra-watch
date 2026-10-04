export type DecisionType = 'HOLD' | 'ADD_REVIEW' | 'REDUCE_REVIEW' | 'EXIT_REVIEW' | 'WATCH';

export function scoreDecision(decision: string, excessReturnPct: number | null | undefined): number | null {
  if (excessReturnPct == null || !Number.isFinite(excessReturnPct)) return null;
  return ['REDUCE_REVIEW', 'EXIT_REVIEW'].includes(String(decision).toUpperCase())
    ? -Number(excessReturnPct)
    : Number(excessReturnPct);
}

export function sampleLabel(n: number, minimum = 10): string {
  return n >= minimum
    ? 'Adequate sample · n=' + n
    : 'INSUFFICIENT SAMPLE · n=' + n + ' < ' + minimum;
}
