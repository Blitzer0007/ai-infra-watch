# Current continuation: evidence health recovery draft — 21 November 2026

**This section supersedes historical instructions below.** The owner accepted the clean light direction and asked to move on. The next increment fixes misleading Data Health classifications and integrates the existing quote diagnostics without production changes.

- Active: `feature/data-health-evidence-states`, Cloud worktree `/workspace/ai-infra-watch-data-health`. Its draft PR is stacked against `feature/light-workspace-redesign` (PR #186, base `fe8bde2916ebb4b746c717516155824a339b6d42`). Active draft: [PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187); its current exact-head checks are authoritative.
- Preserved: PR #186 remains an independent UI draft at `fe8bde2`; PR #185 remains an independent quote-diagnostic draft at `c9db228aa878f14ad9c7f00af0006d838fdb1d3d`. Eight implementation/test/doc files from #185 are ported into this stacked candidate. Neither original branch or worktree is modified. The merged PR #180 branch and its release attestations remain frozen.
- Production: main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`, READY `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v` as last verified after the completed PR #180 release. Previous rollback: `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2` (`347240c7657af8a6f830b254e84bedc10f88d785`). Recheck live identities before any future release. No production action is authorized here.
- Read [evidence health scope and acceptance](EVIDENCE-CHANNEL-HEALTH.md), [quote-diagnostic scope](QUOTE-ADMISSION-DIAGNOSTICS.md) and [the reconciled backlog](PLAN-RECONCILIATION-2026-11-21.md).
- Changes: deterministic `evidenceChannelHealth.ts` and unit tests, DataHealth compact summary/recovery disclosure, quote admission projection and sample display from #185, fictional browser/quote fixtures and offline UI CI inclusion. Collection states never grant financial eligibility. No new API read, timer, vendor acquisition, schema or sender path.
- Local verification: 1,096 Node tests; 36 focused browser checks, plus 14 final focus/refresh checks; 32 CI safety tests; TypeScript and QA build. Production build and staged security scan passed. Exact-head CI results belong in the draft PR. Do not treat earlier commits' checks as current-head proof.
- Limitations: fixtures do not establish authentic source availability or complete accounting. The bounded quote sample remains SPY plus up to three holdings. Healthy means declared collection freshness, not correctness or complete financial history.

## Next steps

1. Verify this draft's exact head, diff and all three applicable CI families. Repair regressions without weakening the financial, quote-privacy, history/focus, source or no-write assertions.
2. Review the rendered Data Health summary/recovery previews and the dependency on #186. Keep both drafts and production unchanged unless the owner explicitly requests a release. Do not reuse #180's one-release exception.
3. The next data-recovery prerequisite is authenticated, read-only provider diagnostics by symbol, then a bounded fix supported by the provider's actual contract. Missing currency/security/session/time metadata cannot be invented. Authoritative returns still require complete broker/corporate-action/currency records.

Resume prompt:

> Continue AI Infra Watch on `feature/data-health-evidence-states`. Read the current top of `docs/release/CODEX-CONTINUATION.md` and `docs/release/EVIDENCE-CHANNEL-HEALTH.md`. Find its stacked draft PR and verify exact-head CI. Preserve PRs #185/#186 and every worktree. Use offline fictional fixtures. No merge, deployment, production Supabase changes, new live polling, secrets retrieval or Telegram send without separate authorization.

---

**Historical UI and release checkpoints follow; they are not current operating instructions.**

# Current continuation: clean light workspace draft — 21 November 2026

**This section supersedes all historical instructions below.** The owner disliked the dark app and selected **clean light workspace with fewer cards and clearer navigation**.

- Active branch: `feature/light-workspace-redesign`, isolated Cloud worktree `/workspace/ai-infra-watch-light-ui`, based on main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. Active draft: [PR #186](https://github.com/Blitzer0007/ai-infra-watch/pull/186). Its checks are the authoritative exact-head CI evidence.
- Production: PR #180 has already merged and deployed successfully. Public `https://ai-infra-watch-theta.vercel.app` was verified at READY `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`, main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. Prior rollback is `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2` (`347240c7657af8a6f830b254e84bedc10f88d785`). Recheck identities before any future release; do not execute historical PR #180 handoff instructions again.
- Preserved draft PR #185: `feature/quote-admission-diagnostics`, head `c9db228aa878f14ad9c7f00af0006d838fdb1d3d`, separate quote-health worktree. It is excluded from this UI draft. PR #180's head is frozen for release attestations. All other worktrees and pending changes remain preserved.
- UI changes: shared light CSS; shell/navigation/feed/search; Overview educational and readiness disclosures; flatter Portfolio navigation/summary, expandable indicators and directly available density controls; light auth/holding-dialog/PWA chrome. Financial/API/shared calculation files and release guards are unchanged. UI CI adds the previously omitted application-workspace test file.
- Read [design scope, rendered fictional previews and acceptance](../design/LIGHT-WORKSPACE-REDESIGN.md).
- Local verification: 1,085 Node tests, TypeScript, 57 focused mocked browser checks, 32 offline CI safety checks; the final mobile refinement reran and passed all 57 focused browser checks, including the all-workspace tests. Security audit and production build passed. CI evidence must match the latest exact branch head; inspect Frontend CI, Security audit and UI API DB Validation rather than assuming an earlier commit applies.
- Full CI on the initial draft caught two legacy smoke assertions affected by sentence case and collapsed readiness details. The repair uses the visible Quality Lab heading and explicitly opens readiness before checking the same forecast /50 evidence, while adding an assertion that the incomplete-review warning stays visible. Financial assertions remain. Require fresh CI on this repair head; the earlier failed UI run is not validation.
- No production integration or live portfolio correctness is claimed by fixture tests. Specialized research workflows retain existing behavior; this is an app-wide visual foundation with focused Overview/Portfolio simplification.

## Next steps

1. Verify PR #186's branch head, diff and all three applicable exact-head CI families. Repair any genuine regression without weakening financial, modal, history, source or no-write assertions.
2. Review the desktop/mobile previews with the owner. Keep this branch draft and production unchanged until this new design has explicit release approval.
3. If approved later, reconcile the independent PR #185 separately and use the current guarded release process. The completed one-release exception for PR #180 does not apply here. Do not change production Supabase, enable new live polling, retrieve secrets or send Telegram under this UI task.

Pasteable resume prompt:

> Continue AI Infra Watch on `feature/light-workspace-redesign`. Read the current top section of `docs/release/CODEX-CONTINUATION.md` and `docs/design/LIGHT-WORKSPACE-REDESIGN.md`. Inspect the branch's draft PR and exact-head CI. Preserve PR #185 and all worktrees. Continue the chosen clean light app-wide UI, using offline fictional fixtures; no merge, deployment, production database changes, new polling or Telegram send without separate approval.

---

**Historical checkpoints below are retained for provenance, not current operating instructions.**

# Approved PR 180 release in progress · 21 November 2026

The owner explicitly approved merging and deploying PR #180 using an exception limited to this release. The exception pins its branch and first parent `347240c7657af8a6f830b254e84bedc10f88d785`. The existing handoff will dispatch the guarded production workflow only after all required CI pass on its exact regular two-parent main merge. It retains staging, access gates, repeated commit checks and idempotent dispatch. Rollback is the currently live UI deployment `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2`. Live checks remain false.

Continue autonomously through final PR CI, mark ready, regular merge with expected head, exact-main CI, one-time handoff and production workflow. Inspect failures and repair them without weakening tests. Verify the public alias and served static bytes on the resulting deployment. Do not claim success until promotion and verification complete.

# Product plan and production data review · 21 November 2026

Read [the reconciled product backlog](PLAN-RECONCILIATION-2026-11-21.md) before continuing. The current increment isolates transaction-service outages in Decision Center and the digest. Preserve usable marks with explicit unavailable transaction evidence, and keep financial returns withheld. Run current-commit CI after pushing.

Current UI continuation corrects false reassuring Overview states. Missing/incomplete rule evaluation or quote coverage shows Unknown for an empty urgent count, failed earnings shows Unknown instead of zero, absent independent forecast counts stay unknown, and malformed successful responses produce a recoverable error. Check data sources opens the existing Data Health workspace. The patch uses existing response data without new API paths or timer activation. Verification adds malformed-packet and missing-coverage Chromium regressions. The current service candidate remains unreleased. CI on dca33e2 found two older rule-count assertions expecting zero for missing/inconsistent counts. Updated those cases to expect Unknown while retaining the explicit-zero case, incomplete gate and zero-write assertions. Added checks that these cases also show Unknown urgent count and the incomplete-coverage heading. Require fresh full CI on the corrective commit.

Current continuation adds bounded provider failure reasons to the existing QUOTE_WITHHELD issues in Decision Center and the digest. It identifies rate limiting, timeout, missing configuration, no price, request rejection and service errors with fixed provider labels. Raw error bodies/messages are discarded. The brief includes these reasons even when its independent Decision Center read fails. Shared quote admission and valuation rules remain authoritative. Local verification includes all Node tests and 11 focused Chromium accounting/outage cases. Check the resulting GitHub head and its fresh workflow conclusions before release.

The user approved a UI-first production release on November 21. The public hostname now resolves to READY deployment `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2`, commit `347240c7657af8a6f830b254e84bedc10f88d785`. The same tested production build was promoted through Vercel MCP. Homepage and JavaScript returned HTTP 200, and public JavaScript matched the staged response exactly. All relevant commit checks had passed. The 30-minute error/fatal runtime-log count was empty. Private portfolio API verification was not completed in this release inspection.

Rollback remains the READY prior Milestone 5 deployment `dpl_4Y7ZmLQaiKQXdH3sMi9VB7CtsWKU` at `6827cce`. The reason the alias had previously returned to it is unverified.

The restored UI includes grouped navigation for 17 workspaces, consistent workspace headings and next actions, responsive mobile navigation, the Portfolio Command Center, improved search, and explicit market-source status. The remaining service/data repairs on #180 are still outside this live commit. Resume their review and release preparation after verifying current GitHub checks.

Continue on [PR #180](https://github.com/Blitzer0007/ai-infra-watch/pull/180). This branch includes current main and the Decision Center snapshot correction from [PR #184](https://github.com/Blitzer0007/ai-infra-watch/pull/184). Review one combined diff. The older Milestone 2 worktree has separate uncommitted work and has been preserved.

[Brief diagnosis and acceptance](TELEGRAM-DAILY-BRIEF-QUALITY.md). Check the PR's current commit and GitHub workflow conclusions. Use mocked digest GET for preview. No live send or database operation is necessary for verification.

---

# CURRENT AI Infra Watch continuation — Milestone 7 app-wide UI release repair

Updated: 19 November 2026

- **Owner request:** Entire application UI/UX revamp, extending the deployed Portfolio experience, with clean CI and guarded release. Do not change financial logic, production Supabase, providers, Telegram, private data or trades.
- **Production still live:** Milestone 6 UI at main `3bae7b12b567f669c93c859f68fae5d5a5c84cca`, Vercel READY deployment `dpl_J45FmeRcw2oHAUCNwzRt4U9ew6nV` aliased to `ai-infra-watch-theta.vercel.app`.
- **Merged app-wide code:** [PR #182](https://github.com/Blitzer0007/ai-infra-watch/pull/182) regular-merged at `69921f7a9022af5187ac2206aa5b688b11c855a1` from reviewed `a5dc7a7`. All three PR-head CI passed. New 17-route shell, grouped Today/Portfolio/Research/Operations nav, context/next actions, truthful feed status, search on all routes, stationary quote strip, skip link, mobile menu, responsive/focus styles and mocked UI tests. The exact-main Frontend/Security CI passed; **UI API DB Validation failed** only the existing strict 360px Holding Details → Evidence → Back → Escape scroll assertion (`1779` actual vs `1742` opening, 37px delta). Production handoff correctly skipped release.
- **Active draft fix PR #183:** `fix/milestone7-mobile-holding-scroll-20261119`, direct child of failed main `69921f7`. `src/components/PortfolioIntelligence.tsx` temporarily protects the **captured event-time scroll** during five post-close paints and native browser history handoff, removing the listener automatically or on route change. `src/index.css` reserves narrow feed metadata height while background quote counts arrive. Original scroll tolerance, focus, browser Back, and no-implicit-write tests are unchanged. No new API activity.
- **One-time release:** Existing GitHub `workflow_run` handoff and `scripts/dispatch-milestone5-release.mjs` now authorize **only** PR #183's regular two-parent merge, with pinned first parent `69921f7` and exact second parent from GitHub PR metadata, after all required exact-main CI pass. Rollback remains the existing Milestone 6 READY `dpl_J45FmeRcw2oHAUCNwzRt4U9ew6nV`. `scripts/release-candidate.mjs` retains every prior gate and adds only this PR-specific, owner-authorized branch-protection exception. Historical PR #182 attestations use the actual `69921f7` merge SHA, not an unconstrained fictional SHA.
- **Next:** Wait for all three PR #183 exact-head workflows; if failing fix and reverify; merge **regular two-parent only**, verify exact-main Frontend/Security/UI API DB+Playwright all passed. Confirm one-time handoff dispatches exactly one protected Vercel production release. Verify staging 200/401/exact bytes, promotion, prod alias SHA, 1h runtime errors and READY rollback. If blocked, leave Milestone 6 live; never bypass guards or claim deployment prematurely.
- **Reference:** [docs/design/MILESTONE7-APPLICATION-WIDE-UI.md](../design/MILESTONE7-APPLICATION-WIDE-UI.md). REA was used as an analysis reference; no REA CLI/MCP was executed. Individual bespoke chart/research interactions remain separate; this is an app-wide UI shell refresh.

**The text below this divider is historical and does not describe the current deployed or active milestone.**

---


# AI Infra Watch — Codex Cloud continuation (Milestone 2 isolated candidate)

**Current handoff:** 16 November 2026. This is the candidate-specific checkpoint on branch `release/milestone2-integrated-candidate-20261115` / [draft PR #172](https://github.com/Blitzer0007/ai-infra-watch/pull/172). It intentionally differs from the older checkpoint on `feature/release2-opportunity-research` (PR #168), which holds the unshipped multi-milestone stack.

## Milestone 2 integrated journey closure — review and release prerequisites
- The candidate now covers explicit-detail resource gating, correct loading/missing history/analyst boundaries, selected-detail modal, controller focus, URL Back/Forward and source-record isolation. Additional browser acceptance exercises detail → Evidence → Back → detail → Escape/close with scroll/focus at 360, 768 and 1440px and ensures no implicit writes.
- Production milestone acceptance is separate from authentic issuer facts or predictive forecasting. Repository's release script still mandates protected `main`, exact-main CI, known-good Vercel rollback and staged acceptance; **`main.protected=false` is a genuine blocker**, not a waiver. User authorizes Milestone 2 production deployment, but GitHub protection configuration must be enabled without weakening the script first.
- Do not merge until the branch-protection/release path is usable and a complete exact-head verification has passed. Source PRs #167/#168 stay draft and excluded.

## Milestone 2 completion hardening — explicit detail fetch gates
- Source comparison surfaced inherited history/analyst/peer/FX requests running while the Portfolio overview or collapsed My Holdings list was visible. These were not part of the source PR #168 safe detail contract.
- Detail request gates now require a matching loaded holding and explicitly open detail; Evidence and opted-in Detailed Overview or Performance retain their separate research needs. The default overview/list no longer starts optional provider history/analyst calls.
- Clear in-flight old-symbol chart, analyst and peer state before showing newly selected detail. Native detail shows quote freshness instead of implying a sourced verified live price. Fictional browser tests assert no passive detail reads, intentional fetch on explicit open, no cross-symbol fetch on missing deep links and no portfolio/scorecard writes.
- New exact-head CI must pass before any release or success claim. Explicit production authorization is now recorded in the chat, but release script branch-protection and exact-main CI requirements remain unchanged.

## Exact-head QA regression repair after 0e8fc3b (16 November 2026)
- Frontend CI and Security audit passed on `0e8fc3b`, but UI/API/DB validation **failed** in six legacy Playwright journeys. Authentic job logs showed selectors trying to reach management controls that are now progressively collapsed, and analyst/scenario tables moved into the explicit read-only detail dialog.
- Updated those six journeys to navigate and open the same controls without removing their accounting, sanity, sorting, accessibility, source or write assertions. No application/production code was changed in this repair.
- This repair **must be verified on its new exact head**. Do not claim the failed earlier run or the older pre-dialog checkpoint proves this increment.

## Holding detail / progressive management follow-on (16 November 2026)
- New candidate-only read-only native `HoldingDetailDialog` ported from PR #168 with modal keyboard trap, Escape, explicit close, scroll/focus restoration, URL-only detail identity and browser Back/Forward handling; it never serializes notes, quantity or draft values.
- Existing PortfolioManager stays mounted but is now discoverable inside a collapsed `Manage positions and purchases` section in My Holdings, preserving unsaved form state across sections. The intentional navigation change updates the existing save-contract and candidate browser assertions rather than deleting them.
- New fictional browser coverage for explicit open, modal keyboard/mobile, Back/Forward, missing symbols and no passive portfolio/signal-scorecard writes. Inherited chart/history fetch timing is not yet optimized, and no live source authenticity is certified.
- **Exact-new-head CI required before calling this follow-on verified.** The earlier green `3dc1254` is the pre-change baseline, not proof for this work. Keep PR #172 draft and production unchanged.

## Resumed Portfolio UX increment — 16 November 2026

**Verified source commit:** `e5a104cd1326e73d2ea344d5378ed5bbbafb2190`. All **3/3 applicable path-triggered GitHub workflow families** succeeded on that *source* commit: [Frontend CI](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320253) (908/908 Node tests, lint, production build), [Security audit](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320265), [UI/API/disposable-DB validation](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320237) (full mocked Playwright plus offline DB/CI-safety tests). A later documentation commit changes the branch SHA; confirm the **new exact-head** checks before claiming it is verified.

- **Now integrated from the PR #168 source design:** `PortfolioCommandCenter`, `PortfolioReviewQueue`, `PositionDecisionCard`, `DecisionEvidencePanel` and responsive `PortfolioNavigation`. The source-driven decision adapter and quality gates remain tied to shipped-main interfaces; unavailable ledger/quote/market corroboration stays **INSUFFICIENT DATA**, never an invented trade.
- The new Portfolio review queue appears in Daily Review; selectable decisions open Holdings or Evidence. Section navigation uses a keyboard-accessible select, desktop buttons, and `pushState` / `popstate` to preserve the browser Back/Forward trail without serializing unsaved form contents.
- New `qa/test_milestone2_candidate.py` coverage asserts quality abstentions, queued-card navigation, restored sections, preserved local editor draft, mobile view selection and no unintended write requests.
- **Actual regressions fixed:** Imported card passed props incompatible with main `FreshnessBadge`; desktop navigation used ambiguous button/option text and a test-id root excluding its buttons. The source commit was retested without disabling assertions.
- **Still missing from PR #172:** the `HoldingDetailDialog` and advanced detail/back-stack/scroll/focus experience; progressive editing/management placement and source-context UX parity with the larger stacked PR #168. Existing production accounting/security logic is deliberately unchanged.
- **Next Codex Cloud task:** Read this checkpoint and [candidate acceptance matrix](milestone2-main-candidate.md), verify latest source and exact-head CI, then port the smallest coherent `HoldingDetailDialog` / progressive holdings-navigation increment with no private data or new backend writes. Add fictional keyboard/mobile/Back/Forward tests, require all exact-new-head CI to pass, leave PR #172 draft, do not merge/deploy.

## Repository pins and current scope

- Repository: `Blitzer0007/ai-infra-watch`.
- Production `main` base pinned at `d678cbe0ada0a329f541273181fb0b7f52ad0f90`, shipped Milestone 1.
- Source development reference: PR #168 `d14f5fe57028d3277cc229b704bc126192f42815`. Draft PRs #167/#168 are unchanged and have **not** been merged or deployed.
- Verified implementation checkpoint before this documentation update: `62d3884591af5de3dbca2656e21b7270628517aa`. On that exact commit: [Frontend CI](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43742691855), [Security audit](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43742691902), [full mocked UI/API/disposable DB](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43742691812) all concluded success. Frontend 908/908 Node tests passed.
- Any later documentation or implementation commit must be verified on **its own exact SHA**. Always query the live head and wait for all relevant workflows to finish; do not rely on the pinned source proof alone.

## Work completed on PR #172

A fresh branch from shipped main ports a bounded Milestone 2 UI integration: read-only Opportunities scan, manually supplied Catalyst Calendar, protected/read-only Alert Inbox, Company Research and disconnected financial dossier, redacted original clicked-source context and safer Portfolio section behavior. Main financial/accounting/security/release safeguards remain authoritative. The passive browser-side signal-scorecard POSTs were removed. Development/QA Watchlist config sync was suppressed, while existing production controls remain. Research pauses inherited Portfolio history/analyst/FX/quote fetches. The pre-existing nullable weekly Decision Journal crash was fixed. Browser tests cover error states, exact event/receipt context, unsubmitted editor values and zero unexpected writes.

Read the [exact Milestone 2 main candidate review](milestone2-main-candidate.md) for inclusion/exclusion, proof, known gaps and release gates. PR #172 remains a **narrower tested increment**. Its Command Center and Portfolio Navigation are now integrated; the PR #168 Holding Detail Dialog, progressive editor and full focus/scroll/context parity still require careful main-first integration.

## Codex Cloud operating instructions

1. Fetch the current `main` and draft PR #172 head, diff, GitHub Actions runs/jobs, and `docs/release/milestone2-main-candidate.md`. If someone has modified a branch since this checkpoint, inspect the new head and reconcile; never force-push or reset existing work.
2. If **any exact-head CI fails**, inspect authentic job logs, repair the root code/fixture regression, add or preserve the strongest guard, and rerun all required CI on the new SHA until successful. Never disable safety tests, bypass browser assertions, or claim older SHA success applies to newer source.
3. Before considering Milestone 2 release, decide explicitly whether the narrower PR #172 UX is acceptable; the `PortfolioCommandCenter` and `PortfolioNavigation` are now integrated; the `HoldingDetailDialog`, progressive editor placement and complete detail Back/Forward/scroll/focus parity with PR #168 remain separate. Do not overwrite Milestone 1 auth, accounting, quote admission, risk-rule or production release scripts to add them.
4. Keep fictional fixture / disposable Postgres tests. No Windows PC execution; all code and tests operate through Codex Cloud, GitHub and offline GitHub Actions.
5. Respect the owner’s scope: **NO merge, deploy, protected-secret or private financial-row retrieval, production Supabase changes, auto/polling/provider live calls, cron enablement, Telegram sends, autonomous Bull/Bear/Judge calls or trading actions**.
6. GitHub currently reports `main.protected=false`, while release-candidate tooling requires protection. Do not change protection or bypass the gate under this task; this needs separate owner review.
7. Record a candidate-only acceptance matrix and honest limitations, including the 3 PR-path-triggered CI families. Additional agent/backend/quality CI families on PR #168 are **not** presumed passed on PR #172. Keep the PR draft for explicit owner review.

## Stopping condition

Stop at an audited draft PR with exact-current-SHA green GitHub checks and a current Markdown checkpoint. Production release still requires reviewed full milestone scope, main protection/release-gate readiness and explicit owner approval. The production release count remains **1/5**. No successful fictional-source test establishes real issuer authenticity, complete accounting, Telegram read receipts or investment predictive validity.
