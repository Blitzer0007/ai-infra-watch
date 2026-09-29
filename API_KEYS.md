# AI Infra Watch — API keys and live-data setup

This repository contains more than one runtime path. The required credentials depend on which path you run.

## 1. Current Vite/Vercel live-data path

`api/live-data.js` is the lightweight Vercel endpoint used by the main React dashboard.

It does not require an LLM API key. It reads the shared stock universe, pulls quotes from Yahoo Finance's chart endpoint, and pulls recent headlines from GDELT.

The browser can optionally use a Finnhub key for direct quote polling:

`FINNHUB_API_KEY`

The React Settings page stores that Finnhub token in browser `localStorage`. The UI falls back to simulated values when the token is empty or the request fails.

## 2. Python research / autonomous backend

The mature backend under `aitracker-upload/` has a provider-agnostic LLM client.

Default:

`LLM_PROVIDER=stub`

This requires no LLM API key and is what the CI suite uses.

For a real LLM:

### OpenAI

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=...
LLM_MODEL=...
```

### Anthropic

```text
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
LLM_MODEL=...
```

The autonomous agent uses the selected LLM to choose MCP tools and synthesize retrieved evidence.

## 3. SEC EDGAR

Live EDGAR access requires:

`EDGAR_USER_AGENT`

This is not an API key. It should identify the application and provide a contact address.

Example:

```text
EDGAR_USER_AGENT=ai-infra-watch/1.0 (research; contact: your-email@example.com)
```

The scheduled SEC workflow uses this GitHub secret.

## 4. Live Stocks MCP

Set:

```text
STOCKS_MODE=live
FINNHUB_API_KEY=...
```

The Stocks MCP uses Finnhub for live quotes and earnings data.

## 5. Daily price history

The live candle service uses Stooq and does not require an API key.

## 6. Notifications

For live webhook delivery:

```text
NOTIFY_MODE=live
NOTIFY_WEBHOOK_URL=...
```

Without a webhook, the notification service degrades to the in-memory sink.

## 7. Legacy Express/Gemini server

The root `server.ts` is an older Express + Gemini runtime. It uses:

```text
GEMINI_API_KEY=...
```

It can also use optional news credentials:

```text
ALPHA_VANTAGE_API_KEY=...
MARKETAUX_API_KEY=...
```

That path is separate from the lightweight Vercel `api/live-data.js` endpoint and from the Python autonomous backend.

## Recommended minimum setup for full live research

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=...

STOCKS_MODE=live
FINNHUB_API_KEY=...

FILINGS_MODE=live
EDGAR_USER_AGENT=ai-infra-watch/1.0 (research; contact: you@example.com)

AUTONOMOUS_MODE=llm
AUTONOMOUS_MAX_STEPS=6
```

No Gemini key is required for the Python autonomous path.

## 3. Vercel autonomous-agent proxy

The React dashboard includes a server-side `/api/agent-ask` proxy. In the current production architecture it calls the same deployment's native Python `/api/agent-python` function, so no separate backend URL is required.

Optional configuration:

```text
AI_INFRA_AGENT_TOKEN=...
```

The same token is used by the proxy and Python function when bearer authentication is enabled. To use a separately hosted Python backend instead, set:

```text
AI_INFRA_AGENT_URL=https://your-python-backend.example.com
AI_INFRA_AGENT_TOKEN=...
```

## 8. Scheduled earnings alerts

The Vercel cron route `/api/earnings-alerts` needs the server-side Finnhub key and a delivery webhook:

```text
FINNHUB_API_KEY=...
NOTIFY_WEBHOOK_URL=...
CRON_SECRET=...
EARNINGS_ALERT_LEAD_DAYS=1
```

`EARNINGS_ALERT_LEAD_DAYS=1` sends the alert one day before the scheduled report. Increase it up to 7 for an earlier warning. The browser-stored Finnhub token in React Settings is not used by the server cron.

