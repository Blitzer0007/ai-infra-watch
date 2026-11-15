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

- [Portfolio context integrity](release2-portfolio-context-integrity.md): fix false freshness and lost zero moves in the Python research tool; withhold partial/unaligned USD marks and unsupported/unreconciled accounting totals, retain per-holding coverage and bound logical quote calls. Real source/model/hosted acceptance remains separate.

- [Loaded ledger review](release2-loaded-ledger-review.md): manual Evidence diagnostics over original stored fields, explicit unavailable/empty history and strict quantity/order/fee/unit gates. Reuse weighted-average accounting and preserve small remaining-position cost in three paths; no complete-accounting or decision-eligibility grant.

- [Python provider admission](release2-provider-budgets.md): shared process windows/concurrency/pacing, bounded retries/deadlines, 429 cooldown and fixed errors. Account-wide/Node coordination remains open.
- [Forecast validation audit](release2-forecast-validation-audit.md): pinned Qlib/StatsForecast comparison, actual bounded REA inspection and six pure-function/protocol counterexamples. Existing forecast code is not certified correct or modified by the report.

## Validation and limitations

Validation passed in Codex Cloud: TypeScript, 379 unit tests, 78 mocked browser/workflow-safety tests, source security audit, migration-manifest verification, production build and whitespace checks. The five Release 2 browser cases additionally cover scan filters/direct route/mobile layout, zero scan requests/writes, development watchlist isolation, and unavailable versus empty holdings. Store only fictional screenshots in `/workspace/artifacts/release2-opportunities-*.png`.

The UI intentionally has no live financial/company enrichment in this increment. Missing verification remains visible rather than mapping curated ticker names to verified issuer facts. Unit tests exercise valid normalized observations; the committed runtime fixture is explicitly simulated and never eligible. No new runtime package, database schema, provider request or production scheduler is required.

Existing CSS/bundle warnings remain. Future scanner families and actual provider access need their own reviewed evidence/normalization contracts. Research-candidate status is not a validated investment signal.

## PR and rollback

Keep Release 2 separate from Release 1. If Release 1 remains unmerged, target a stacked draft PR at its feature branch; do not merge it as a development shortcut. Require checks on the exact head before review.

Rollback is an application-code revert; no database rollback or message replay is required. No merge, Vercel deployment, production Supabase modification or Telegram delivery is authorized by completing this increment.

## Subsequent review increments

- [Source Quality Agent](release2-source-quality-agent.md): first manual Cloud role over loaded quote metadata, two trusted local tools, strict inputs, explicit partial coverage and budgets, no source/eligibility upgrade and no provider/model IO. Separately repair the general non-stub planner branch and fail closed on invalid planner output; fake-model tests cover the changed path. The subsequent [manual development UI](release2-source-quality-ui.md) adds a minimized frozen-quote adapter and authenticated loopback transport with real Python/core browser verification. Live provider adapters, production activation and scheduled behavior remain out of scope.

- [Autonomous-agent comparison and Python source reliability](release2-autonomous-agents-review.md): actual bounded REA pyc inspection plus manual review of three pinned financial projects; nullable Python quote metadata, honest batch/feed time, corrected backoff, groundedness schema/claim splitting/ticker routing and stronger offline CI. The next source-quality/research/daily-review roles are specified, not activated; no investment-effectiveness claim is made.

- [Page-by-page UI/UX audit and improvements](uiux-audit.md).
- [Snapshot-backed catalyst calendar](release2-calendar-review.md), with source/coverage and correction limitations. This adds Calendar as the sixteenth application route; the private access screen is checked separately.

