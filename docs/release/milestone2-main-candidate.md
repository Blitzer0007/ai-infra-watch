# Milestone 2 — main-based review candidate

**Status: source candidate being assembled; no successful exact-candidate CI evidence until GitHub has finished the new PR checks. Not merged or deployed.**

## Source pins
- Base: production \`main\` at \`d678cbe0ada0a329f541273181fb0b7f52ad0f90\`.
- Development reference: draft PR #168 at \`d14f5fe57028d3277cc229b704bc126192f42815\`, itself stacked on unresolved draft PR #167. Both original PRs remain unchanged.
- New candidate branch: \`release/milestone2-integrated-candidate-20261115\` created directly from main. New commit SHA must be taken from the PR head.
- Exact change set is a **main-first port**, not a merge or a copy of all 433 branch files.

## Candidate scope actually intended
- Integrates read-only **Opportunities**, **Catalyst Calendar**, **Alert Inbox** routes into existing main App, preserving its existing auth, accounting, financial admission and release safeguards.
- Preserves explicit manual **Scan loaded snapshot** (no automatic research calls) and relevant opportunity/issuer coverage distinctions. Future agent/model and source-quality execution panels have been deliberately excluded from the new scanner.
- Calendar reuses the **existing Watchlist earnings feed** snapshot. Opening Calendar makes no fetch or notification. Date-only, revisions, source status and missing coverage stay explicit.
- Alert Inbox distinguishes browser detection from protected delivery ledger status; protected server route is GET-only, using existing authorization and no new schema or notifications. Loading server history remains a user action.
- Integrates **Company Research** inside the pre-existing main Portfolio Research tab without overwriting main portfolio calculations or Main Milestone 1 data-quality rules. Exact clicked Calendar/Inbox records are bounded in App memory and never inserted in URLs, persisted storage or delivery correlation.
- Renders a source-boundary disclaimer: opened event/alert evidence is separate from unconnected company financial dossier. Missing evidence cannot become a verified issuer/price/trading signal.
- Removes two passive browser-side \`POST /api/signal-scorecard\` paths from Portfolio and Signal Fusion while preserving read-only GET history and existing production API authorization. Adds an unsaved-edit disclaimer; does not change Save/Cancel action semantics.
- Uses portable source/dossier admission modules only for declarative UI explanation. No new autonomous Council/REA model execution, forecaster, event radar, scheduled jobs, provider polling, Telegram sender, schema migration or external secret access is included.
- Adds offline UI tests for routes, direct-event context loss, responsive layouts and zero passive signal-store writes. Adds deterministic pure unit tests. Existing main CI jobs are retained and must pass.

## Safety and compatibility checks
1. Compare candidate feature code with main; **main financial/accounting/auth/release source stays authoritative**, including \`api/auth.js\`, \`api/portfolio.js\`, \`shared/portfolioAccounting.js\`, \`shared/quoteAdmission.js\`, \`server/api/decision-center.js\`, \`scripts/release-candidate.mjs\`, and production deploy workflow.
2. The sole server API addition is read-only \`GET /api/alert-inbox\` routed through the existing protected market router. The GET implementation requires authorization; it may read permitted delivery-ledger metadata only after an actual authorized request. **No live protected request has been made by this candidate development task.**
3. Main deployment configuration retains \`git.deploymentEnabled=false\`; PR creation does not authorize Vercel preview or production deployment.
4. QA in GitHub must be mocked/loopback, not live providers or production Supabase. Use only fictional holdings and source fixtures.
5. The user requires **exact-current-SHA CI to finish successfully before continuation**. A failed check must be diagnosed and repaired; do not disable checks, weaken no-write assertions or count a previous-head success as new-head green.
6. GitHub previously reported \`main.protected=false\` although \`scripts/release-candidate.mjs\` requires protected main for a release. This remains an independent future release blocker. No settings were changed.
7. A draft candidate PR or this handoff does **not** authorize merge, deploy, secret inspection, Supabase change, live API polling, Telegram delivery or investment action.

## Release limitations
- Live data/source authenticity, complete transactions and corporate actions, true event/inbox delivery coverage, external model accuracy and hosted acceptance are **not validated** by fixture tests.
- External Council/forecast/risk radar work remains in PR #168 for later milestones; it is not part of this main-based candidate.
- Candidate fidelity must be assessed against the relevant Milestone 2 acceptance matrix; do not mark production release or five-milestone count as completed from code or CI alone.
- The full PR #168 stack is 85 commits ahead and 10 behind main; this branch does **not** attempt to reconcile every unrelated feature and cannot serve as proof that PR #167 is mergeable.

## Codex continuation
Read this file and the latest draft PR for \`release/milestone2-integrated-candidate-20261115\`, review the exact current commit and tests. If CI fails, inspect authentic job logs, correct the underlying issue and rerun full CI until green. After green, audit remaining Milestone 2 acceptance gaps, particularly production-independent route/navigation restoration, stable editing, authentication, mobile keyboard access and dossier source boundaries. Keep all original work and PRs unchanged; stop at review-only.

## First exact-candidate CI failures and planned correction

Commit `e3553dfe85a724e7b2251bb7b5cfad7a34f02b38` failed Frontend CI (`35` unit test failures all caused by three omitted fictional fixtures) and one Playwright assertion expecting nonexistent text `Portfolio evidence`. Actual Evidence view rendered `Evidence coverage`; the browser test must use that real label without changing the zero-unexpected-write assertion. The correction imports `qa/fixtures/dossier-operating.fictional.json`, `qa/fixtures/sec-statements.fictional.json`, and `qa/fixtures/release2/research-input.json` intact from the verified source branch and updates only the mismatched test selector. The existing source-quality contracts and security checks are unchanged. **The corrected SHA requires its own successful CI; this is not pass evidence.**
