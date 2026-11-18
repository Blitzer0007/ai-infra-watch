# Milestone 5 — operational and data integrity

Updated: 18 November 2026 (Asia/Kolkata)

## Source of truth and release state
- Milestone 4 released to production from `main` commit `4449fa2dbbcff5aacb1c328ccd09e4fba8fcc772`, via PR #174 and Vercel deployment `dpl_4YxxXt5CcZ4J5b7L24pTwtr4AgVa`.
- Exact-main Frontend CI, Security audit and UI API DB Validation all passed before deployment. Production domain `ai-infra-watch-theta.vercel.app` and assets verified HTTP 200. Authentication-protected API smoke was not independently verified; do not imply that it was.
- Current Milestone 5 candidate branch: `feature/milestone5-operational-integrity-20261118`. This candidate is NOT deployed.
- Production rollback candidate: Milestone 3 deployment `dpl_EDKqq53hqUutLwvA5kY9CaUUBjgY` (do not replace or invoke without reviewing current deploy state).

## Direction
The original five-release plan characterizes Milestone 5 as broader operational work, not as permission to activate autonomous trading or provider polling. Implement in bounded, auditable increments with exact-head CI and fail-closed behavior:
1. Harden forecast evaluation inputs and denominators against malformed type coercion; keep finite numeric strings and authentic zero outcomes accepted.
2. Make scheduler, outcome, source-lag and quota observations distinguish missing, stale and failed evidence; provide an explicitly manual diagnostic path without unapproved provider refreshes.
3. Strengthen release/rollback documentation and production authenticated read-only smoke process; don't change established access gates.
4. Audit point-in-time market-data and issuer-source provenance, recording unknown independently verified sources and conservative evaluation limitations rather than fabricated historical outcomes.
5. Validate production readiness with fictional/unit/browser/disposable-DB tests; no paid model, Telegram send, trading order or production Supabase mutation as a shortcut.

## First implemented candidate increment
- `src/utils/forecastEvaluationProtocol.js` now accepts only finite JS numbers and nonblank finite numeric strings; arrays, objects, booleans and whitespace no longer coerce to valid zeros or horizon values.
- `src/utils/forecastEvaluationProtocol.test.ts` exercises rejection of malformed horizon/outcome/median/quantiles while preserving valid numeric strings and real zero observations.
- This is an integrity correction on already-read bounded forecast records. It does not query new rows, run jobs, change server contracts, expose private data, or claim trading-grade prediction accuracy.

## Second candidate increment — scheduler fleet triage
- `src/utils/schedulerFleetHealth.js`: deterministic, no-network summary of the existing loaded scheduler array; distinguishes recorded successful jobs from failures/stuck, skipped/disabled, and unknown (including no jobs, absent success time or an unavailable endpoint). This is a summary of observations, not a job-completion attestation.
- `src/components/DataHealth.tsx`: explicit fleet readout with observed success, attention, skipped/disabled and unknown counts. A valid empty response is marked UNKNOWN, not an infinite loading spinner. No new HTTP request, polling, remote call, or job dispatch is introduced.
- `src/utils/schedulerFleetHealth.test.ts`: fictional failure, skips, missing timestamp, valid success, malformed record, and privacy cases.
- `qa/test_milestone5_candidate.py`: real mocked browser checks at 360/768/1440, no passive writes or browser errors, and empty-endpoint UNKNOWN state. Included in `.github/workflows/qa-validation.yml`.
- These are candidate features, not evidence that Telegram messages were sent, source feeds were timely or historical forecasts were accurate. All exact-final-head CI must conclude success before advancing.

## Third candidate increment — bounded market source lag and quota-unknown evidence
- `src/utils/marketObservationReview.js` computes an observation-only summary from the **existing** /api/market?route=market-data-health response; no added provider/API requests or timers.
- Separates unavailable quotes, unknown observation timestamps, quotes older than a diagnostic 15-minute threshold, unavailable/datetime-unknown history, history older than five UTC calendar days, incomplete adjusted-close metadata, fallbacks and provider rate-limited **attempts**. Thresholds are for triage, **not** exchange-session, quota or source-publication certification.
- Explicit `quotaRemaining: null`: HTTP 429 classification is a rate-limit attempt, not proof of a provider's overall quota usage, hard limit, exhaustion or remaining calls. No provider limits or pricing are manufactured.
- `src/components/DataHealth.tsx` surfaces observed/partial/attention/unknown state; a network failure remains UNKNOWN, not zero provider issues. No tokens, raw prices or private response payloads are added to this summary.
- `src/utils/marketObservationReview.test.ts` covers missing, aging, malformed age, actual attempts, fallback and non-leaking output.
- `qa/test_milestone5_candidate.py` includes fictional responsive 360/768/1440 acceptance, no writes and unavailable API behavior.
- Require exact-head full CI on the resulting commit. No release/production change authorized by this increment.

## Fourth candidate increment — private production diagnostic and provenance receipts
- `scripts/private-health-smoke.mjs`: manually invoked, fixed-origin, authenticated GET-only contract diagnostic for `/api/job-health` and `/api/forecast-validation`. Never logs tokens, API response bodies, archive locations, or private rows. Explicit invocation: `AIW_ACCESS_TOKEN=<operator-supplied-secret> node scripts/private-health-smoke.mjs run` in an approved protected CI environment; never paste tokens into shell logs. Existing deployment protection may block this and must not be disabled. **The script has not been run on production**: acceptance currently comes from fictional/mocked CI.
- `server/api/private-health-smoke.test.js`: fake transport tests enforce fixed origin, two GETs, no query parameters, no redirects, denied or malformed response failure, zero data leakage.
- `src/utils/historicalProvenanceReview.js`: bounded metadata-only evidence checklist. Distinguishes indexed metadata count, stored SHA-256 strings, recorded capture time, claimed source as-of date and source dates after their purported retrieval time. No hashes, object paths, financial rows or secret fields are returned.
- Even an archive index labeled `READY` cannot authenticate original publisher timestamp, market price corporate-action adjustment, issuer/universe membership at the forecast decision, or prospective out-of-sample holdout. All four independent gates remain false and historical accuracy/decision eligibility stays blocked.
- `src/components/DataHealth.tsx` shows this provenance state in the existing authenticated Data Health page. Fictional unit and mocked browser tests cover contradictory timestamps and claimed READY metadata; no new remote fetch or database changes.
- Limitations: does not perform independent archive downloads/re-hashing or real issuer-source validation. Manual production access verification must be operator-approved and is not equivalent to an observed success until actually run.

## Working rules
Use connected GitHub/GitHub Actions only (do not run on the user's Windows PC). Read current PR head and all CI runs. Fix genuine failures on a new commit and verify the NEW exact head. Don't merge or deploy Milestone 5 merely because an initial small patch passes. Branch protection remains deferred by the owner's explicit instruction; never silently amend release-gate policy. Retain prior rollback deployment and production protections.
