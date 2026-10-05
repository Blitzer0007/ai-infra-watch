export type FreshnessLabel = 'Live' | 'Delayed' | 'Last close' | 'Unknown';

export type FreshnessInput = {
  retrievedAt?: string | null;
  marketTime?: string | null;
  asOf?: string | null;
  stale?: boolean;
};

export type FreshnessResult = {
  label: FreshnessLabel;
  referenceTime: string | null;
  ageMinutes: number | null;
};

function parseTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function classifyFreshness(
  input: FreshnessInput,
  nowMs = Date.now(),
): FreshnessResult {
  const marketMs = parseTimestamp(input.marketTime);
  const retrievalMs = parseTimestamp(input.retrievedAt);
  const asOfMs = parseTimestamp(input.asOf);

  if (input.stale === true) {
    const referenceMs = marketMs ?? asOfMs ?? retrievalMs;
    return {
      label: referenceMs == null ? 'Unknown' : 'Last close',
      referenceTime: referenceMs == null ? null : new Date(referenceMs).toISOString(),
      ageMinutes: referenceMs == null ? null : Math.max(0, (nowMs - referenceMs) / 60000),
    };
  }

  if (marketMs == null && asOfMs == null && retrievalMs == null) {
    return { label: 'Unknown', referenceTime: null, ageMinutes: null };
  }

  // A retrieval timestamp is not a market timestamp. Without market-time
  // provenance we never call the quote Live, even when it was fetched recently.
  if (marketMs == null) {
    const referenceMs = asOfMs ?? retrievalMs!;
    const ageMinutes = Math.max(0, (nowMs - referenceMs) / 60000);
    return {
      label: ageMinutes <= 120 ? 'Delayed' : 'Last close',
      referenceTime: new Date(marketMs).toISOString(),
      ageMinutes,
    };
  }

  const ageMinutes = Math.max(0, (nowMs - marketMs) / 60000);
  const label: FreshnessLabel =
    ageMinutes <= 15 ? 'Live' :
    ageMinutes <= 120 ? 'Delayed' :
    'Last close';

  return {
    label,
    referenceTime: new Date(referenceMs).toISOString(),
    ageMinutes,
  };
}

export function freshnessLabel(input: FreshnessInput, nowMs = Date.now()): FreshnessLabel {
  return classifyFreshness(input, nowMs).label;
}

export function formatFreshnessAge(ageMinutes: number | null): string {
  if (ageMinutes == null || !Number.isFinite(ageMinutes)) return '';
  if (ageMinutes < 1) return 'now';
  if (ageMinutes < 60) return Math.round(ageMinutes) + 'm old';
  const hours = ageMinutes / 60;
  return (hours < 10 ? hours.toFixed(1) : Math.round(hours).toString()) + 'h old';
}