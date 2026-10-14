export type PeerMetricKey = 'size' | 'revenueGrowth' | 'operatingMargin' | 'capitalIntensity' | 'analystCoverage';

export type PeerMetricEvidence = {
  value: number | null;
  source: string;
  observedAt: string;
  periodEnd?: string | null;
  unit: 'usd' | 'percent' | 'count';
  status: 'verified' | 'stale' | 'missing' | 'conflicted';
};

export type PeerFundamentalSnapshot = {
  symbol: string;
  metrics: Partial<Record<PeerMetricKey, PeerMetricEvidence>>;
};

export type PeerStrengthResult = {
  symbol: string;
  score: number | null;
  coverage: number;
  availableMetrics: PeerMetricKey[];
  missingMetrics: PeerMetricKey[];
  staleMetrics: PeerMetricKey[];
  conflictedMetrics: PeerMetricKey[];
  evidence: Partial<Record<PeerMetricKey, PeerMetricEvidence>>;
  status: 'scored' | 'insufficient-evidence';
};

const WEIGHTS: Record<PeerMetricKey, number> = {
  size: 0.15,
  revenueGrowth: 0.3,
  operatingMargin: 0.25,
  capitalIntensity: 0.15,
  analystCoverage: 0.15,
};
const KEYS = Object.keys(WEIGHTS) as PeerMetricKey[];
const DAY_MS = 86400000;

function finiteValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFresh(metric: PeerMetricEvidence, now: number, maxAgeDays: number): boolean {
  if (metric.status !== 'verified' || !metric.source.trim()) return false;
  const timestamp = Date.parse(metric.observedAt);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAgeDays * DAY_MS;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts sourced, recent peer metrics into a transparent relative score.
 * Inputs are normalized against the supplied peer set, never against hidden
 * defaults. Metrics that are missing, stale, or conflicted are excluded and
 * reduce coverage; they are not imputed as zero.
 */
export function scorePeerStrength(
  snapshots: PeerFundamentalSnapshot[],
  options: { now?: number; maxAgeDays?: number; minimumCoverage?: number } = {},
): PeerStrengthResult[] {
  const now = options.now ?? Date.now();
  const maxAgeDays = options.maxAgeDays ?? 120;
  const minimumCoverage = options.minimumCoverage ?? 0.6;
  const normalized = snapshots.map(snapshot => ({
    ...snapshot,
    symbol: String(snapshot.symbol || '').trim().toUpperCase(),
  }));
  const symbols = new Set<string>();
  for (const snapshot of normalized) {
    if (!snapshot.symbol) throw new Error('Peer-strength snapshots require a symbol.');
    if (symbols.has(snapshot.symbol)) throw new Error('Peer-strength snapshots must have unique symbols.');
    symbols.add(snapshot.symbol);
  }
  const usable = new Map<string, Partial<Record<PeerMetricKey, number>>>();
  const evidenceBySymbol = new Map<string, Partial<Record<PeerMetricKey, PeerMetricEvidence>>>();
  const statusBySymbol = new Map<string, { missing: PeerMetricKey[]; stale: PeerMetricKey[]; conflicted: PeerMetricKey[] }>();

  for (const snapshot of normalized) {
    const values: Partial<Record<PeerMetricKey, number>> = {};
    const evidence: Partial<Record<PeerMetricKey, PeerMetricEvidence>> = {};
    const missing: PeerMetricKey[] = [];
    const stale: PeerMetricKey[] = [];
    const conflicted: PeerMetricKey[] = [];
    for (const key of KEYS) {
      const metric = snapshot.metrics[key];
      if (!metric || metric.status === 'missing' || !finiteValue(metric.value)) {
        missing.push(key);
        continue;
      }
      const expectedUnit = key === 'size' ? 'usd' : key === 'analystCoverage' ? 'count' : 'percent';
      if (metric.unit !== expectedUnit || ((key === 'size' || key === 'analystCoverage') && metric.value < 0)) {
        missing.push(key);
        continue;
      }
      if (metric.status === 'conflicted') {
        conflicted.push(key);
        continue;
      }
      if (!isFresh(metric, now, maxAgeDays)) {
        stale.push(key);
        continue;
      }
      values[key] = metric.value;
      evidence[key] = metric;
    }
    usable.set(snapshot.symbol, values);
    evidenceBySymbol.set(snapshot.symbol, evidence);
    statusBySymbol.set(snapshot.symbol, { missing, stale, conflicted });
  }

  const ranks: Partial<Record<PeerMetricKey, Record<string, number>>> = {};
  for (const key of KEYS) {
    const available = normalized
      .map(item => ({ symbol: item.symbol, value: usable.get(item.symbol)?.[key] }))
      .filter((item): item is { symbol: string; value: number } => finiteValue(item.value));
    if (!available.length) continue;
    const values = available.map(item => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    ranks[key] = {};
    for (const item of available) {
      // Size and analyst coverage are compared logarithmically; other metrics
      // are already ratios/percentages and remain linear.
      const transform = (value: number) => key === 'size' || key === 'analystCoverage'
        ? Math.log1p(Math.max(0, value))
        : value;
      const low = transform(min);
      const high = transform(max);
      const current = transform(item.value);
      let score = high === low ? 50 : 100 * (current - low) / (high - low);
      // Lower capital intensity is preferable; missing intensity is not assumed.
      if (key === 'capitalIntensity') score = 100 - score;
      ranks[key]![item.symbol] = clamp(score, 0, 100);
    }
  }

  return normalized.map(snapshot => {
    const evidence = evidenceBySymbol.get(snapshot.symbol) || {};
    const availableMetrics = KEYS.filter(key => finiteValue(usable.get(snapshot.symbol)?.[key]));
    const status = statusBySymbol.get(snapshot.symbol)!;
    const totalWeight = availableMetrics.reduce((sum, key) => sum + WEIGHTS[key], 0);
    const coverage = Number(totalWeight.toFixed(3));
    const weightedScore = totalWeight > 0
      ? availableMetrics.reduce((sum, key) => sum + (ranks[key]?.[snapshot.symbol] ?? 0) * WEIGHTS[key], 0) / totalWeight
      : null;
    const score = weightedScore != null && coverage >= minimumCoverage ? Number(weightedScore.toFixed(1)) : null;
    return {
      symbol: snapshot.symbol,
      score,
      coverage,
      availableMetrics,
      missingMetrics: status.missing,
      staleMetrics: status.stale,
      conflictedMetrics: status.conflicted,
      evidence,
      status: score == null ? 'insufficient-evidence' : 'scored',
    };
  });
}
