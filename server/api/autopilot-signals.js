import { requireAccess } from '../../api/_access-auth.js';

const X_USERNAME = 'joinautopilot';
const X_URL = 'https://x.com/' + X_USERNAME;

function normalizeRow(row, provider) {
  const title = String(row?.title || '').trim();
  const snippet = String(row?.content || row?.description || row?.snippet || '').trim();
  const url = String(row?.url || '').trim();
  const text = title + ' ' + snippet;
  const tickers = [...new Set((text.match(/\$[A-Z]{1,6}\b/g) || []).map(value => value.slice(1)))];
  const portfolioLinks = [...new Set((text.match(/https?:\/\/(?:www\.)?(?:marketplace\.)?joinautopilot\.com\/\S+/g) || []).map(value => value.replace(/[),.]+$/g, '')))];
  const official = url.toLowerCase().startsWith('https://x.com/' + X_USERNAME.toLowerCase() + '/');
  return {
    title,
    snippet,
    url,
    publishedAt: row?.published_date || row?.published || row?.date || null,
    provider,
    official,
    sourceType: official ? 'official-x' : url.toLowerCase().includes('joinautopilot.com') ? 'official-platform' : 'secondary',
    tickers,
    portfolioLinks,
  };
}

async function braveSearch(query, limit) {
  const key = String(process.env.BRAVE_SEARCH_API_KEY || '').trim();
  if (!key) return null;
  const params = new URLSearchParams({
    q: query,
    count: String(limit),
    search_lang: 'en',
    country: 'us',
    safesearch: 'moderate',
    freshness: 'pw',
  });
  const response = await fetch('https://api.search.brave.com/res/v1/web/search?' + params.toString(), {
    headers: { Accept: 'application/json', 'X-Subscription-Token': key },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Brave HTTP ' + response.status);
  const data = await response.json();
  return {
    provider: 'brave-web',
    rows: (data?.web?.results || []).map(row => ({
      title: row?.title, description: row?.description, url: row?.url, published: row?.published,
    })),
  };
}

async function tavilySearch(query, limit) {
  const key = String(process.env.TAVILY_API_KEY || '').trim();
  if (!key) return null;
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: limit,
      include_answer: false,
      days: 7,
      include_domains: ['x.com', 'joinautopilot.com', 'marketplace.joinautopilot.com'],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Tavily HTTP ' + response.status);
  const data = await response.json();
  return {
    provider: 'tavily-web',
    rows: (data?.results || []).map(row => ({
      title: row?.title, content: row?.content, url: row?.url, published_date: row?.published_date,
    })),
  };
}

async function gdeltSearch(query, limit) {
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(limit),
    timespan: '168h',
    sort: 'datedesc',
  });
  const response = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?' + params.toString(), {
    headers: { 'User-Agent': 'AI Infra Watch/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('GDELT HTTP ' + response.status);
  const data = await response.json();
  return {
    provider: 'gdelt-discovery',
    rows: (data?.articles || []).map(row => ({
      title: row?.title, snippet: row?.seendate, url: row?.url, date: row?.seendate,
    })),
  };
}

async function search(query, limit = 12) {
  const providers = [braveSearch, tavilySearch, gdeltSearch];
  const errors = [];
  for (const provider of providers) {
    try {
      const result = await provider(query, limit);
      if (result?.rows?.length) return { ...result, errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { provider: 'unavailable', rows: [], errors };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, max-age=600, stale-while-revalidate=1800');
  if (!requireAccess(req, res)) return;

  try {
    const limitValue = Number(req.query?.limit || 12);
    const limit = Number.isFinite(limitValue) ? Math.min(20, Math.max(4, Math.floor(limitValue))) : 12;
    const result = await search(
      'site:x.com/' + X_USERNAME + ' (portfolio OR holdings OR invested OR tracker OR positions OR "$")',
      limit,
    );
    const signals = result.rows
      .map(row => normalizeRow(row, result.provider))
      .filter(row => row.url && row.title)
      .filter((row, index, all) => all.findIndex(other => other.url.toLowerCase() === row.url.toLowerCase()) === index)
      .slice(0, limit);

    return res.status(200).json({
      ok: true,
      account: {
        name: 'Autopilot',
        username: X_USERNAME,
        xUrl: X_URL,
        platformUrl: 'https://joinautopilot.com',
      },
      provider: result.provider,
      degraded: result.provider === 'gdelt-discovery' || result.provider === 'unavailable',
      signals,
      tickers: [...new Set(signals.flatMap(row => row.tickers))].sort(),
      portfolioLinks: [...new Set(signals.flatMap(row => row.portfolioLinks))],
      officialCoverage: signals.filter(row => row.official).length,
      fetchedAt: new Date().toISOString(),
      providerNotes: result.errors || [],
    });
  } catch (error) {
    console.error('autopilot signals error:', error);
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Autopilot signal retrieval failed.' });
  }
}
