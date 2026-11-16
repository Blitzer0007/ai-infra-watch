import { evaluateQuoteQuality } from './decisionEligibility';
import type { FinancialObservation, ResearchEntry } from './researchSnapshot';

export function validFinancialObservation(row: FinancialObservation, nowMs: number): boolean {
  if (!row || typeof row.id !== 'string' || !row.id.trim() || typeof row.provider !== 'string' || !row.provider.trim() || row.simulated !== false || /mock|simulat|fixture|^qa$/i.test(row.provider)) return false;
  if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.reportingBasis !== 'reported' || row.currency !== 'USD') return false;
  if ((row.metric === 'revenue-growth-pct' && row.unit !== 'percent') || (row.metric === 'free-cash-flow-usd' && row.unit !== 'USD')) return false;
  if (!['revenue-growth-pct','free-cash-flow-usd'].includes(row.metric)) return false;
  try { const url = new URL(row.sourceUrl); if (url.protocol !== 'https:' || url.username || url.password || /token|api.?key|secret|authorization/i.test(url.search)) return false; } catch { return false; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(row.periodEnd)) return false;
  if (!Number.isFinite(Date.parse(row.periodStart)) || !Number.isFinite(Date.parse(row.periodEnd))) return false;
  if (new Date(row.periodStart).toISOString().slice(0,10) !== row.periodStart || new Date(row.periodEnd).toISOString().slice(0,10) !== row.periodEnd) return false;
  const start = Date.parse(row.periodStart), end = Date.parse(row.periodEnd);
  const published = typeof row.publishedAt === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.publishedAt) ? Date.parse(row.publishedAt) : NaN;
  const retrieved = typeof row.retrievedAt === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.retrievedAt) ? Date.parse(row.retrievedAt) : NaN;
  return [start,end,published,retrieved].every(Number.isFinite) && start <= end && end <= published && published <= retrieved && retrieved <= nowMs &&
    nowMs - end <= 550 * 86400000 && nowMs - retrieved <= 7 * 86400000;
}

/** Pure research input coverage, not a portfolio-accounting or trading approval. */
export function evaluateResearchEligibility(entry: ResearchEntry, nowMs: number) {
  const quoteQuality = evaluateQuoteQuality(entry.quote,nowMs);
  const missingInputs = [...quoteQuality.reasons,...entry.inputIssues];
  if (entry.listingCountry !== 'US') missingInputs.push('A verified US listing is required; listing geography is unavailable or unsupported.');
  if (entry.assetClass === 'unknown') missingInputs.push('Asset classification is unavailable; issuer rules require a verified equity classification.');
  const companyEvidence = entry.companyEvidence;
  let listingEvidenceValid = false;
  if (companyEvidence && typeof companyEvidence.source === 'string' && companyEvidence.source.trim() && !companyEvidence.simulated && !/mock|simulat|fixture|^qa$/i.test(companyEvidence.source)) {
    const observed = Date.parse(companyEvidence.observedAt ?? '');
    try { const url = new URL(companyEvidence.url ?? '');
      listingEvidenceValid = url.protocol === 'https:' && !url.username && !url.password && !/token|api.?key|secret|authorization/i.test(url.search) && Number.isFinite(observed) && observed <= nowMs && nowMs - observed <= 7 * 86400000;
    } catch { /* Incomplete company provenance remains ineligible. */ }
  }
  if (!listingEvidenceValid) missingInputs.push('Dated, non-simulated source evidence for asset class and listing is required.');
  const financials = entry.financials.filter(row => row.symbol === entry.symbol && validFinancialObservation(row,nowMs));
  const uniqueIds = new Set(financials.map(row => row.id)).size === financials.length;
  if (!uniqueIds) missingInputs.push('Financial observation IDs collide; source references cannot be resolved safely.');
  const revenue = financials.filter(row => row.metric === 'revenue-growth-pct');
  const cash = financials.filter(row => row.metric === 'free-cash-flow-usd');
  const pair = revenue.flatMap(a => cash.filter(b => a.periodStart === b.periodStart && a.periodEnd === b.periodEnd).map(b => [a,b] as const));
  const matching = pair.sort((a,b) => b[0].periodEnd.localeCompare(a[0].periodEnd))[0];
  if (!matching) missingInputs.push('Comparable reported revenue growth and free cash flow with dated, non-simulated source evidence are required.');
  const conflicting = ['revenue-growth-pct','free-cash-flow-usd'].some(metric => {
    if (!matching) return false;
    const values = financials.filter(row => row.metric === metric && row.periodStart === matching[0].periodStart && row.periodEnd === matching[0].periodEnd).map(row => row.value);
    return new Set(values).size > 1;
  });
  if (conflicting) missingInputs.push('Financial observations conflict for the same reported period; no consensus was fabricated.');
  return { quoteQuality, missingInputs, classificationVerified:listingEvidenceValid, financials:matching && uniqueIds ? [...matching] : [],
    eligible:quoteQuality.eligible && entry.assetClass === 'equity' && entry.listingCountry === 'US' && listingEvidenceValid && entry.inputIssues.length === 0 && !!matching && uniqueIds && !conflicting,
    conflicting:conflicting || entry.quote.status === 'conflicting', accounting:entry.accounting };
}
