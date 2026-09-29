const ITEM_TITLES = {
  '1.01': 'Entry into a Material Definitive Agreement',
  '1.02': 'Termination of a Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '2.01': 'Completion of Acquisition or Disposition of Assets',
  '2.02': 'Results of Operations and Financial Condition',
  '2.03': 'Creation of a Material Direct Financial Obligation',
  '2.05': 'Costs Associated with Exit or Disposal Activities',
  '3.01': 'Notice of Delisting or Failure to Satisfy a Listing Rule',
  '3.02': 'Unregistered Sale of Equity Securities',
  '3.03': 'Material Modification to Rights of Security Holders',
  '4.01': 'Changes in Registrant\'s Certifying Accountant',
  '4.02': 'Non-Reliance on Previously Issued Financial Statements',
  '5.01': 'Changes in Control of Registrant',
  '5.02': 'Departure or Appointment of Directors or Officers',
  '5.03': 'Amendments to Articles of Bylaws',
  '5.07': 'Submission of Matters to a Vote of Security Holders',
  '7.01': 'Regulation FD Disclosure',
  '8.01': 'Other Events'
};

function categoryFor(items, title = '') {
  const set = new Set(items);
  const text = title.toLowerCase();

  if (set.has('2.02') || set.has('4.02') || text.includes('financial')) return 'Earnings / Financial';
  if (set.has('1.01') || set.has('1.02') || set.has('2.03')) return 'Contracts / Commercial';
  if (set.has('5.01') || set.has('5.02') || set.has('5.03')) return 'Management / Corporate';
  if (set.has('3.01') || set.has('3.02') || set.has('3.03') || set.has('7.01')) return 'Regulatory / Disclosure';
  if (set.has('2.01') || set.has('2.05')) return 'Strategic / Asset';
  return 'Other';
}

function cleanSymbol(value) {
  return String(value || '').trim().toUpperCase();
}

function validSymbol(symbol) {
  return /^[A-Z0-9.^=-]{1,20}$/.test(symbol);
}

function titleFor(items) {
  for (const item of items) {
    if (ITEM_TITLES[item]) return ITEM_TITLES[item];
  }
  return 'Material SEC event';
}

export default async function handler(req, res) {
  const symbol = cleanSymbol(req.query?.symbol);
  const limit = Math.min(Math.max(Number(req.query?.limit) || 12, 1), 20);

  if (!validSymbol(symbol)) {
    return res.status(400).json({ error: 'Valid stock symbol is required.' });
  }

  const ua = {
    'User-Agent': 'AI Infra Watch/1.0 (research dashboard; contact: dev@example.com)',
    'Accept-Encoding': 'gzip, deflate'
  };

  try {
    const tickerResponse = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: ua });
    if (!tickerResponse.ok) {
      return res.status(502).json({ error: 'SEC ticker directory unavailable.' });
    }

    const tickerMap = await tickerResponse.json();
    let cik = null;

    for (const entry of Object.values(tickerMap)) {
      if (entry && String(entry.ticker || '').toUpperCase() === symbol) {
        cik = String(entry.cik_str).padStart(10, '0');
        break;
      }
    }

    if (!cik) {
      return res.status(404).json({
        symbol,
        source: 'sec-edgar-primary',
        events: [],
        error: 'SEC issuer/ticker not found for ' + symbol
      });
    }

    const response = await fetch('https://data.sec.gov/submissions/CIK' + cik + '.json', { headers: ua });
    if (!response.ok) {
      return res.status(502).json({ error: 'SEC submissions unavailable.' });
    }

    const payload = await response.json();
    const recent = payload?.filings?.recent;
    if (!recent) return res.status(200).json({ symbol, source: 'sec-edgar-primary', events: [] });

    const events = [];
    const forms = recent.form || [];
    for (let i = 0; i < forms.length && events.length < limit; i++) {
      if (forms[i] !== '8-K') continue;
      const filedDate = recent.filingDate?.[i];
      const accession = recent.accessionNumber?.[i];
      const primaryDocument = recent.primaryDocument?.[i];
      if (!filedDate || !accession || !primaryDocument) continue;

      const items = String(recent.items?.[i] || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      const meaningfulItems = items.filter(item => ITEM_TITLES[item]);
      const selectedItems = meaningfulItems.length ? meaningfulItems : items;
      const accessionPath = accession.replaceAll('-', '');
      const url = 'https://www.sec.gov/Archives/edgar/data/' +
        Number(cik) + '/' + accessionPath + '/' + primaryDocument;

      const eventTitle = titleFor(selectedItems);
      events.push({
        id: 'sec-milestone-' + accession,
        stockSymbol: symbol,
        date: filedDate,
        title: eventTitle,
        category: categoryFor(selectedItems, eventTitle),
        items: selectedItems,
        description: selectedItems.length
          ? 'SEC 8-K disclosure · Items ' + selectedItems.join(', ') + ' · Accession ' + accession
          : 'SEC 8-K filing · Accession ' + accession,
        status: 'done',
        accession,
        url,
        source: 'sec-edgar-primary'
      });
    }

    return res.status(200).json({
      symbol,
      issuer: payload?.name || symbol,
      source: 'sec-edgar-primary',
      events
    });
  } catch (error) {
    return res.status(502).json({
      symbol,
      source: 'sec-edgar-primary',
      events: [],
      error: 'SEC milestone lookup failed.'
    });
  }
}
