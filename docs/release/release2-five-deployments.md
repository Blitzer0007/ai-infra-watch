# Release 2 — five milestone production releases

User direction recorded 15 November 2026, Asia/Kolkata: target **five production deployments total, one after each completed milestone**, rather than a single final rollout. Dates below are targets through 7 December, not guarantees or automatic deployment triggers.

Development stays in Codex Cloud. Preserve existing work and draft PRs #167/#168. The current feature head at planning time is `c65e5ea693de8649dc9d8b1ca75ffe2f356a55c4`; its successful CI does not establish that the entire stacked branch is production-ready. Current status: **1/5 releases completed**. [Milestone 1 production evidence](milestone1-production-2026-11-15.md); next is Milestone 2 integration.

## Milestones and release boundaries

| Release | Target | Included scope | Acceptance before production |
| --- | --- | --- | --- |
| 1 — safety and risk foundation | Shipped 15 November | Remaining rule/configuration validation, client/server parity, server alert-admission safeguards, accounting abstention and release-pipeline hardening | Reviewed financial/rule cases, preserved thresholds, no stale/simulated quote admission, no false zero P&L, exact-candidate CI and production compatibility |
| 2 — integrated Portfolio core | 23 November | Portfolio/Opportunities/dossier/calendar/inbox integration, source coverage and conflict explanations, navigation and retained reading/editing context | Integrated user stories, missing/error/loading states, keyboard/mobile acceptance, unchanged write boundaries and backward-compatible data requirements |
| 3 — controlled research | 27 November | Bounded Company/Catalyst Research and Daily Review roles, Source Quality and Bull/Bear/Judge integration, provider budgets and explicit source grounding | Citation/abstention/privacy/budget tests; provider availability and usefulness labelled according to actual evidence; manual controls; no automatic trading, polling or sender activation |
| 4 — evaluation and operational transparency | 1 December | Forecast horizon/version compatibility, evaluation/journal presentation, remaining read-only alert classes and scheduler/job-health explanations | Retained input/outcome and pending-data distinctions, no invented predictive validity, matched comparison semantics and side-effect-free reads |
| 5 — integrated stable release | 7 December | Final cross-feature acceptance, security/accessibility/performance improvements, dependency compatibility, operational documentation and remaining accepted core fixes | Reviewed release candidate, complete acceptance/limitations matrix, passing exact-head checks, verified release target, tested rollback procedure and post-deploy evidence |

Existing implemented features are reused and integrated; the five releases do not require rebuilding them. Each wave must provide a useful, coherent increment. If a milestone is not ready on its target date, move the date or explicitly record a narrower accepted scope; do not deploy merely to meet the count. Optional larger universes, full statement exploration, paid vendors and extended scenario planning remain outside the core commitment unless scope is changed explicitly.

## Candidate and branch handling

1. Define the candidate's exact changes and user-visible behavior before release. Preserve unfinished work in the existing feature branches.
2. Resolve the stacked Release 1/2 dependency and compatibility with current `main`. Do not merge the entire draft stack just to obtain an early deployment. Prepare isolated release candidates/PRs when needed.
3. Record the candidate SHA, source/base SHAs, feature availability, data/schema dependencies and known limitations. A previous-head test result does not certify a later candidate or merge result.
4. Run focused checks during implementation and full acceptance at the milestone boundary. Validate the exact release commit/build, production access gates and compatibility using fixtures/disposable data first.
5. Use the existing manual release mechanism after its reviewed commit/target checks pass. Inspect post-deploy results and retain a known-good rollback target before starting the next wave.

The milestone deployment direction is distinct from activating new data collection, message delivery or database changes. Keep production Supabase modifications, production-secret retrieval/display, live polling, new Telegram policies/messages and schedule changes outside these code releases unless the relevant action is separately authorized. Use configured protected CI authentication without retrieving or exposing secret values.

## Pipeline work required before release 1

The workflow at planning baseline was manually dispatched/main-only but checked out moving `main`, installed `vercel@latest`, immediately assigned production domains and ran live provider-refresh checks. The [risk and release foundation increment](release2-risk-release-foundation.md) now implements exact-commit/CI/target checks, staged promotion, tooling controls and separate live-check opt-in on the feature branch. Hosted protection, reviewed CLI configuration, actual deployment/rollback acceptance and release-candidate integration remain prerequisites. No workflow was dispatched or secret retrieved.

Acceptance to complete before using it for these releases:

- Bind dispatch, checkout and acceptance evidence to the reviewed candidate SHA, and reject a mismatch or changed production-branch head.
- Verify the intended GitHub repository, Vercel team/project and environment immediately before release; preserve manual controls and use reviewed tooling versions.
- Require exact-candidate build/test/security evidence and a known-good rollback target. Where supported by the reviewed pipeline, stage a production build without domain assignment, check that same build, then promote it.
- Separate static/access-gate verification from provider-calling or authenticated live checks. Existing peer-fundamentals and `market-data-health&refresh=true` smoke steps must not silently widen the standing no-live-acquisition restrictions.
- Do not assume a code rollback reverses database mutations or external sends. Keep those operations separate from the five code deployments.

## Required evidence for each deployment

Record the release number, candidate SHA, included/deferred changes, CI links, production compatibility, Vercel project/environment, deployment URL/ID, previous known-good deployment, result, allowed post-deploy checks and rollback outcome if needed. A release counts as completed only after its intended production version is verified; a queued/failed build or a preview URL is not a completed production release.

Track feature implementation, fixture/disposable verification, authentic-source/live verification and production deployment separately. Real issuer/history/accounting evidence, secure development provider access, genuine NVIDIA/JEV effectiveness and matured predictive outcomes cannot be certified by code completion or mock tests. Missing evidence must remain visible and cannot be promoted to a positive financial or forecasting claim.

The next implementation is Milestone 2 Portfolio/Opportunities/dossier/calendar/inbox integration. The first [company research navigation increment](release2-company-research-navigation.md) is implemented on the feature branch. This document updates the rollout plan only; it creates no deploy, merge, schedule, provider call, production database change or Telegram send.

Historical pre-release implementation follow-up: [risk/release foundation](release2-risk-release-foundation.md) and [Decision Center accounting abstention](release2-decision-accounting-review.md) are implemented on the feature branch. Milestone 1 subsequently shipped under the documented owner-approved control exception. Authoritative source/history evidence remains unverified; additional consumers and integrated Portfolio flows remain work for later milestones.
