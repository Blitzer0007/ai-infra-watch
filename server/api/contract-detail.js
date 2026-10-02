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
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,.;:()\-]+|[,.;:()\-]+$/g, '');
}

function sentences(text) {
  return stripSecHtml(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter(s => s.length >= 25 && s.length <= 1800);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return null;
}

function extractCounterparty(text) {
  const source = stripSecHtml(text);
  const candidates = [];

  const patterns = [
    /\bentered into\s+(?:a|an)\s+(?:material\s+)?(?:definitive\s+)?(?:agreement|contract|arrangement|lease)\s+with\s+(.{2,220}?)(?:\s+(?:to|for|under|pursuant|effective|dated)|[.;:]|\n|$)/gi,
    /\b(?:agreement|contract|arrangement|lease|order)\s+(?:was\s+)?(?:entered into\s+)?with\s+(.{2,220}?)(?:\s+(?:to|for|under|pursuant|effective|dated)|[.;:]|\n|$)/gi,
    /\bbetween\s+(.{2,160}?)\s+and\s+(.{2,160}?)(?:[.;:]|\n|$)/gi
  ];

  for (const re of patterns) {
    for (const match of source.matchAll(re)) {
      for (let i = 1; i < match.length; i++) {
        const value = clean(match[i]);
        if (
          value &&
          value.length <= 120 &&
          value.split(/\s+/).length <= 16 &&
          !/^(the company|the registrant|the parties|its subsidiary|certain parties|the issuer)$/i.test(value)
        ) {
          candidates.push(value);
        }
      }
    }
  }

  return unique(candidates)[0] || null;
}

function parseMoney(raw) {
  const match = String(raw).match(/(?:US\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*(trillion|billion|million|bn|mm|m|k)?/i);
  if (!match) return 0;

  const n = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;

  const unit = String(match[2] || '').toLowerCase();
  if (unit === 'trillion') return n * 1e12;
  if (unit === 'billion' || unit === 'bn') return n * 1e9;
  if (unit === 'million' || unit === 'mm' || unit === 'm') return n * 1e6;
  if (unit === 'k') return n * 1e3;
  return n;
}

function moneyPhrase(row) {
  const matches = row.match(/(?:up to\s+|approximately\s+|about\s+|aggregate\s+of\s+|total of\s+|minimum of\s+|commit(?:ted|ment)?\s+(?:of|to)\s+)?(?:US\$|\$)\s*[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:trillion|billion|million|bn|mm|m|k)?/gi) || [];
  return matches.length
    ? matches.sort((a, b) => parseMoney(b) - parseMoney(a))[0]
    : null;
}

function extractDisclosedValue(rows) {
  const prioritized = rows.filter(row =>
    /\b(contract|agreement|lease|order|purchase|commitment|committed|consideration|payments?|revenue|fees?|backlog)\b/i.test(row) &&
    /(?:US\$|\$)\s*[0-9]/i.test(row)
  );

  for (const row of prioritized) {
    const value = moneyPhrase(row);
    if (value) return value;
  }

  return null;
}

function extractDuration(rows) {
  const row = rows.find(item =>
    /\b(?:term|period|duration|over|for|during)\b/i.test(item) &&
    /\b\d+(?:\.\d+)?\s*[- ]?(?:year|years|month|months|quarter|quarters)\b/i.test(item)
  ) || rows.find(item =>
    /\b\d+(?:\.\d+)?\s*[- ]?(?:year|years|month|months|quarter|quarters)\b/i.test(item)
  );

  if (!row) return null;

  const match = row.match(/\b\d+(?:\.\d+)?\s*[- ]?(?:year|years|month|months|quarter|quarters)\b/i);
  return match ? match[0] : null;
}

function extractCapacity(rows) {
  const row = rows.find(item =>
    /\b(?:up to|approximately|about|capacity|power|load|facility|campus|data center|datacentre|colocation)\b/i.test(item) &&
    /\b\d+(?:\.\d+)?\s*(?:MW|GW|megawatts?|gigawatts?|kW|kilowatts?)\b/i.test(item)
  );

  if (row) {
    const match = row.match(/\b(?:up to\s+|approximately\s+|about\s+)?\d+(?:\.\d+)?\s*(?:MW|GW|megawatts?|gigawatts?|kW|kilowatts?)\b/i);
    return match ? clean(match[0]) : row;
  }

  return null;
}

function extractHardware(rows) {
  const row = rows.find(item =>
    /\b(?:NVIDIA|AMD|Intel|Blackwell|Rubin|Hopper|GPU|GPUs|accelerator|accelerators|server|servers|compute|data center|datacenter|colocation|storage|SSD|HBM|rack|cluster)\b/i.test(item)
  );
  return row || null;
}

function extractGeography(rows) {
  const row = rows.find(item =>
    /\b(?:located in|based in|situated in|facility in|campus in|data center in|datacenter in|site in|operations in)\b/i.test(item)
  );
  return row || null;
}

function extractPaymentTerms(rows) {
  const row = rows.find(item =>
    /\b(?:payment|payments|fee|fees|pricing|price|minimum commitment|take-or-pay|milestone payment|deposit|prepayment|revenue share|revenue sharing|monthly fee|annual fee)\b/i.test(item)
  );
  return row || null;
}

function extractCommercialModel(rows) {
  const row = rows.find(item =>
    /\b(?:lease|leasing|subscription|services agreement|colocation|hosting|capacity reservation|purchase agreement|supply agreement|master services|managed services|bare[- ]metal|gpu-as-a-service)\b/i.test(item)
  );
  return row || null;
}

function coverage(fields) {
  const found = fields.filter(Boolean).length;
  if (found >= 6) return { level: 'High', percent: 85 };
  if (found >= 4) return { level: 'Moderate', percent: 65 };
  if (found >= 2) return { level: 'Limited', percent: 40 };
  return { level: 'Minimal', percent: 20 };
}

function extractContract(html, symbol, accession) {
  const rows = sentences(html);
  const relevant = rows.filter(row =>
    /\b(agreement|contract|lease|order|purchase|commitment|obligation|capacity|colocation|services?|hosting|supply)\b/i.test(row)
  );

  const counterparty = extractCounterparty(html);
  const disclosedValue = extractDisclosedValue(rows);
  const duration = extractDuration(relevant);
  const capacity = extractCapacity(rows);
  const hardware = extractHardware(relevant.length ? relevant : rows);
  const geography = extractGeography(rows);
  const paymentTerms = extractPaymentTerms(relevant);
  const commercialModel = extractCommercialModel(relevant);

  const evidence = unique([
    counterparty ? 'Counterparty: ' + counterparty : null,
    disclosedValue ? 'Value: ' + disclosedValue : null,
    duration ? 'Duration: ' + duration : null,
    capacity ? 'Capacity: ' + capacity : null,
    paymentTerms ? 'Payment/commercial term: ' + paymentTerms : null,
    commercialModel ? 'Commercial model: ' + commercialModel : null,
    geography ? 'Geography: ' + geography : null,
    hardware ? 'Hardware/infrastructure: ' + hardware : null,
  ]).slice(0, 8);

  const summary =
    relevant.find(row =>
      (counterparty && row.toLowerCase().includes(counterparty.toLowerCase())) &&
      (disclosedValue ? row.includes(disclosedValue) : true)
    ) ||
    relevant.find(row => /(?:contract|agreement|lease|order|commitment)\b/i.test(row)) ||
    relevant[0] ||
    null;

  const extraction = coverage([
    counterparty,
    disclosedValue,
    duration,
    capacity,
    hardware,
    geography,
    paymentTerms,
    commercialModel
  ]);

  return {
    symbol,
    accession,
    counterparty,
    disclosedValue,
    duration,
    capacity,
    hardware,
    geography,
    paymentTerms,
    commercialModel,
    summary,
    evidence,
    extractionCoverage: extraction,
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
