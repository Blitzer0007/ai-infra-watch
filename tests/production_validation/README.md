# Production evidence validation

## Safety boundary
- This suite is read-only. It must not call the re-entry scan endpoint, write to Supabase, create paper proposals, or send Telegram messages.
- The workflow is manual-dispatch only; no production deployment is performed.
- Never commit credentials, cookies, browser storage state, or screenshots containing private portfolio data.
- JEV remains paper-only with manual approval; this test suite does not execute trades.

## Local interactive production smoke test (recommended)
Use this when you do not have a separate QA account. It opens a fresh local Chromium context so you can sign in manually to production. It does not import or save cookies/storage state, and it does not upload browser data.

From the repository root, with the virtual environment active:
```powershell
python -m tests.production_validation.interactive_production_smoke
```

The runner checks the homepage, pauses for manual sign-in, and then:
- verifies that the dashboard navigation shell is visible;
- sends a **read-only GET** to `/api/portfolio?includeLots=true` from the page using the token already held in browser `sessionStorage`;
- checks only response status, source/persistence flags, non-empty holdings collection, and a basic row-shape predicate; it never prints or exports portfolio rows, symbols, quantities, prices, or thesis data;
- checks all 14 routes listed in `VIEW_PATHS` by default. To run a smaller subset of confirmed routes:
```powershell
$env:PROD_READ_ONLY_ROUTES = "/overview,/watchlist"
python -m tests.production_validation.interactive_production_smoke
```

The routes are sourced from `VIEW_PATHS` in `src/App.tsx`: `/overview`, `/contracts`, `/tracker`, `/congress`, `/macro`, `/portfolio`, `/watchlist`, `/research`, `/jev-lab`, `/quality`, `/outlook`, `/health`, `/guide`, and `/settings`. Only `GET`, `HEAD`, and `OPTIONS` requests are allowed, plus the app's manual login endpoint `POST /api/auth`; other mutating HTTP requests are intercepted and aborted before reaching the server. This blocks startup effects such as alert config sync, scorecard writes, and Telegram notification relays. It never clicks dashboard buttons or submits application forms.

The check proves current protected-read access and response shape, not correctness of every displayed figure, source freshness, or historical point-in-time backtest validity. Do not paste access tokens into PowerShell or chat.

## Production Playwright in GitHub Actions
The manual workflow can run anonymous route/navigation smoke checks. It optionally accepts:
- `PROD_STORAGE_STATE_B64`: base64-encoded Playwright storage-state JSON from an approved session.
- `PROD_AUTHENTICATED_MARKER`: a CSS selector visible after dashboard load.

**Important limitation:** the dashboard's bearer token is stored in `sessionStorage`, which standard Playwright `storage_state` does not restore. The authenticated CI test therefore additionally probes the protected portfolio GET and fails closed when the token is absent. Do not mark the authenticated production gate complete based on mocked CI, a navigation marker alone, or a run where authenticated tests are skipped. Use the local interactive runner above to verify the live protected read unless a separately reviewed, safe QA authentication mechanism is introduced.

Never paste production credentials, cookies, or session tokens into chat or commit them. The workflow does not upload browser storage state, screenshots, traces, or cookies as artifacts. If the relevant secrets are missing, authenticated validation must remain blocked—not passed.

Optional repository variables:
- `PROD_BASE_URL`: defaults to the production dashboard URL.
- `PROD_SMOKE_PATHS`: comma-separated routes to check; defaults to `/`. Confirm actual route paths before expanding this list.

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

**Evidence schema hardening:** the release validator now requires more than a timestamp and a source URL. Each price row must include a vendor/source row identifier, an availability-evidence record ID/type, an HTTPS evidence URL, the evidence's original publication timestamp, and a SHA-256 digest of the exact evidence artifact. The evidence publication timestamp must be no later than both the claimed `available_at` and the strategy decision cutoff. Universe-membership rows similarly require a membership record ID, evidence record/type/URL/publication timestamp, and SHA-256 of the exact evidence artifact; reversed effective intervals and evidence published after the as-of date are rejected. HTTPS links with placeholder hosts or credentials embedded in URL query parameters are rejected.

The validator checks that the submitted artifact references and chronology are structurally plausible; it cannot independently authenticate a vendor's statement. Review the raw artifact, hash, record identifier, licensed source, and timestamp provenance before accepting a real-world PASS.

To verify a supplied evidence package, keep the JSON row files and the referenced raw artifacts together under one evidence directory, with each row's `availability_evidence_artifact_path` or `membership_evidence_artifact_path` relative to that directory. The validator recomputes SHA-256 from the referenced file bytes; a hash-shaped string alone is not enough. Run:

```powershell
python -m tests.production_validation.validate_historical_evidence --price-evidence-json price-evidence.json --membership-json membership-evidence.json --artifact-root .\evidence_bundle --output historical-evidence-validation.json
```

For price rows, include `source_record_id`, `availability_evidence_id`, `availability_evidence_type`, `availability_evidence_url`, `availability_evidence_published_at`, `availability_evidence_artifact_path`, and the SHA-256 of that artifact. For membership rows, include `membership_record_id`, `membership_evidence_id`, `membership_evidence_type`, `membership_evidence_url`, `membership_evidence_published_at`, `membership_evidence_artifact_path`, and its SHA-256. Both validators require time-zone-aware timestamps and reject artifacts that cannot substantiate the date/cutoff chronology. The CLI exits non-zero when structural validation fails. A structural pass is not historical release approval: the report keeps `historical_evidence_gate` as `BLOCKED` and sets `review_required=true` until an independent reviewer verifies vendor/source trust, licensing, record semantics, publication-time provenance, adjustment semantics, and the exact investable-universe definition. The Yahoo collector intentionally emits blank availability-evidence fields because the current chart response is not a versioned publication record; its structural collection result must not be mistaken for point-in-time evidence.

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


### Exchange-session coverage
The collector now compares each ticker's observed dates with the `XNYS` session schedule from the pinned-range `exchange-calendars` dependency. It reports expected/observed sessions, missing dates, unexpected dates, and coverage percentage per symbol. The provider/calendar library identifier and package version are included in the report.

This schedule is an independent software calendar model, **not a first-party exchange attestation**. Review discrepancies before interpreting them. A successful date-coverage check does not prove that a daily bar's values were available at the decision time, that adjusted-close values were knowable then, or that the full investable universe is free of survivorship bias. The price availability and universe membership gates remain separate and blocked.
