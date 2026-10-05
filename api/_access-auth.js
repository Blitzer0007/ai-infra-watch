const configuredAccessTokens = () => [
  process.env.AIW_ACCESS_TOKEN,
  process.env.AGENT_API_TOKEN,
  process.env.CRON_SECRET,
].map(value => String(value || '').trim()).filter(Boolean);

function bearerToken(req) {
  const value = String(req.headers?.authorization || '').trim();
  if (!value.startsWith('Bearer ')) return '';
  return value.slice(7).trim();
}

export function requireAccess(req, res) {
  const expected = configuredAccessTokens();
  if (!expected.length) {
    res.status(503).json({
      ok: false,
      error: 'Private access is not configured',
      hint: 'Set AIW_ACCESS_TOKEN in Vercel environment variables before enabling private endpoints.',
    });
    return false;
  }
  if (!expected.includes(bearerToken(req))) {
    res.status(401).json({ ok: false, error: 'Authentication required' });
    return false;
  }
  return true;
}

export function accessConfigured() {
  return configuredAccessTokens().length > 0;
}
