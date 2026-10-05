export type FreshnessLabel = 'Live' | 'Delayed' | 'Last close';

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
  const referenceMs = parseTimestamp(input.marketTime) ?? parseTimestamp(input.retrievedAt) ?? parseTimestamp(input.asOf);
  if (input.stale === true || referenceMs == null) {
    return {
      label: 'Last close',
      referenceTime: referenceMs == null ? null : new Date(referenceMs).toISOString(),
      ageMinutes: referenceMs == null ? null : Math.max(0, (nowMs - referenceMs) / 60000),
    };
  }

  const ageMinutes = Math.max(0, (nowMs - referenceMs) / 60000);
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
