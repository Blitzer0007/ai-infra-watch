/* ============================================================
   AI INFRA WATCH — core.js
   Config storage, Finnhub API wrapper, ticker, shared utils.
   No build step. No tracking. Everything lives in localStorage
   on the visitor's own machine.
   ============================================================ */

const APP = (() => {

  const STORAGE_KEY = 'aiw_config_v1';
  const ALERTS_KEY  = 'aiw_alerts_v1';
  const CACHE_KEY   = 'aiw_quote_cache_v1';
  const THEME_KEY   = 'aiw_theme';

  const DEFAULT_CONFIG = {
    finnhubKey: '',
    watchlist: ['NVDA', 'NBIS', 'DGXX', 'MSFT', 'META', 'AVGO'],
    refreshSeconds: 60,
    backendUrl: 'http://localhost:8000'
  };

  const DEFAULT_ALERTS = [
    { id: 'a1', symbol: 'NVDA', type: 'pct_change', op: '<=', value: -5, window: '1d', label: 'NVDA drops 5%+ in a day', enabled: true },
    { id: 'a2', symbol: 'NBIS', type: 'pct_change', op: '>=', value: 8,  window: '1d', label: 'NBIS jumps 8%+ in a day', enabled: true },
    { id: 'a3', symbol: 'NBIS', type: 'news_keyword', value: 'contract', label: 'New contract headline for NBIS', enabled: true },
    { id: 'a4', symbol: 'DGXX', type: 'pct_change', op: '>=', value: 15, window: '1d', label: 'DGXX jumps 15%+ in a day (small-cap, expect bigger swings)', enabled: true },
  ];

  function loadConfig(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { ...DEFAULT_CONFIG };
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }catch(e){ return { ...DEFAULT_CONFIG }; }
  }

  function saveConfig(cfg){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  function loadAlerts(){
    try{
      const raw = localStorage.getItem(ALERTS_KEY);
      if(!raw) return [...DEFAULT_ALERTS];
      return JSON.parse(raw);
    }catch(e){ return [...DEFAULT_ALERTS]; }
  }

  function saveAlerts(alerts){
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  }

  function getCache(){
    try{ return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); }
    catch(e){ return {}; }
  }
  function setCache(sym, data){
    const c = getCache();
    c[sym] = { ...data, _ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  }

  /* ---------------- Finnhub wrapper ---------------- */
  const BASE = 'https://finnhub.io/api/v1';

  async function fetchQuote(symbol){
    const cfg = loadConfig();
    if(!cfg.finnhubKey){
      throw { code: 'NO_KEY', message: 'No API key configured' };
    }
    const url = `${BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${cfg.finnhubKey}`;
    const res = await fetch(url);
    if(res.status === 429){
      throw { code: 'RATE_LIMIT', message: 'Rate limited by Finnhub (60 calls/min on free tier)' };
    }
    if(!res.ok){
      throw { code: 'HTTP_ERROR', message: `Finnhub returned ${res.status}` };
    }
    const data = await res.json();
    // Finnhub returns all-zero payload for invalid symbols rather than an error
    if(data.c === 0 && data.h === 0 && data.l === 0 && data.pc === 0){
      throw { code: 'NO_DATA', message: `No data for symbol ${symbol}` };
    }
    const normalized = {
      symbol,
      price: data.c,
      change: data.d,
      changePct: data.dp,
      high: data.h,
      low: data.l,
      open: data.o,
      prevClose: data.pc
    };
    setCache(symbol, normalized);
    return normalized;
  }

  async function fetchQuotes(symbols){
    // Sequential with small stagger to stay well under 60/min free-tier limit
    const out = {};
    for(const sym of symbols){
      try{
        out[sym] = { ok: true, data: await fetchQuote(sym) };
      }catch(err){
        const cached = getCache()[sym];
        out[sym] = { ok: false, error: err, cached: cached || null };
      }
      await new Promise(r => setTimeout(r, 150));
    }
    return out;
  }

  async function fetchCompanyNews(symbol, fromDate, toDate){
    const cfg = loadConfig();
    if(!cfg.finnhubKey) throw { code: 'NO_KEY', message: 'No API key configured' };
    const url = `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&token=${cfg.finnhubKey}`;
    const res = await fetch(url);
    if(res.status === 429) throw { code: 'RATE_LIMIT', message: 'Rate limited' };
    if(!res.ok) throw { code: 'HTTP_ERROR', message: `Finnhub returned ${res.status}` };
    return res.json();
  }

  /* ---------------- backend agent (SupervisorAgent /api/ask) ---------------- */
  // Talks to the Python FastAPI backend (app.main:app). Unlike the Finnhub
  // calls above, this hits our OWN service, whose base URL lives in config
  // (default http://localhost:8000) so a user can point the static dashboard
  // at a remote deployment. Errors are normalized to the same {code, message}
  // shape the rest of the app throws, so callers handle them uniformly.
  async function askAgent(question){
    const q = (question || '').trim();
    if(!q) throw { code: 'EMPTY', message: 'Ask a question first' };
    const cfg = loadConfig();
    const base = (cfg.backendUrl || DEFAULT_CONFIG.backendUrl).replace(/\/+$/, '');
    let res;
    try{
      res = await fetch(`${base}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q })
      });
    }catch(err){
      // fetch() rejects only on network/CORS failure — the backend is unreachable.
      throw { code: 'UNREACHABLE', message: `Backend unreachable at ${base} — is it running? (uvicorn app.main:app)` };
    }
    if(!res.ok){
      let detail = `Backend returned ${res.status}`;
      try{ const body = await res.json(); if(body && body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); }catch(e){}
      throw { code: res.status === 422 ? 'BAD_REQUEST' : 'HTTP_ERROR', message: detail };
    }
    return res.json();
  }

  // Earnings: past + upcoming reports (with historical price reaction) for a
  // set of symbols, from our own /api/earnings. Same base-URL + normalized
  // {code, message} error handling as askAgent, so the tracker page handles a
  // down backend identically to the ask page.
  async function fetchEarnings(symbols){
    const syms = (symbols || []).map(s => (s || '').trim().toUpperCase()).filter(Boolean);
    const cfg = loadConfig();
    const base = (cfg.backendUrl || DEFAULT_CONFIG.backendUrl).replace(/\/+$/, '');
    const qs = syms.length ? `?symbols=${encodeURIComponent(syms.join(','))}` : '';
    let res;
    try{
      res = await fetch(`${base}/api/earnings${qs}`);
    }catch(err){
      throw { code: 'UNREACHABLE', message: `Backend unreachable at ${base} — is it running? (uvicorn app.main:app)` };
    }
    if(!res.ok){
      let detail = `Backend returned ${res.status}`;
      try{ const body = await res.json(); if(body && body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); }catch(e){}
      throw { code: res.status === 422 ? 'BAD_REQUEST' : 'HTTP_ERROR', message: detail };
    }
    return res.json();
  }

  // Milestones: auto-maintained timeline of a symbol's material events, derived
  // from its recent SEC 8-K filings, from our own /api/milestones. Same
  // base-URL + normalized {code, message} error handling as fetchEarnings.
  async function fetchMilestones(symbols){
    const syms = (symbols || []).map(s => (s || '').trim().toUpperCase()).filter(Boolean);
    const cfg = loadConfig();
    const base = (cfg.backendUrl || DEFAULT_CONFIG.backendUrl).replace(/\/+$/, '');
    const qs = syms.length ? `?symbols=${encodeURIComponent(syms.join(','))}` : '';
    let res;
    try{
      res = await fetch(`${base}/api/milestones${qs}`);
    }catch(err){
      throw { code: 'UNREACHABLE', message: `Backend unreachable at ${base} — is it running? (uvicorn app.main:app)` };
    }
    if(!res.ok){
      let detail = `Backend returned ${res.status}`;
      try{ const body = await res.json(); if(body && body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail); }catch(e){}
      throw { code: res.status === 422 ? 'BAD_REQUEST' : 'HTTP_ERROR', message: detail };
    }
    return res.json();
  }
  function fmtPrice(n){
    if(n === null || n === undefined || isNaN(n)) return '—';
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPct(n){
    if(n === null || n === undefined || isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(2)}%`;
  }
  function fmtTime(ts){
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function timeAgo(ts){
    const s = Math.floor((Date.now() - ts) / 1000);
    if(s < 60) return `${s}s ago`;
    if(s < 3600) return `${Math.floor(s/60)}m ago`;
    return `${Math.floor(s/3600)}h ago`;
  }

  /* ---------------- ticker strip ---------------- */
  async function renderTicker(){
    const el = document.getElementById('ticker-track');
    if(!el) return;
    const cfg = loadConfig();
    const symbols = cfg.watchlist.slice(0, 8);

    if(!cfg.finnhubKey){
      el.innerHTML = tickerPlaceholder();
      return;
    }

    const results = await fetchQuotes(symbols);
    const items = symbols.map(sym => {
      const r = results[sym];
      if(r.ok){
        const d = r.data;
        const dir = d.changePct >= 0 ? 'up' : 'down';
        const arrow = d.changePct >= 0 ? '▲' : '▼';
        return tickerItem(sym, fmtPrice(d.price), fmtPct(d.changePct), dir, arrow);
      } else if(r.cached){
        const d = r.cached;
        const dir = d.changePct >= 0 ? 'up' : 'down';
        return tickerItem(sym, fmtPrice(d.price), fmtPct(d.changePct), dir, '·', true);
      } else {
        return `<span class="t-item"><span class="t-sym">${sym}</span><span class="faint">no data</span></span>`;
      }
    });
    // duplicate the list so the scroll loop is seamless
    el.innerHTML = items.join('') + items.join('');
  }

  function tickerItem(sym, price, pct, dir, arrow, stale=false){
    return `<span class="t-item"><span class="t-sym">${sym}</span><span>$${price}</span><span class="${dir==='up'?'t-up':'t-down'}">${arrow} ${pct}</span>${stale ? '<span class="faint">(cached)</span>' : ''}</span>`;
  }

  function tickerPlaceholder(){
    return `<span class="t-item faint">Add a free Finnhub API key in Settings to light up the live ticker →</span>
            <span class="t-item"><a href="settings.html" style="color:var(--amber)">Go to Settings</a></span>`;
  }

  /* ---------------- nav active state ---------------- */
  function markActiveNav(){
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav a').forEach(a => {
      const href = a.getAttribute('href');
      if(href === path) a.classList.add('active');
    });
  }

  /* ---------------- freshness badge helper ---------------- */
  function freshnessBadge(state, label){
    // state: 'live' | 'stale' | 'manual' | 'error'
    return `<span class="fresh ${state}"><span class="dot"></span>${label}</span>`;
  }

  /* ---------------- theme (dark / light) ---------------- */
  // 'dark' is the default. The chosen theme is applied to <html> via a
  // data-theme attribute that css/main.css reads; it persists in
  // localStorage. To avoid a flash of the wrong theme, each page also
  // applies the saved value in an inline <head> script before paint —
  // this module keeps that in sync and drives the toggle button.
  function loadTheme(){
    try{ return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; }
    catch(e){ return 'dark'; }
  }
  function applyTheme(theme){
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
    updateThemeToggle(t);
    return t;
  }
  function toggleTheme(){
    return applyTheme(loadTheme() === 'light' ? 'dark' : 'light');
  }
  function toggleMarkup(theme){
    // The button offers the OTHER theme — icon + label describe the switch.
    return theme === 'light'
      ? '<span class="tt-ico">☾</span><span class="tt-label">Dark</span>'
      : '<span class="tt-ico">☀</span><span class="tt-label">Light</span>';
  }
  function updateThemeToggle(theme){
    const btn = document.getElementById('theme-toggle');
    if(btn){
      btn.innerHTML = toggleMarkup(theme);
      btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }
  }
  function injectThemeToggle(){
    const wrap = document.querySelector('.ticker-wrap');
    if(!wrap || document.getElementById('theme-toggle')) return;
    const theme = loadTheme();
    const btn = document.createElement('button');
    btn.id = 'theme-toggle';
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.innerHTML = toggleMarkup(theme);
    btn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    btn.addEventListener('click', toggleTheme);
    wrap.appendChild(btn);
  }

  return {
    loadConfig, saveConfig, loadAlerts, saveAlerts,
    getCache, setCache,
    fetchQuote, fetchQuotes, fetchCompanyNews, askAgent, fetchEarnings, fetchMilestones,
    fmtPrice, fmtPct, fmtTime, timeAgo,
    renderTicker, markActiveNav, freshnessBadge,
    loadTheme, applyTheme, toggleTheme, injectThemeToggle
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  APP.applyTheme(APP.loadTheme());
  APP.injectThemeToggle();
  APP.markActiveNav();
  APP.renderTicker();
  // refresh ticker on the cadence set in Settings (default 60s)
  const cfg = APP.loadConfig();
  setInterval(() => APP.renderTicker(), Math.max(20, cfg.refreshSeconds) * 1000);
});
