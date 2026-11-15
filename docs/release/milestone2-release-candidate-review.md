# Milestone 2 — Isolated release-candidate compatibility review

Read-only source and GitHub comparison review, 15 November 2026. This is a **candidate specification**, not an assembled/verified release candidate or permission to release.

## Pinned facts and CI evidence

| Reference | Verified status |
| --- | --- |
| Production main | d678cbe0ada0a329f541273181fb0b7f52ad0f90; Milestone 1 shipped |
| Draft PR #167 | 4c008237453d8e31944cb5fba00cac9726f49501; against main, dirty/unmergeable; do not merge |
| Draft PR #168 | 9458b2eca91656deae16446592ae4cbaa1f43155; based on PR #167 branch, mergeable there, draft |
| Shared Git merge base | 8cb77d256b27c6983bf911db4c4ac32c667dca53 |
| Main vs PR #168 | Diverged: **85 commits ahead, 10 behind**. GitHub compare returned a capped 300-file sample; PR #168 has 433 files changed against its draft base. No claim of exhaustive diff |
| PR #167 vs main | PR #167's two commits and main's ten commits overlap on 32 changed file paths. These are overlapping paths, not necessarily 32 textual conflicts |
| Exact PR #168 source validation | **7/7 required workflows successful** on 9458b2e: [full UI/API/DB](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386317), [Frontend](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386481), [Backend](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386323), [Python](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386428), [Vercel Python](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386224), [AI gate](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386764), [Continuous eval](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43735386933) |

The full mocked Playwright job reached 100% and concluded success with no reported failures. This establishes **fictional-fixture acceptance on the feature branch**, not issuer authenticity, live model effectiveness, an isolated candidate, or deployed production readiness.

## Scope to isolate for Milestone 2

1. **Portfolio review and holding editor:** src/components/PortfolioIntelligence.tsx, PortfolioManager.tsx, src/components/portfolio/PortfolioNavigation.tsx, HoldingDetailDialog.tsx and required accounting/read-only helpers. Preserve unsaved drafts across portfolio tabs and never silently save or discard. Historical returns and P&L remain withheld when history or accounting evidence is incomplete.
2. **Opportunities and manually selected research:** relevant OpportunityScanner, src/components/portfolio/CompanyResearchWorkspace.tsx, HoldingCompanyDossier.tsx, CompanyDossier.tsx, and their admitted financial/statement adapters. A watchlist company is not an owned position; no automatic statement/feed retrieval or unverified issuer claim.
3. **Calendar, Inbox and exact-record links:** src/components/calendar/CatalystCalendar.tsx, CatalystEventCard.tsx, src/components/alerts/AlertInbox.tsx, src/utils/reviewWorkspaceNavigation.ts, reviewRecordContext.ts, src/components/portfolio/ReviewOriginContext.tsx, src/App.tsx and required adapters. Preserve chosen event/alert, source uncertainty, bounded session-only context, original date precision, Back/Forward, and explicit context loss on reload. No event/alert bodies or provider IDs in URLs.
4. **Source boundaries and passive write fix:** CompanyResearchWorkspace distinguishes feed events, browser detections, server deliveries and the source-disconnected dossier. PortfolioIntelligence and PortfolioSignalFusion **must not POST to /api/signal-scorecard on ordinary navigation**; SignalScorecardPanel may read historical results. Never infer Telegram read receipt, cross-source corroboration or trade eligibility.
5. **Testing contracts:** retain all current-main security/accounting/quote-admission tests; port qa/test_milestone2_integrated.py and its qa-validation.yml invocation plus related portfolio, opportunity, company dossier, Calendar, Inbox, navigation, and source/ledger acceptance suites. Use fictional fixtures/disposable PostgreSQL.

These are representative **entry points**, not a complete file manifest. Build a dependency-closed manifest and inspect the whole diff before creating a candidate.

## Reconciliation hotspots (main safeguards take priority)

