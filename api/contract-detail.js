function stripSecHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t\r]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim();
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/^[,.;:()\-]+|[,.;:()\-]+$/g, '');
}

function sentences(text) {
  return stripSecHtml(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter(s => s.length >= 25 && s.length <= 1600);
}

function extractCounterparty(text) {
  const source = stripSecHtml(text);
  const candidates = [];
  const patterns = [
    /\bentered into\s+(?:a|an)\s+(?:material\s+)?(?:definitive\s+)?(?:agreement|contract|arrangement)\s+with\s+(.{2,180}?)(?:\s+(?:to|for|under|pursuant)|[.;:,]|\n|$)/gi,
    /\b(?:agreement|contract|arrangement|lease|order)\s+with\s+(.{2,180}?)(?:\s+(?:to|for|under|pursuant|dated)|[.;:,]|\n|$)/gi,
    /\bbetween\s+(.{2,140}?)\s+and\s+(.{2,140}?)(?:[.;:,]|\n|$)/gi
  ];
  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      for (let i = 1; i < match.length; i++) {
        const value = clean(match[i]);
        if (
          value &&
          value.length <= 100 &&
          value.split(/\s+/).length <= 12 &&
          !/^(the company|the registrant|the parties|its subsidiary|certain parties)$/i.test(value)
        ) candidates.push(value);
      }
    }
  }
  return [...new Set(candidates)][0] || null;
}

function parseMoney(raw) {
  const n = Number(String(raw).replace(/[$,]/g, '').match(/\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(n)) return 0;
  const s = String(raw).toLowerCase();
  if (s.includes('trillion')) return n * 1e12;
  if (s.includes('billion') || s.includes('bn')) return n * 1e9;
  if (s.includes('million') || s.includes('mm')) return n * 1e6;
  if (/\$?\s*\d+(?:\.\d+)?\s*m$/i.test(s)) return n * 1e6;
  if (/\$?\s*\d+(?:\.\d+)?\s*k$/i.test(s)) return n * 1e3;
  return n;
}

function extractContract(html, symbol, accession) {
  const rows = sentences(html);
  const relevant = rows.filter(row =>
    /\b(agreement|contract|lease|order|purchase|commitment|obligation|capacity|colocation|services?)\b/i.test(row)
  );

  const counterparty = extractCounterparty(html);
  const money = [];
  for (const row of relevant) {
    for (const match of row.matchAll(/(?:US\$|\$)\s?\d+(?:,\d{3})*(?:\.\d+)?\s?(?:trillion|billion|million|bn|mm|m|k)?/gi)) {
      money.push(match[0]);
    }
  }
  const disclosedValue = money.length
    ? money.sort((a, b) => parseMoney(b) - parseMoney(a))[0]
    : null;

  const durationRow = relevant.find(row =>
    /\b\d+(?:\.\d+)?\s*[- ]?(?:year|years|month|months)\b/i.test(row)
  );
  const durationMatch = durationRow?.match(/\b(\d+(?:\.\d+)?)\s*[- ]?(year|years|month|months)\b/i);
  const duration = durationMatch ? durationMatch[1] + ' ' + durationMatch[2] : null;

  const capacityRows = rows.filter(row =>
    /\b\d+(?:\.\d+)?\s*(?:MW|GW|megawatts?|gigawatts?)\b/i.test(row)
  );
  const capacity = capacityRows[0] || null;

  const hardwareRows = rows.filter(row =>
    /\b(?:NVIDIA|Blackwell|Rubin|GPU|GPUs|accelerator|server|compute|data center|datacenter|colocation|storage|SSD)\b/i.test(row)
  );
  const hardware = hardwareRows[0] || null;

  const evidence = [...new Set(
    (relevant.length ? relevant : rows)
      .slice(0, 5)
      .filter(row => !/^signature page$/i.test(row))
  )].slice(0, 4);

  const summary = (counterparty && relevant.find(row => row.toLowerCase().includes(counterparty.toLowerCase()))) ||
    relevant.find(row => /\$(?:\d|,\d)|\b\d+(?:\.\d+)?\s*(?:MW|GW|year|years|month|months)\b/i.test(row)) ||
    relevant[0] ||
    null;

  return {
    symbol,
    accession,
    counterparty,
    disclosedValue,
    duration,
    capacity,
    hardware,
    summary,
    evidence,
    source: 'sec-edgar-primary'
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  const rawUrl = String(req.query?.url || '');
  let filingUrl;
  try {
    filingUrl = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'A valid SEC filing URL is required.' });
  }

  if (
    filingUrl.protocol !== 'https:' ||
    filingUrl.hostname !== 'www.sec.gov' ||
    !filingUrl.pathname.startsWith('/Archives/edgar/data/')
  ) {
    return res.status(400).json({ error: 'Only SEC EDGAR archive URLs are allowed.' });
  }

  try {
    const response = await fetch(filingUrl.toString(), {
      headers: {
        'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)',
        'Accept-Encoding': 'gzip, deflate'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'SEC filing fetch failed: HTTP ' + response.status });
    }

    const html = await response.text();
    const accession = String(req.query?.accession || '');
    const symbol = String(req.query?.symbol || '').toUpperCase();
    return res.status(200).json(extractContract(html, symbol, accession));
  } catch {
    return res.status(504).json({ error: 'SEC filing fetch timed out or failed.' });
  }
}
