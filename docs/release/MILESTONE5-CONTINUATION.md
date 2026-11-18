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

## Working rules
Use connected GitHub/GitHub Actions only (do not run on the user's Windows PC). Read current PR head and all CI runs. Fix genuine failures on a new commit and verify the NEW exact head. Don't merge or deploy Milestone 5 merely because an initial small patch passes. Branch protection remains deferred by the owner's explicit instruction; never silently amend release-gate policy. Retain prior rollback deployment and production protections.