The two sides' 32 overlapping paths include:

- Navigation and state: src/App.tsx, src/components/PortfolioIntelligence.tsx, DecisionImpactCenter.tsx, HelpGuide.tsx.
- Market, financial, decision: api/_market-data.js, server/api/decision-center.js, server/services/marketDataValidation.js, src/utils/decisionCardAdapter.ts, src/utils/decisionEligibility.ts, src/utils/alertEngine.ts.
- CI and tests: .github/workflows/qa-validation.yml, sec-filings-refresh.yml, package.json, qa/conftest.py, qa/safety.py, qa/test_ci_safety.py, qa/test_api.py and qa/test_deployment_workflow.py.

Latest main also has critical release/security/accounting improvements outside that overlap, including api/auth.js, api/portfolio.js, .github/workflows/vercel-production-deploy.yml, scripts/release-candidate.mjs, server alert-admission logic and shared quote/ledger/accounting modules. **Do not overwrite these with an old version from either draft branch.** Exact text conflicts require an isolated merge rehearsal with latest main, not inference from filenames. No conflict was resolved as part of this document.

## Candidate assembly instructions for Codex Cloud — not executed here

1. Check fresh main SHA and both draft PR heads. Start a **new draft candidate branch from main**, not by retargeting PR #168 or force-rebasing PR #167. Use GitHub/Cloud tools only; no Windows execution.
2. Port just Milestone 2's coherent UI, utility, integration and test dependencies from PR #168 with three-way source review (common merge base / main / feature). Avoid wholesale copying the 433-file stack. Keep main's Milestone 1 auth, alert/quote admission, accounting, CI release gates and no-simulated financial input rules.
3. Explicitly **defer** experimental Bull/Bear/Judge live agents and provider budgets (Milestone 3), forecast/outcome evaluation (Milestone 4), final cross-program optimization (Milestone 5), cron activations, private-data reads, Supabase migrations and Telegram sends. Do not silently activate a backend path just because a frontend component is included.
4. Run node lint/types, unit tests, build, security audit, migration-manifest checks, full mocked Playwright journeys at 360/768/1440px, ephemeral-DB tests and **all required exact-commit CI**. Preserve strict zero-unexpected-writes tests. Fix every real regression and rerun on the new SHA before claiming pass.
5. Produce a candidate-only matrix: precise include/exclude file list, API/schema compatibility, routes, write/read boundaries, auth/secret controls, Vercel/Supabase free-tier cost/cron impact, unknown source truth, UX/accessibility limitations, rollback and production prerequisites. No new external calls or provider usage without separate authorization.
6. Maintain both original PRs as drafts. A merge/deployment requires separate owner authorization. Current main's scripts/release-candidate.mjs requires exact main SHA/CI and branch protection; the previous Milestone 1 owner exception is **not** automatically renewed. No Vercel deployment or protected secret access from this review.

## Current completion classification

- Milestone 2 **feature-branch development and fictional integrated acceptance: verified** at PR #168 9458b2e.
- Milestone 2 **isolated main-based candidate / backward-compatibility proof: not done**.
- Milestone 2 **production release: not authorized, not deployed**; production remains 1 of 5 planned releases.
- **Real external facts remain unverified:** issuer/fundamental authenticity, complete ledger/corporate actions, live research-agent usefulness, actual provider receipt vs user read, and predictive outcomes. Never treat fixture evidence as real market proof.

## Next Codex prompt

Read this candidate review, docs/release/CODEX-CONTINUATION.md and milestone2-integration-acceptance.md, then fetch fresh PR #167/#168 and main. Assemble the smallest Milestone 2 candidate on a new branch from main, reconcile all Milestone 1 safety contracts, run every exact-candidate CI check to successful completion, and stop at a draft PR and a verified acceptance/limitations matrix. Do not merge/deploy, retrieve production secrets/private financial rows, change Supabase, poll real providers, run autonomous agents or send Telegram.
