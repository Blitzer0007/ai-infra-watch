<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ad4629e7-12ed-4840-8e1c-1a004be9b39a

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. For the current Vite + Vercel live-data path, no LLM key is required. The deployed `api/live-data.js` path uses public Yahoo/GDELT endpoints; Finnhub is optional for browser-side quotes.
3. Run the app:
   `npm run dev`

### API keys and credentials

There are two backend paths in this repository:

| Component | Credential | Required? | Purpose |
|---|---|---|---|
| React/Vite + `api/live-data.js` | None | No | Public market/news refresh path |
| Browser Finnhub quotes | `FINNHUB_API_KEY` | Optional | Live quote data; UI falls back to simulated values |
| Python LLM backend | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Only for live LLM mode | Autonomous planning, final synthesis and LLM-backed RAG answers |
| SEC EDGAR | `EDGAR_USER_AGENT` | Required for live EDGAR | SEC requests identify the application/contact; no API key |
| Python live stock MCP | `FINNHUB_API_KEY` | Required for live Stocks MCP | Quotes / earnings data from Finnhub |
| Daily candles | None | No | Stooq daily history |
| GDELT news | None | No | Public news feed |
| Notifications | `NOTIFY_WEBHOOK_URL` | Optional | Slack/Discord webhook delivery |
| Legacy `server.ts` | `GEMINI_API_KEY` | Only when running that legacy Express server | Gemini-powered live synthesis |
| Legacy `server.ts` optional feeds | `ALPHA_VANTAGE_API_KEY`, `MARKETAUX_API_KEY` | Optional | Additional news/sentiment feeds |

The Python backend defaults to `LLM_PROVIDER=stub`, so CI and local hermetic tests do not need an LLM key. For the autonomous agent to use a real model, set `LLM_PROVIDER=openai` or `LLM_PROVIDER=anthropic` and provide the matching key.

See [`API_KEYS.md`](API_KEYS.md) for the exact environment setup.

## Earnings alerting

The dashboard now has a server-side earnings alert route at `/api/earnings-alerts`. It monitors the portfolio + configured stock universe, checks the next 14 days of Finnhub earnings dates, and prepares a T-1 alert with announcement timing, consensus estimates, impact channels, and direct/linked holdings.

For independent delivery when the browser is closed, configure these Vercel environment variables:

```text
FINNHUB_API_KEY=...
NOTIFY_WEBHOOK_URL=...
CRON_SECRET=...
EARNINGS_ALERT_LEAD_DAYS=1
```

GitHub Actions calls `/api/earnings-alerts` daily at 08:30 IST. The workflow is independent of Vercel Cron and only sends due T-1 events. The browser panel also supports optional local browser notifications while the dashboard is open. Store `AIW_CRON_SECRET` in GitHub Actions secrets and the matching `CRON_SECRET` in Vercel.

The Finnhub key saved in the browser Settings page is separate from the Vercel server-side key used by the scheduled alert.