- [Read-only alert inbox and focused Portfolio Intelligence](release2-inbox-portfolio-review.md): bounded recipient-scoped SELECT reader, local acknowledgement, clear delivery semantics, and task-based portfolio navigation. Inbox adds the seventeenth route. Notification activation remains out of scope.
- [Fictional notification-policy preview](release2-notification-policy-preview.md): collapsed inbox tool, pure deterministic proposal evaluator, stable scoped episode checks, known-acceptance duplicate suppression, explicit unknown/reconciliation states and draft cooldown/digest options. No actual settings, ledger records or sender are connected.
- [Controlled JEV coverage review and REA status](release2-jev-and-rea-review.md): manual Opportunities reviews, minimized coverage-only payload, typed server/client gates, successful-result reuse, per-view attempt bound and explicit usage metadata. Live development credentials are not configured; REA remains uninstalled.
- [First REA-assisted feature-mirroring increment](release2-holding-detail-mirroring.md): isolated REA CLI and pinned public Ghostfolio source, with explicit partial coverage; original read-only holding-detail dialog preserving list context, history, focus, scroll and unsaved editing drafts. No runtime reference-app parity or financial-rule changes are claimed. This supersedes the earlier REA-uninstalled status.
- [Compact daily Telegram decision brief](release2-daily-telegram-review.md): priorities/reasons/next checks, explicit data warnings and full-versus-shown queue coverage, bounded text and holding-dialog links. Existing sender controls remain unchanged; all transports in tests are fictional. [Progress and remaining implementation](release2-progress.md) records the approximate engineering percentage separately from production rollout.
- [Rule and calculation audit](release2-calculation-audit.md): repository-wide static inventory, first detailed corrections and explicit open review gates. This is not comprehensive numerical or investment-model certification; the remaining reliability work takes priority over new financial widgets.
- [Missing-data analytics correction](release2-missing-data-analytics.md): no artificial group/rotation baselines, midpoint percentile ties, common source windows, honest horizon labels, strict quote parsing and unavailable/reset portfolio stress. Twenty new unit/transport cases and seven fictional browser cases preserve the distinction between observed zeroes, unavailable inputs and verified decision eligibility.
- [REA-assisted data-source audit](release2-data-source-audit.md): selected static source analysis with explicit partial/truncated coverage; shared Vercel quote normalization, unknown-safe metadata, oldest complete feed observation time and nullable history currency. The standalone generated/canned feed now explicitly returns unavailable. Twenty-two new offline cases bring the Node/TypeScript suite to 539. Python parity, SEC budgets/filing semantics, historical provenance and actual provider entitlements remain open; no live source is certified.

## Forecast summary correction increment

[Summary integrity corrections](release2-forecast-summary-corrections.md) fix loaded-window chronology, contradictory coverage verdicts, strict scalar/calendar eligibility and filtered global 5D/20D counts. The panel explains heuristic scores/denominators and sample-count limits, clears superseded results and treats malformed/unavailable responses as errors. There are 690 passing Node tests, eight fictional loopback browser cases and 25 offline workflow-safety cases, plus type/build/security/migration checks. Shared-helper compatibility is documented; no writer handler, horizon mapping, stored outcome or threshold is changed. Session/PIT history guards, legacy analytics and held-out evaluation remain open.

## Offline session and history preflight increment

[Session/history preflight](release2-forecast-session-preflight.md) adds a pure versioned experimental evaluator and fixed fictional Cloud runner. Explicit daily session schedules replace weekday inference inside this isolated protocol; features and labels have separate availability/adjustment vintages, and missing/future/duplicate bars withhold outcomes. It preserves pending targets and refuses legacy snapshots. All results retain false source-verification, production-eligibility and predictive-validity claims. There are 86 new cases (776 Node tests total), plus type/build/security/migration and 25 safety checks. It is not wired into any existing tracking/writer/UI/model path; authoritative adapters, purged rolling evaluation and legacy compatibility remain pending.

## Retained forecast archive binding increment

[Retained archive binding](release2-forecast-archive-binding.md) adds a bounded byte-only adapter with a separately selected manifest pin, exact source/record/vintage bindings and calendar/bar projection from parsed content into the existing preflight. Pending assessments do not inspect outcome bytes; checksums do not bypass data/availability/identity checks. Source authenticity, production eligibility and predictive validity remain false. The fixed fictional CLI accepts no external path/input. There are 56 added cases (832 Node tests total), plus type/build/security/migration and 25 safety checks. No live source, writer, schema, UI, model or delivery integration is introduced.

## Purged offline forecast scoring and remaining-work register

[Offline walk-forward evaluation](release2-forecast-walk-forward.md) composes pinned archive windows, chronological validation origins, frozen holdout training, overlap/gap/availability purging and exact declared fit-ID receipts. Model, zero-change and empirical-training forecasts use the same paired outcomes; zeros, missing/pending/excluded/unassessed rows remain explicit. Proper point/quantile/interval diagnostics are descriptive, without fitting, ranking, provenance authentication or promotion. The isolated return calculation now avoids cancellation for tiny price changes. There are 41 new cases (873 Node tests total), plus type/build/security/migration and 25 safety checks. [All remaining tracks and gates](release2-remaining-work.md) are consolidated separately; overall engineering remains approximately 55% complete and production rollout has not started.
