// Fixed diagnostic vocabulary only. Raw upstream messages can contain credentials.
const PROVIDERS = {
  yahoo: 'Yahoo',
  finnhub: 'Finnhub',
  'alpha-vantage': 'Alpha Vantage',
};
const REASONS = {
  rate_limited: 'rate limited',
  not_configured: 'not configured',
  timeout: 'timed out',
  no_data: 'returned no price',
  provider_server_error: 'service error',
  provider_http_error: 'request rejected',
  provider_error: 'request failed',
};

export function quoteFailureReason(error) {
  const attempts = Array.isArray(error?.providers) ? error.providers.slice(0, 3) : [];
  const reasons = [];
  for (const attempt of attempts) {
    const provider = Object.hasOwn(PROVIDERS, attempt?.provider) ? PROVIDERS[attempt.provider] : null;
    const reason = Object.hasOwn(REASONS, attempt?.errorCode) ? REASONS[attempt.errorCode] : null;
    if (provider && reason) reasons.push(provider + ' ' + reason);
  }
  return reasons.length ? 'Quote retrieval failed: ' + reasons.join('; ') + '.' : 'Quote retrieval failed; review provider availability.';
}

export function explainQuoteFailures(review, entries) {
  const failures = new Map(entries.filter(entry => typeof entry[2] === 'string').map(entry => [entry[0], entry[2]]));
  return {
    ...review,
    accountingIssues: review.accountingIssues.map(issue =>
      issue.code === 'QUOTE_WITHHELD' && failures.has(issue.symbol)
        ? { ...issue, message: failures.get(issue.symbol) }
        : issue),
  };
}
