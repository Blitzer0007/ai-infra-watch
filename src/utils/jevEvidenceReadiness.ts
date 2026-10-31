export type JevGateState = {
  enabled?: unknown;
  fallback?: unknown;
  action?: unknown;
};

/**
 * The autonomous backend emits freshness records as:
 * { tool: "news.search", freshness: { status: "FRESH", ... } }.
 * Accept that canonical shape, plus the older flat aliases, but never infer
 * freshness from a missing or unknown status.
 */
export function hasFreshEvidence(raw: unknown): boolean {
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];

  if (items.length === 0) return false;

  return items.every(item => {
    const value = item && typeof item === 'object'
      ? item as Record<string, unknown>
      : null;
    const nestedFreshness = value?.freshness;
    const nestedStatus = nestedFreshness && typeof nestedFreshness === 'object'
      ? (nestedFreshness as Record<string, unknown>).status
      : nestedFreshness;
    const status = String(
      typeof item === 'string'
        ? item
        : value?.status ?? value?.state ?? nestedStatus ?? '',
    ).trim().toLowerCase();

    return ['fresh', 'current', 'verified'].includes(status);
  });
}

/**
 * A research packet is allocator-ready only when the agent succeeded, the
 * availability matrix is complete, TypeSafe JEV was enabled and returned a
 * non-fallback assessment, and the canonical terminal decision is "stop".
 */
export function isJevEvidenceGateReady(input: {
  availabilityComplete: unknown;
  researchOk: unknown;
  gate: JevGateState;
}): boolean {
  return input.availabilityComplete === true
    && input.researchOk === true
    && input.gate.enabled === true
    && input.gate.fallback === false
    && String(input.gate.action ?? '').trim().toLowerCase() === 'stop';
}
