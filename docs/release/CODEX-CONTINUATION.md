# AI Infra Watch — Codex Cloud continuation (Milestone 2 isolated candidate)

**Current handoff:** 16 November 2026. This is the candidate-specific checkpoint on branch `release/milestone2-integrated-candidate-20261115` / [draft PR #172](https://github.com/Blitzer0007/ai-infra-watch/pull/172). It intentionally differs from the older checkpoint on `feature/release2-opportunity-research` (PR #168), which holds the unshipped multi-milestone stack.

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
