# Milestone 2 — Integrated Portfolio Core acceptance review

**Candidate:** Draft PR #168, `feature/release2-opportunity-research`, stacked on draft PR #167. **Not merged or deployed.**
**As of:** 15 November 2026.
**Status:** Source integration and fictional acceptance suite extended; **release-candidate sign-off not yet granted**. The exact post-change head must pass all seven GitHub workflows; do not substitute previous-head green results.

## Defined Milestone 2 boundary

The five-deployment plan defines this milestone as **Portfolio / Opportunities / company dossier / Catalyst Calendar / Alert Inbox integration** with explicit source/coverage/conflict explanations, navigation and retained reading/editing context, and tested loading/missing/error states on desktop/mobile. Milestone 3 research agents, Milestone 4 forecast outcomes and Milestone 5 full operational hardening are separate. Full authentic issuer/ledger/corporate-action provenance is not established by fixture acceptance and must not be represented as complete.

## Integrated review journeys and evidence

| Journey / control | Implemented source | Offline acceptance | Limitations |
| --- | --- | --- | --- |
| Portfolio daily review → selected holding → evidence and performance | `PortfolioIntelligence.tsx`, `PortfolioCommandCenter.tsx`, `HoldingDetailDialog.tsx` | `qa/test_portfolio_navigation.py`, `qa/test_holding_detail.py`, `qa/test_milestone2_integrated.py` | Unsupported historical comparison/valuation remains unavailable |
| Portfolio manager → navigate sections → return to unsubmitted editor | `PortfolioManager.tsx`, `PortfolioIntelligence.tsx` | `qa/test_portfolio_navigation.py`; new 360/768/1440px draft banner and Back acceptance in `qa/test_milestone2_integrated.py` | Draft lives only in the app session; saving requires explicit action and authenticated backend |
| Opportunities snapshot → unheld company dossier → return with filters | `OpportunityScanner.tsx`, `CompanyResearchWorkspace.tsx` | `qa/test_company_research_navigation.py` | Snapshot re-scan remains manual; no unsupported issuer enrichment |
| Calendar event → exact research context → return | `CatalystEventCard.tsx`, `ReviewOriginContext.tsx`, `CompanyResearchWorkspace.tsx` | `qa/test_review_workspace_navigation.py`; `qa/test_milestone2_integrated.py` | Date-only, estimated, cancelled and correction gaps preserved; no original event after reload |
| Alert Inbox detection / provider acceptance → research context → return | `AlertInbox.tsx`, `ReviewOriginContext.tsx` | `qa/test_alert_inbox.py`; `qa/test_review_workspace_navigation.py`; `qa/test_milestone2_integrated.py` | No read receipt, no automatic episode correlation, sender or retry |
| Financial source/statement conflicts and issuer/period boundaries | `CompanyDossier.tsx` plus `dossierOperating.ts` and statement-admission consumers | `qa/test_dossier_operating.py`, `qa/test_dossier_statements.py`, `qa/test_milestone2_integrated.py` | Strictly fictional/declaration evidence; actual source acquisition not connected |
| Missing/loading/error, keyboard access and small screens | Portfolio, dossier, Calendar and Inbox views | Existing portfolio/research/inbox/calendar/browser suites; added integrated 360/768/1440px cases | Complete independent accessibility audit and real hosted acceptance not established |

## Source and editing rules

1. A visible editor that survives Portfolio tab navigation must disclose that it is *unsubmitted*. A different view must not silently save or discard a draft. No new cross-reload storage or API write is introduced.
2. The exact original clicked Calendar/Inbox record is stored in bounded App-session memory, not URL params. On reload, direct entry or missing source data, display “context unavailable”; do not select a same-symbol substitute.
3. An opened event or delivery record and the disconnected financial dossier must explicitly describe separate evidence scopes. Neither a source label nor a Telegram acceptance receipt authenticates an issuer or establishes a trade decision.
4. Preserve all existing abstentions for incomplete holdings, absent quote timestamps, missing market histories, unsupported cash-flow reconciliation and financial source conflicts. No source-status claim should be upgraded solely because the UI is integrated.
5. Browser tests use fictional/isolated fixture data; no production secrets, private financial rows, production Supabase writes, provider polling, Telegram sends or Vercel deployments.

## Confirmed passive-write defect fixed in this batch

The initial integrated acceptance run failed because entering Evidence emitted two browser-side `POST /api/signal-scorecard` requests. The scorecard API persists POST payloads. These passive writes were removed from the Portfolio and Signal Fusion view components rather than weakening the test. Read-only historical scorecard GET remains; any subsequent recording requires explicit review/authorization. The three new viewport tests still assert **zero non-GET requests**. The first run's six green checks do not certify the corrected head.

## Verification and release gate

- Before this source increment, `8b5a2a2896c86bcaed39ad5033bdd503df2bd190` passed all seven required workflows on the exact SHA.
- The new coherent source checkpoint needs its **own exact-head** Frontend CI, Backend Container CI, Python Agents Tests, Continuous Quality Eval, AI Quality Gate, Vercel Python CI and UI API DB Validation results. This document is not a test result.
- For any failing test, investigate underlying code/fixture behavior, fix it and require fresh exact-head green CI without disabling checks or lowering standards.
- **Unshipped, release blockers:** reviewed release-candidate diff must reconcile the draft PR stack against current `main`; final compatibility/security/accessibility/resource review, candidate acceptance matrix and separate user authorization remain outstanding. Do not merge PR #167/#168 or deploy merely because source tests pass.

## Next Codex handoff

Read this document, `CODEX-CONTINUATION.md`, draft PR #168, and the latest exact-head workflow/job conclusions. Finish remaining verified integration defects only. If all required checks are green, prepare a **review-only isolated Milestone 2 release-candidate specification** against current `main` and list material dependencies; do not merge, deploy, fetch production private data or activate live agents.
