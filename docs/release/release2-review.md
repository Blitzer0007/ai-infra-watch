# Release 2 — first implementation increment

Branch: `feature/release2-opportunity-research`.
Base: `4c008237453d8e31944cb5fba00cac9726f49501` from Release 1 draft PR #167.
Scope: safety audit, snapshot/quality contracts and a research scanner using loaded data.

## Implemented

- `/opportunities` navigation and search entry; scan loaded data explicitly, filter results and inspect evidence/missing inputs on desktop and mobile.
- Bounded, deduplicated snapshot capture with omitted/invalid coverage. Raw response credentials are not copied. Failed holdings retrieval is explicitly unavailable, not a complete empty portfolio.
- A shared quote-quality helper extracted without changing the existing holding-decision evidence/accounting requirements.
- A pure research eligibility adapter for dated reported financials and verified asset/listing metadata, and the experimental contract in `release2-rule-contracts.md`.
- Research outputs are separate from holding decision states; no trade, sizing, return or validated-family claim is introduced.
- An explicit fictional simulated fixture and unit/browser tests for no IO/writes, source failures, conflict, stale/simulated inputs, limits and unavailable/empty coverage.
- Corrected an existing journal null-weekly render discovered by the failed-holdings scenario. Unknown counts/history display unavailable rather than crashing or implying zero.
- The watchlist's independent automatic alert-config POST is now guarded in DEV/QA. Its existing production behavior remains unchanged.

## Dependency and write-path audit

| Path | Observation | Treatment |
|---|---|---|
| App alert-config synchronization | Existing DEV/QA guard | Retained |
| Portfolio signal-scorecard submission | Existing DEV/QA guard | Retained |
| Browser Telegram relay | Existing DEV/QA guard | Retained |
| Watchlist alert-config synchronization | Independent auto-POST lacked the same guard | Added DEV/QA guard and browser regression |
| Existing re-entry editing/removal | Explicit user actions, not scanner paths | No changes or invocation; tests use mocks |
| Scanner snapshot/evaluation | Pure functions and local component state | No fetch, timer, server persistence, notification or credential dependency |
| Existing App quote/feed refresh | Existing application behavior | No additional scanner polling/provider requests |

The production decision-center GET handler may persist stage state; it is not used as a development snapshot source. No production endpoint or secret was accessed. The remaining Release 1 risk-kernel/reconciliation specification is preserved; this scanner does not rely on those incomplete risk extensions.

## Validation and limitations

Validation passed in Codex Cloud: TypeScript, 379 unit tests, 78 mocked browser/workflow-safety tests, source security audit, migration-manifest verification, production build and whitespace checks. The five Release 2 browser cases additionally cover scan filters/direct route/mobile layout, zero scan requests/writes, development watchlist isolation, and unavailable versus empty holdings. Store only fictional screenshots in `/workspace/artifacts/release2-opportunities-*.png`.

The UI intentionally has no live financial/company enrichment in this increment. Missing verification remains visible rather than mapping curated ticker names to verified issuer facts. Unit tests exercise valid normalized observations; the committed runtime fixture is explicitly simulated and never eligible. No new runtime package, database schema, provider request or production scheduler is required.

Existing CSS/bundle warnings remain. Future scanner families and actual provider access need their own reviewed evidence/normalization contracts. Research-candidate status is not a validated investment signal.

## PR and rollback

Keep Release 2 separate from Release 1. If Release 1 remains unmerged, target a stacked draft PR at its feature branch; do not merge it as a development shortcut. Require checks on the exact head before review.

Rollback is an application-code revert; no database rollback or message replay is required. No merge, Vercel deployment, production Supabase modification or Telegram delivery is authorized by completing this increment.

## Subsequent review increments

- [Page-by-page UI/UX audit and improvements](uiux-audit.md).
- [Snapshot-backed catalyst calendar](release2-calendar-review.md), with source/coverage and correction limitations. This adds Calendar as the sixteenth application route; the private access screen is checked separately.

- [Read-only alert inbox and focused Portfolio Intelligence](release2-inbox-portfolio-review.md): bounded recipient-scoped SELECT reader, local acknowledgement, clear delivery semantics, and task-based portfolio navigation. Inbox adds the seventeenth route. Notification activation remains out of scope.
- [Fictional notification-policy preview](release2-notification-policy-preview.md): collapsed inbox tool, pure deterministic proposal evaluator, stable scoped episode checks, known-acceptance duplicate suppression, explicit unknown/reconciliation states and draft cooldown/digest options. No actual settings, ledger records or sender are connected.
- [Controlled JEV coverage review and REA status](release2-jev-and-rea-review.md): manual Opportunities reviews, minimized coverage-only payload, typed server/client gates, successful-result reuse, per-view attempt bound and explicit usage metadata. Live development credentials are not configured; REA remains uninstalled.
- [First REA-assisted feature-mirroring increment](release2-holding-detail-mirroring.md): isolated REA CLI and pinned public Ghostfolio source, with explicit partial coverage; original read-only holding-detail dialog preserving list context, history, focus, scroll and unsaved editing drafts. No runtime reference-app parity or financial-rule changes are claimed. This supersedes the earlier REA-uninstalled status.
- [Compact daily Telegram decision brief](release2-daily-telegram-review.md): priorities/reasons/next checks, explicit data warnings and full-versus-shown queue coverage, bounded text and holding-dialog links. Existing sender controls remain unchanged; all transports in tests are fictional. [Progress and remaining implementation](release2-progress.md) records the approximate engineering percentage separately from production rollout.
