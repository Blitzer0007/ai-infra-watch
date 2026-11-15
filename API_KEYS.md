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

## 3. Optional X project-update search

The Progress Tracker can query recent public X posts for company and construction updates, including official-account posts such as `@DigipowerX`.

Set this server-side Vercel environment variable to enable direct X API search:

```text
X_BEARER_TOKEN=...
```

Create the bearer token in the X Developer Portal and keep it server-side; do not expose it in Vite/browser variables or commit the token. Without this credential, the tracker still checks the configured web/news discovery providers, but direct X search is unavailable. Recent Search only covers the recent-post window supported by X; it is not a complete historical archive.

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

The React dashboard includes a server-side `/api/agent-ask` proxy. On a hosted Vercel runtime it selects the current deployment's native Python `/api/agent-python` function from platform-supplied `VERCEL_URL` with `VERCEL=1` and `VERCEL_ENV=preview|production`. No separate backend URL is required when this trusted metadata is available. It never derives a destination from incoming Host/Forwarded headers or falls back from a preview to a production alias. Missing/invalid metadata returns an unavailable result without making a request.

Optional configuration:

```text
AI_INFRA_AGENT_TOKEN=...
```

The same token is used by the proxy and Python function when bearer authentication is enabled. To use a separately hosted Python backend instead, set:

```text
AI_INFRA_AGENT_URL=https://your-python-backend.example.com
AI_INFRA_AGENT_TOKEN=...
```

`AI_INFRA_AGENT_URL` must be an HTTPS origin with a DNS hostname and the default HTTPS port. An optional trailing slash is accepted; userinfo, path prefixes, queries, fragments, IP literals and local/internal suffixes are rejected. An invalid explicit setting fails closed instead of falling back to another deployment. Plain HTTP loopback origins are supported only in non-production, non-Vercel development; the existing Source Quality / council roles remain separately development-only.

Both generic GET and POST proxy requests reject redirects, forward only the selected backend token and content type, and return sanitized transport failures with `Cache-Control: no-store`. The Congress aggregate feed similarly uses only the current deployment's trusted URL, with no forwarded caller/backend credentials or request-header origin. Explicit backend ownership/DNS/TLS trust and current-deployment protection/auth behavior need separately authorized hosted verification before release. This documentation does not provision credentials or activate live monitoring. See [proxy hardening review](docs/release/release2-proxy-origin-hardening.md).

## 8. Scheduled earnings alerts

The GitHub Actions workflow `.github/workflows/earnings-alerts.yml` calls `/api/earnings-alerts?days=14&notify=1` daily at 08:30 Asia/Kolkata. The route obtains its calendar from Finnhub and sends only events whose `days_until` matches the configured lead time.

Required server-side Vercel setting:

```text
FINNHUB_API_KEY=...
```

At least one notification channel must be configured for an alert to be delivered:

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

Optional webhook channel:

```text
NOTIFY_WEBHOOK_URL=...
```

`EARNINGS_ALERT_LEAD_DAYS` defaults to `1` and is bounded from 1 to 7 days. The scheduler authenticates with a GitHub Actions OIDC token scoped to this repository and workflow; it does not require a GitHub Actions `AIW_CRON_SECRET` for the normal scheduled path. `CRON_SECRET` remains an optional server-side bearer fallback for controlled direct cron callers. The browser-stored Finnhub token in React Settings is not used by this scheduled job.

A successful scheduler run with zero alerts sent can be expected when no monitored company has an earnings event inside the configured T-1 window. Check the returned `upcoming` list, `notification.attempted`, `notification.sent`, and `notification.error` before interpreting zero sends as a failure.

## 9. Portfolio digest and smart alerts

The portfolio digest primary and fallback GitHub Actions workflows run four daily slots at approximately 06:05, 12:05, 18:05, and 22:05 Asia/Kolkata. Both call `/api/portfolio-digest`; slot-level idempotency prevents the fallback from sending a duplicate for a completed slot. The endpoint uses GitHub Actions OIDC and can fall back to the optional GitHub Actions secret `AIW_CRON_SECRET` if the OIDC request is rejected.

The digest sends to Telegram when both `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured. The delivery record stores the Telegram acceptance state and Bot API `message_id` when Telegram confirms acceptance. This is an API acceptance receipt, not proof that a person read the message.

Server Smart Alerts are evaluated by `.github/workflows/server-smart-alerts.yml` every 10 minutes. This is a separate alert pipeline from the portfolio digest and the earnings calendar.

## 10. Re-entry Telegram alerts — gated

The re-entry workflow is intentionally disabled unless both GitHub repository variables are explicitly set to `true`:

```text
REENTRY_ALERTS_ENABLED=true
REENTRY_ALERTS_RELEASE_APPROVED=true
```

Do not enable these variables until the release review confirms the API version, durable delivery persistence, natural production delivery evidence, and explicit release approval. The workflow also checks the New York regular-session window.

