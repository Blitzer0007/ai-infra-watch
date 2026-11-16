# Milestone 2 — isolated main-based candidate and acceptance matrix

**Review date:** 16 November 2026. **Current working PR:** [#172](https://github.com/Blitzer0007/ai-infra-watch/pull/172), draft against production `main`. **No merge or deployment.**

## Additional acceptance: details only on user request (pending exact-head verification)
- Gates hold-specific advanced market history, 52-week high, analyst and peer comparators behind an explicitly selected, loaded Holding Detail Dialog; no incidental calls from default overview/holdings list.
- Evidence, Performance and consciously selected Detailed Overview preserve their own advanced read paths. Quote freshness is visible in the modal and older symbol-dependent results are cleared while new evidence loads.
- Browser regression coverage includes no passive advanced reads, positive explicit-detail reads and missing deep-link withholding. Explicit portfolio saves remain in existing management and no new passive writes are allowed.

## Follow-on integration: holding detail and progressive management (pending exact-head CI)
The candidate adds a read-only Holding Detail Dialog, explicit route-safe selected-holding context, Escape and focus trapping, Back/Forward and close focus/scroll restoration, and collapsed Holdings-only management that retains unsaved editor state without network writes. Fictional browser tests cover these routes and the pre-existing save contract. This follow-on must pass its own exact-head CI; the previously verified source commit and 3dc1254 checkpoint do not certify it. Inherited selected-position/history fetch timing, independent accessibility review and any real broker/source evidence remain unverified. No merge, deployment or production/backend changes are authorized.

## Pinned sources and verification

| Item | Evidence |
| --- | --- |
| Shipped Milestone 1 main base | `d678cbe0ada0a329f541273181fb0b7f52ad0f90` |
| Stacked development reference | Draft PR #168, `d14f5fe57028d3277cc229b704bc126192f42815`; source branch not rewritten |
| Current verified *source* checkpoint | `e5a104cd1326e73d2ea344d5378ed5bbbafb2190` |
| Frontend CI | [Success on the source checkpoint](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320253), 908/908 Node tests, TypeScript lint, build and migration manifest checks |
| Security audit | [Success on the source checkpoint](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320265) |
| UI/API/DB Validation | [Success on the source checkpoint](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320237), mocked Playwright plus disposable Postgres and offline CI-safety jobs |
| PR comparison | 81 files changed at source checkpoint, based directly on `main`, mergeable without reported textual conflicts |

A future documentation-only commit changes the exact branch SHA and **requires fresh exact-head GitHub conclusions**; these links certify only `e5a104c`. The 3 workflow families are the ones triggered by this isolated PR's changed paths. The 4 extra agent/backend/quality workflow families seen on PR #168 are separately path-filtered and were not triggered by this narrower candidate; don't call them passed on this PR.

## Delivered candidate scope

- Retains the production main auth, quote-admission, ledger/accounting, risk-rule kernel, controlled alerts and release scripts. Does **not** wholesale merge PR #167 or #168.
- Adds read-only **Opportunities** manual frozen-snapshot scanning, **Catalyst Calendar** based on a Watchlist-loaded earnings snapshot, and **Alert Inbox** with an explicit manual server-history GET.
- Adds Company Research to the existing main Portfolio Research section, independently selecting configured holdings/watchlist companies. Issuer names, financial statements and Telegram receipts are not assumed authentic or corroborated.
- Keeps selected Calendar/Inbox records in a bounded App-session map and off URLs; a reload or direct link has no original record and displays unavailability instead of selecting a same-symbol substitute.
- Prevents passive `POST /api/signal-scorecard` from Portfolio and Signal Fusion review, and prevents a Watchlist configuration POST in development/QA. Existing production config synchronization remains under the pre-existing app controls.
- Pauses inherited per-portfolio quote, history, FX and analyst request paths while Company Research is selected; existing global bootstrap behavior is not changed.
- Fixes the existing `DecisionJournalPanel` nullable weekly-result rendering crash by using its defined unavailable fallback. No journal is written by viewing it.
- Exposes unsaved-holding-form status without automatically saving or discarding a draft when switching existing Portfolio sections.

## Candidate acceptance matrix

| Workstream | Verified fictional/offline coverage | Remaining limitation |
| --- | --- | --- |
| Main accounting/data quality | Main TypeScript/Node tests, release/security and disposable database jobs pass; audited main accounting files unchanged | Genuine broker completeness, corporate actions and issuer source accuracy not established |
| Portfolio daily review & safe queue | `PortfolioCommandCenter.tsx`, `PortfolioReviewQueue.tsx`, `PositionDecisionCard.tsx`, `DecisionEvidencePanel.tsx`, main `decisionCardAdapter.ts` and `decisionEligibility.ts`; new fictional integrated tests | Prioritized risk/missing-data review, withheld quote/ledger states, deterministic explanations, card-to-Holdings/Evidence navigation without passive writes | Not a forecast or broker order; missing actual issuer/ledger provenance remains withheld |
| Portfolio responsive workspaces & history | `PortfolioNavigation.tsx`, `PortfolioIntelligence.tsx`, main `qa/test_milestone2_candidate.py` additions | Keyboard select at 360/768/1440, desktop buttons, browser Back/Forward restoration and retained unsubmitted editor values | `HoldingDetailDialog`, full detail-history ownership, progressive editor and scroll/focus parity are still unported |
| Portfolio editor | Draft values persist across section changes; explicit save/cancel; no passive network writes asserted | This is main's existing editor, not the redesigned progressive editor from PR #168; advanced Back/Forward editing UX remains to be reconciled |
| Opportunities | `qa/test_release2.py` and `qa/test_company_research_navigation.py`: frozen manual scans, status and filters, research selection, failure/empty distinctions, keyboard/responsiveness | Zero verified signal families; no autonomous ranking, new feed, or live-model performance proof |
| Calendar | `qa/test_catalyst_calendar.py`: existing feed only after manual Watchlist access, date precision/zone, cancellation/revision, stale/simulated/failed sources, small screens | No independent new catalyst feed; snapshot coverage is bounded and session-local |
| Alert Inbox | `qa/test_alert_inbox.py`, `server/api/alert-inbox.test.js`, `server/services/alertInbox.test.js`: GET-only authorization, recipient scope, redaction, provider uncertainty, paging, no resend | No real delivery/read receipt verification; query requires an authorized explicit user request |
| Cross-workspace exact context | `qa/test_milestone2_candidate.py`: clicked Calendar event vs unrelated event, opened Inbox delivery, research/dossier separation, return without source re-fetch, link redaction and missing context after direct entry | This is narrower than the complete reading-context/scroll/focus/back-stack acceptance of stacked PR #168 |
| Missing/error states | Browser tests cover missing holdings, empty data and null journal weekly summaries without dashboard crash | Hosted-production journey and independent accessibility audit are not established |
| Writes, security and free tiers | Passive signal-store writes absent; existing production auth/portfolio APIs and deployments untouched; new inbox route is protected GET-only; no added cron/migrations | Authorized user interactions with existing editable components still need normal app permissions; no real Supabase or Telegram calls were made in verification |

## Precise candidate file boundaries

- **Main-preserving integrations:** `src/App.tsx`, `src/components/PortfolioIntelligence.tsx`, `PortfolioManager.tsx`, `PortfolioSignalFusion.tsx`, `BuySellWatchlist.tsx`, `EarningsAlerts.tsx`, `DecisionJournalPanel.tsx`. **New UX port:** `src/components/portfolio/{PortfolioCommandCenter,PortfolioReviewQueue,PositionDecisionCard,DecisionEvidencePanel,PortfolioNavigation}.tsx`.
- **New review surfaces:** `src/components/opportunities/*`, `src/components/calendar/*`, `src/components/alerts/AlertInbox.tsx`, `src/components/portfolio/{CompanyResearchWorkspace,CompanyDossier,ReviewOriginContext,HoldingCompanyDossier}*`, related read-only adapters/utilities.
- **Protected read API:** `api/market.js`, `vercel.json` (the `/api/alert-inbox` GET route), `server/api/alert-inbox.js`, `server/services/alertInbox.js`, `shared/alertDeliveryEvidence.js` and their offline unit tests.
- **Deterministic tests and sources:** `qa/test_milestone2_candidate.py`, `qa/test_release2.py`, `qa/test_alert_inbox.py`, `qa/test_catalyst_calendar.py`, `qa/test_company_research_navigation.py`, fictional dossier/SEC fixture files, `.github/workflows/qa-validation.yml`.
- **Deliberately untouched:** `api/auth.js`, `api/portfolio.js`, `server/api/decision-center.js`, production release workflow, Supabase migrations, cron workflows, production secrets or rows.
- For the exhaustive current candidate manifest, review [PR #172 Files changed](https://github.com/Blitzer0007/ai-infra-watch/pull/172/files); this table is a scope summary, not a complete manifest.

## Excluded from this isolated candidate / acceptance gaps

The PR #168 `PortfolioCommandCenter` and `PortfolioNavigation` are now integrated on main and have passed the candidate's offline source checks. **Still unported:** `HoldingDetailDialog`, the complete selected-holding detail, progressive editor placement, section/record history ownership, scroll/focus restoration and some source/conflict presentation. They must be ported in small dependency-closed increments rather than wholesale over Milestone 1's financial, auth or release safeguards. Do **not** treat source-branch 7/7 green CI as proof that those features shipped through this candidate.

Likewise, Milestone 3 Bull/Bear/Judge agents and provider budgets, Milestone 4 forecasts/outcome claims, and Milestone 5 broad operational work remain deferred. The current candidate is a **tested integration increment**, not certification that every original Milestone 2 experience is fully replicated, or that any investment forecast is accurate.

## Release blockers, authorization, rollback

1. GitHub reports production `main.protected=false`, while the existing release script requires protected main. The prior one-off Milestone 1 owner exception is **not** automatically renewed. No protection/settings change was made.
2. Independent product/compatibility review must decide whether to accept this narrower Milestone 2 increment or add remaining redesigned Portfolio UX before release. Do not silently classify those unported journeys as completed.
3. A PR merge, Vercel build/staging/promotion, production data access, Supabase mutation, live provider polling, autonomous agent execution or Telegram send requires separate authorization. None occurred here.
4. Production remains on the previously verified Milestone 1 deployment. Its reviewed rollback target remains documented in the original source-branch continuation. No rollback or deployment occurred.

## Next Codex session

Read this document, `docs/release/CODEX-CONTINUATION.md` on PR #172, and the **live PR head / exact SHA check conclusions**. Do not resume the older stacked draft in place of this main-based candidate. Resolve any new CI regression before moving on, preserve tests and financial abstentions, maintain a candidate-only acceptance matrix, and stop at a draft reviewed PR unless the owner separately authorizes merge/release.
