# AI Infra Watch

AI Infra Watch is a research and monitoring dashboard for AI infrastructure, semiconductors, data-center power, market conditions, and a user-managed portfolio. It combines live-data adapters, source-backed research workflows, watchlists, forecast tracking, and scheduled notifications.

**Live dashboard:** https://ai-infra-watch-theta.vercel.app/

## What it covers

- **Overview and market context:** market breadth, macro and geopolitical risk, and signals requiring attention.
- **AI infrastructure research:** company contracts, capacity/progress tracking, public filings, news, and policy context.
- **Portfolio Intelligence:** holdings, thesis/decision context, exposure, performance comparisons, and forecast tracking.
- **Watchlist and alerts:** earnings monitoring, re-entry rules, scheduled intelligence digests, and delivery-state tracking.
- **Autonomous research and data health:** evidence-gated research, source freshness, missing-data visibility, and research quality checks.

Live data can be delayed, unavailable, stale, or supplied by a fallback. Check each page's source/freshness indicators and linked evidence before acting on it. This application is a research aid, not investment advice or an execution/brokerage system.

## Architecture at a glance

- **Frontend:** React 19, Vite, Tailwind CSS, and Recharts.
- **Serverless API:** Vercel functions under `api/`.
- **Persistence:** Supabase for supported portfolio, decision, forecast, alert, and evidence records.
- **Research backend:** Python services and MCP integrations under `aitracker-upload/`.
- **Automation:** GitHub Actions for CI, scheduled checks, data capture, and notifications.
- **Legacy local runtime:** root `server.ts` is an older Express/Gemini runtime. It is distinct from the deployed Vercel serverless path; see [API_KEYS.md](API_KEYS.md) before using it.

Not every feature uses the same provider or environment configuration. Start with [API_KEYS.md](API_KEYS.md) and use the configuration for the runtime you are actually running.

## Local setup and validation

Prerequisites depend on the path you are testing. Use Node.js 22 for the current CI/Vercel build; install Python 3.12 for Python functions and research tooling.

```bash
npm ci
npm run build
npm run lint
npm run test:unit
npm run security:audit
```

The root `npm run dev` command starts the legacy `server.ts` runtime, not a Vercel production deployment. Its Gemini-backed routes may require `GEMINI_API_KEY`. Review [API_KEYS.md](API_KEYS.md) for the appropriate environment variables and setup notes. Never commit API keys, tokens, service-role credentials, private data archives, or local environment files.

## Research integrity and alert semantics

### Historical JEV research

Historical performance is **not validated merely because the pipeline runs or an archive file exists**. A credible historical result requires price evidence that supports the decision-time cutoff and an independently sourced, effective-dated universe for every decision date. When either is missing, retain an `insufficient`/exploratory status and treat results as paper research—not proof of alpha.

The historical evidence archive is private. Stored bytes, hashes, retrieval timestamps, and schema validation are useful audit artifacts, but are not by themselves proof of original publication time or point-in-time universe membership.

### Telegram and scheduled alerts

Count a Telegram delivery as successful only when Telegram confirms the send (`ok=true` with a valid message ID) and the system records the corresponding delivery/outbox state. An empty scan, a successful workflow, or a log line saying there were no errors is not proof that an alert was delivered. Do not use synthetic production alerts to satisfy delivery validation.

### Production deployment

Production deployment is intentionally opt-in. The Vercel workflow deploys from `main` only when manually dispatched on `main` or when a push commit message includes `[deploy]`. Ordinary CI success or merging a regular PR must not be treated as production deployment approval.

Before a release, verify the current main-branch CI and authenticated read-only smoke test, review the release-gate issue, check Vercel's deployment status, and confirm that any security incidents requiring disposition have been handled through the authorized security dashboard. Do not deploy while a release gate is blocked unless the release scope and risk decision are explicitly approved.

## Useful references

- [API keys and live-data setup](API_KEYS.md)
- [Private historical-evidence archive and gate semantics](scripts/historical_evidence/README.md)
- [GitHub Actions](https://github.com/Blitzer0007/ai-infra-watch/actions)
- [P1 release-gate tracking issue](https://github.com/Blitzer0007/ai-infra-watch/issues/110)

## Security and privacy

Keep secrets in the appropriate GitHub Actions or Vercel environment settings. Do not print credential values, authorization headers, raw private-provider payloads, portfolio information, or private evidence content in CI logs. Use read-only production checks whenever possible and keep evidence archives in private storage.
