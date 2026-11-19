# CURRENT AI Infra Watch continuation — Milestone 6 UI/UX redesign

Updated: 19 November 2026

- **Live production:** Milestone 5 released successfully on Vercel at `ai-infra-watch-theta.vercel.app`, from main commit `6827cce1a323949e1b36c06a0a1dca030e63c127`, deployment `dpl_4Y7ZmLQaiKQXdH3sMi9VB7CtsWKU`. [GitHub production workflow #706](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/44459518991) completed successfully with 200 homepage, 401 anonymous API and exact staged/post-promotion asset verification. Real authenticated private-health endpoints, historical provenance and forecast accuracy were **not** attested. A Vercel 24-hour runtime error query also returned an older `/api/market` fetch/socket failure from the **previous Milestone 4 deployment**; do not misattribute this to the new deployment.
- **Current owner request:** Revamp AI Infra Watch UI/UX and use [morluto/rea](https://github.com/morluto/rea) (Reverse Engineer Anything) as a methodology to study/mirror useful interaction patterns. REA is an inspection toolkit, **not an existing dashboard UI**. Its CLI was not run in this environment; do not claim actual REA captures or cloned source.
- **Active candidate:** `feature/milestone6-rea-informed-ui-20261119` (PR #179). Initial slice reworks `PortfolioCommandCenter`, `PortfolioNavigation`, scoped CSS, and 360/768/1440 browser contracts. Preserve source labels, evidence/eligibility gates, deep-link navigation, full original QA tests and values; do not add hidden API calls or alter stored portfolio data.
- **Design spec:** [docs/design/MILESTONE6-REA-UI-REVAMP.md](../design/MILESTONE6-REA-UI-REVAMP.md) documents observed source behavior, a no-copy reference workflow, and three follow-on phases (app shell/navigation, source freshness/unknown states, detail experiences).
- **Next:** inspect exact new PR head; require Frontend CI, Security audit and UI/API/DB/Playwright all passing on the same current SHA. Fix any regressions and recheck. Review the visual candidate before a separate merge/release decision; **do not deploy or merge this UI draft automatically**. No Windows PC execution, production Supabase modifications, unauthorized provider refreshes, Telegram sends, or trades.

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
