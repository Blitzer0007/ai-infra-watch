import * as shared from '../../shared/freshness.js';
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

export function classifyFreshness(input:FreshnessInput,nowMs=Date.now()):FreshnessResult { return shared.classifyFreshness(input,nowMs) as FreshnessResult; }
export function freshnessLabel(input:FreshnessInput,nowMs=Date.now()):FreshnessLabel { return shared.freshnessLabel(input,nowMs) as FreshnessLabel; }
export function formatFreshnessAge(ageMinutes:number|null):string { return shared.formatFreshnessAge(ageMinutes); }
