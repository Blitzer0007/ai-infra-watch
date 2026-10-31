export type EvidenceAvailability = {
  complete?: boolean;
  missing?: string[];
  observed_families?: string[];
  usable_families?: string[];
  usable_family_count?: number;
  channels?: Record<string, { status?: string; observedCalls?: number; usableCalls?: number; failedCalls?: number; successfulCalls?: number }>;
};

export type EvidenceGateDiagnostics = {
  minimum_independent_families?: number;
  missing_required_families?: string[];
  conflict_count?: number;
  enabled?: boolean;
  fallback?: boolean;
};

export function describeJevEvidenceGap(
  availability: EvidenceAvailability,
  gate: EvidenceGateDiagnostics,
  action: string,
): { message: string; dedupeSuffix: string } {
  const requiredMissing = [...new Set([
    ...(Array.isArray(availability.missing) ? availability.missing : []),
    ...(Array.isArray(gate.missing_required_families) ? gate.missing_required_families : []),
  ])].sort();
  const usableFamilies = Array.isArray(availability.usable_families) ? availability.usable_families : [];
  const usableCountRaw = Number(availability.usable_family_count);
  const usableCount = Number.isFinite(usableCountRaw) ? usableCountRaw : usableFamilies.length;
  const minimumRaw = Number(gate.minimum_independent_families);
  const minimum = Number.isFinite(minimumRaw) && minimumRaw > 0 ? minimumRaw : 2;
  const observed = new Set(Array.isArray(availability.observed_families) ? availability.observed_families : []);
  for (const family of requiredMissing) observed.add(family);
  const channels = availability.channels && typeof availability.channels === 'object' ? availability.channels : {};
  const unavailable = [...observed]
    .map(family => ({ family, status: String(channels[family]?.status || 'UNKNOWN').toUpperCase() }))
    .filter(item => item.status !== 'AVAILABLE')
    .sort((a, b) => a.family.localeCompare(b.family))
    .map(item => item.family + '=' + item.status);
  const parts: string[] = [];
  if (availability.complete !== true) {
    parts.push('Evidence availability is INCOMPLETE');
  } else {
    parts.push('Evidence availability is marked complete');
  }
  parts.push('usable independent families: ' + usableCount + '/' + minimum + ' minimum (' + (usableFamilies.length ? usableFamilies.join(', ') : 'none reported') + ')');
  parts.push('missing required families: ' + (requiredMissing.length ? requiredMissing.join(', ') : 'none declared'));
  if (unavailable.length) parts.push('observed channels without usable evidence: ' + unavailable.join(', '));
  else if (availability.complete !== true && !requiredMissing.length && usableCount >= minimum) {
    parts.push('backend did not identify the specific availability failure');
  }
  if (gate.fallback === true || gate.enabled === false) {
    parts.push('JEV assessment was unavailable or used fallback; allocator readiness is blocked');
  } else if (gate.enabled !== true) {
    parts.push('JEV enabled state was not confirmed; allocator readiness is blocked');
  }
  if (action === 'stop' && availability.complete !== true) {
    parts.push('WARNING: JEV action was “stop”, but the separate availability check is incomplete; treat this as blocked pending diagnostics');
  } else if (action) {
    parts.push('reported JEV action: ' + action);
  }
  const suffix = [
    'complete=' + String(availability.complete === true),
    'usable=' + usableCount + '/' + minimum,
    'required=' + requiredMissing.join(','),
    'channels=' + unavailable.join(','),
    'action=' + action,
    'enabled=' + String(gate.enabled === true),
    'fallback=' + String(gate.fallback === true),
  ].join('|');
  return { message: parts.join('; ') + '.', dedupeSuffix: suffix.replace(/[^A-Za-z0-9:_|=,./-]/g, '_').slice(0, 240) };
}
