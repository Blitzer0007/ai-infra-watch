# Production evidence validation

## Safety boundary
- This suite is read-only. It must not call the re-entry scan endpoint, write to Supabase, create paper proposals, or send Telegram messages.
- The workflow is manual-dispatch only; no production deployment is performed.
- Never commit credentials, cookies, browser storage state, or screenshots containing private portfolio data.
- JEV remains paper-only with manual approval; this test suite does not execute trades.

## Local interactive production smoke test (recommended)
Use this when you do not have a separate QA account. It opens a fresh local Chromium context so you can sign in manually to the production app. It does not import or save cookies/storage state, and it does not upload browser data.

From the repository root, with the virtual environment active:
```powershell
python -m tests.production_validation.interactive_production_smoke
```

The runner checks the homepage, pauses for you to sign in if needed, then checks the routes listed in `PROD_READ_ONLY_ROUTES` (defaults to `/`). Only add routes you have confirmed exist, for example:
```powershell
$env:PROD_READ_ONLY_ROUTES = "/,/watchlist"
python -m tests.production_validation.interactive_production_smoke
```
The default route list is sourced from `VIEW_PATHS` in `src/App.tsx`: `/overview`, `/contracts`, `/tracker`, `/congress`, `/macro`, `/portfolio`, `/watchlist`, `/research`, `/jev-lab`, `/quality`, `/outlook`, `/health`, `/guide`, and `/settings`. The runner checks that the dashboard navigation shell remains visible and each route renders a non-empty body. It does not click buttons or trigger scans, alerts, proposals, database writes, or trading actions. It validates navigation/rendering only, not data correctness.

## Production Playwright in GitHub Actions
The separate workflow can optionally use repository secrets:
- `PROD_STORAGE_STATE_B64`: base64-encoded Playwright storage-state JSON from an approved session.
- `PROD_AUTHENTICATED_MARKER`: a stable CSS selector visible only after authenticated app load.

Prefer the local interactive runner above when possible. Never paste production credentials, cookies, or session tokens into chat or commit them. The workflow intentionally does not upload browser storage state, screenshots, traces, or cookies as artifacts. If secure session secrets are missing, authenticated tests are reported as skipped/blocked rather than passed.

Optional repository variables:
- `PROD_BASE_URL`: defaults to the production dashboard URL.
- `PROD_SMOKE_PATHS`: comma-separated same-origin routes to check; defaults to `/`. Confirm actual route paths before expanding this list.

## Historical evidence
The pure validators enforce:
- timezone-aware observation, provider-availability, and decision-cutoff timestamps;
- adjusted-price semantics;
- source name and URL provenance;
- point-in-time universe membership with effective dates.

Unit tests use synthetic fixtures only and validate the validator logic. They do **not** prove that a real market-data provider is trustworthy.

### Collect source-attributed price observations
From the repository root, with the virtual environment active:
```powershell
python -m tests.production_validation.collect_historical_evidence --symbols NVDA,MU,MSFT --start 2025-01-01 --end 2026-01-01 --output historical-evidence-report.json
```
This makes read-only requests to the Yahoo Finance chart endpoint, records the exact source URL, retrieval time, adjusted-close observations, and SHA-256 of each raw response, preserves the exact raw response bodies in a sibling `historical-evidence-report_raw/` directory, and writes a JSON report with a release-evidence summary. The report links each response file and its SHA-256 hash. The collector runs structural checks for duplicate symbol/date rows, invalid prices, out-of-range dates, weekend observations, and provider collection failures. A PASS is only a structural result; it does not prove all expected exchange sessions are present, so compare against an explicit exchange calendar before backtesting. Pick symbols and date ranges appropriate to the intended backtest. Do not commit private portfolio exports or tokens.

**The collector intentionally leaves the price gate BLOCKED.** A provider's current retrieval time does not prove when each historical price was first available to a strategy. Do not substitute the download timestamp for `available_at` or a decision cutoff. The universe-membership gate also remains BLOCKED when no independently sourced effective-dated membership file is provided. The report is auditable source evidence, not approval to run a point-in-time backtest.

## Telegram natural-run evidence
This suite deliberately does not trigger the scan. Capture evidence from the naturally scheduled workflow:
- scheduled workflow run ID and timestamp;
- scan classification (fully evaluated/no candidate versus candidate not delivered versus confirmed delivery);
- Telegram API acceptance and returned message ID for an actual candidate;
- whether the corresponding delivery state was persisted;
- any failure/retry or duplicate-risk indicators.

A scan with no qualifying candidate proves a clean evaluation only if all active watchlist rows were evaluated with no errors. It is not proof of Telegram delivery.


### Interpreting the report
- `integrity_checks.status` describes structural checks only.
- `validation.price_evidence.status` remains `BLOCKED` until genuine provider publication/availability evidence and strategy decision cutoffs are supplied.
- `validation.universe_membership.status` remains `BLOCKED` without independently sourced effective-dated membership rows.
- `release_evidence_summary.release_ready` must remain `false` until all release gates are independently satisfied.
- Preserve the report and its sibling raw-response directory together. Do not treat a raw-response hash alone as proof of the provider's historical publication time.
