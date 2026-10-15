# Production evidence validation

## Safety boundary
- This suite is read-only. It must not call the re-entry scan endpoint, write to Supabase, create paper proposals, or send Telegram messages.
- The workflow is manual-dispatch only; no production deployment is performed.
- Never commit credentials, cookies, browser storage state, or screenshots containing private portfolio data.
- JEV remains paper-only with manual approval; this test suite does not execute trades.

## Production Playwright
Configure GitHub Actions repository secrets:
- `PROD_STORAGE_STATE_B64`: base64-encoded Playwright storage-state JSON from an approved QA session. Use a dedicated least-privilege test account and short-lived session.
- `PROD_AUTHENTICATED_MARKER`: a stable CSS selector visible only after authenticated app load (for example, a dedicated test-id on the signed-in shell). Do not use private account data as the marker.

Optional repository variables:
- `PROD_BASE_URL`: defaults to the production dashboard URL.
- `PROD_SMOKE_PATHS`: comma-separated same-origin routes to check; defaults to `/`. Confirm actual route paths before expanding this list.

The workflow intentionally does not upload browser storage state, screenshots, traces, or cookies as artifacts. If the secure session secrets are missing, authenticated tests are reported as skipped/blocked rather than passed.

## Historical evidence
The pure validators enforce:
- timezone-aware observation, provider-availability, and decision-cutoff timestamps;
- adjusted-price semantics;
- source name and URL provenance;
- point-in-time universe membership with effective dates.

Unit tests use synthetic fixtures only and validate the validator logic. They do **not** prove that a real market-data provider is trustworthy. Before any backtest can be labeled evidence-ready, ingest actual vendor records, record retrieval time and licensing/source metadata, and independently substantiate the historical membership dataset. Unknown or assumed membership must remain insufficient.

## Telegram natural-run evidence
This suite deliberately does not trigger the scan. Capture evidence from the naturally scheduled workflow:
- scheduled workflow run ID and timestamp;
- scan classification (fully evaluated/no candidate versus candidate not delivered versus confirmed delivery);
- Telegram API acceptance and returned message ID for an actual candidate;
- whether the corresponding delivery state was persisted;
- any failure/retry or duplicate-risk indicators.

A scan with no qualifying candidate proves a clean evaluation only if all active watchlist rows were evaluated with no errors. It is not proof of Telegram delivery.
