# AI Infra Watch

A static, multi-page dashboard for tracking AI infrastructure stocks (NVIDIA, Nebius, Digi Power X), disclosed contracts for each company, congressional trading disclosures, and macro/political risk. No build step, no backend — plain HTML/CSS/JS you can host anywhere.

## What's inside

| Page | Purpose |
|---|---|
| `index.html` | Overview — live quotes for NVDA / NBIS / DGXX, recent headlines |
| `pages/contracts.html` | Manually-maintained ledger of disclosed Nebius (Microsoft, Meta, NVIDIA) and Digi Power X (Cerebras, SubQ AI, NVIDIA) deals, plus a local log for your own entries |
| `pages/tracker.html` | Build-out progress milestones for both companies (capacity targets vs. contract delivery) |
| `pages/congress.html` | Links to live congressional trade disclosure sources (Capitol Trades, Senate/House filings), optional FMP API integration, local trade log |
| `pages/macro.html` | Snapshot of Trump market commentary and the Iran/Strait of Hormuz situation, with links to live sources, plus a local event log |
| `pages/watchlist.html` | Rules-based flag system you configure yourself — **not trading signals** |
| `pages/settings.html` | API key, watchlist symbols, refresh interval, local data management |

## Setup (2 minutes)

1. **Get a free Finnhub API key**: register at [finnhub.io/register](https://finnhub.io/register). Free tier gives you 60 API calls/minute and real-time US quotes.
2. Open `pages/settings.html` in the site, paste your key in, click **Save key**, then **Test connection** to confirm it works.
3. Adjust the watchlist symbols if you want to track different tickers (default: NVDA, NBIS, DGXX, MSFT, META, AVGO).

That's it — the ticker strip and Overview page will start pulling live data.

**Your API key is stored only in your browser's local storage.** It is sent directly from your browser to Finnhub's API on every request. There is no backend server in this project, so nobody else can see your key — but anyone with access to your browser/device could find it in dev tools, so don't use this on a shared computer with a key you care about keeping private.

## Hosting

This is a static site — any of these work with zero configuration:

- **GitHub Pages**: push this folder to a repo, enable Pages in repo settings, done.
- **Netlify / Vercel**: drag-and-drop the folder onto their dashboard, or connect a git repo.
- **Any web server**: copy the folder to your server's web root (Apache, Nginx, Caddy, etc.) — it's just static files.
- **Locally**: open `index.html` directly in a browser, though some browsers restrict `localStorage` on `file://` URLs — if the API key doesn't seem to persist, run a tiny local server instead, e.g. `python3 -m http.server` from this folder, then visit `http://localhost:8000`.

## Important limits and honesty notes

- **The Finnhub free tier covers US equities via IEX.** It's real-time for most large-caps but may show slightly different prices than the primary exchange tick.
- **Contracts and tracker data are manually maintained**, sourced from public press releases and SEC/SEDAR filings as of June 2026 for both Nebius and Digi Power X. They will go stale — there's a local "add your own entry" tool on both pages so you can keep a running log, but the seed data needs a human to update it as new deals are announced. Note that Nebius and Digi Power X are tracked as **comparable companies, not counterparties** — no direct contract between the two was found.
- **The congressional trading page does not pull a live feed by default.** It links to Capitol Trades (free, real-time aggregator, no key needed) and the official Senate/House disclosure portals. There's an optional integration with Financial Modeling Prep's free-tier API (250 calls/day) if you want data embedded directly — note that congressional disclosures themselves lag actual trades by up to 45 days under the STOCK Act, regardless of which tool you use.
- **The Macro & Politics page is a snapshot, not a feed.** Political and geopolitical situations move fast; the page links out to live news sources rather than pretending to be current days or weeks after you read it.
- **The Watchlist page is a rules engine, not a forecasting tool.** It checks thresholds you define (e.g. "NVDA drops 5% in a day") against live prices and tells you when they're triggered. It does not predict price direction, does not recommend trades, and "correct timing" for buying or selling isn't something any tool can reliably provide — that judgment call stays with you.

## Extending it

- Swap Finnhub for another provider (Alpha Vantage, Twelve Data, Polygon) by editing the `fetchQuote` function in `js/core.js` — the rest of the site only depends on the normalized `{ symbol, price, change, changePct, high, low, open, prevClose }` shape it returns.
- Add more symbols to the contracts/tracker seed data directly in the HTML — each page's table/timeline is plain markup, easy to extend.
- The freshness-badge system (`live` / `stale` / `manual` / `error`) in `css/main.css` is reused everywhere; keep using it for any new data block so the whole site stays honest about what's current vs. cached vs. hand-maintained.

This project does not provide investment advice. Markets involve risk of loss. Verify anything here against primary sources before acting on it.
