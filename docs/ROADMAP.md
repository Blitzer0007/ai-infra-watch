# AI Infra Watch — Canonical Product Roadmap

Last reconciled: 2026-10-15

This is the canonical **product and engineering** checklist for AI Infra Watch. The separate `AI_Engineering_Roadmap.md` and `AI_Engineering_Roadmap-1.md` are learning/career plans; they are not product delivery backlogs and should not be used to infer product completion. `AI_INFRA_WATCH_AGENT_CONTEXT.md` is architecture/context reference material.

## Non-negotiable operating constraints

- JEV Autonomous Portfolio Lab: **paper-only**, US equities, weekly review.
- Benchmarks: **SPY and QQQ**.
- Execution: **manual approval only**. No broker orders, auto-live execution, or unattended trade placement.
- Evidence: point-in-time assumptions, incomplete source coverage, conflicts, and weak citation coverage must remain visible. Exploratory results are not validated alpha.
- Credentials: never place tokens, session cookies, or private portfolio data in source control, test logs, screenshots, or public artifacts.
- Production: finish implementation and CI validation first; production merge/deployment requires explicit user approval.

## P1 — Close before declaring the milestone complete

Track progress in [Issue #110](https://github.com/Blitzer0007/ai-infra-watch/issues/110).

### P1-A — Authenticated, read-only production UI
- [x] Add a production-safe read-only Playwright smoke path, local interactive smoke runner, and opt-in authenticated workflow using approved repository secrets; it does not click write actions or upload session data.
- [ ] Verify authenticated response shapes and confirm unauthenticated gates still reject access. Prior route-status checks establish navigation/access only, not correctness of all page data.
- [ ] Run the authenticated test with a safe, approved real user session if the secure session path is configured; mocked Playwright is not proof of authenticated production behavior.
- [x] Record missing safe-session prerequisites as blocked/unverified. Do not fabricate an authenticated pass.

### P1-B — Historical backtest integrity
- [ ] Finish the audit of adjusted-close/corporate-action semantics, strategy/benchmark date alignment, decision versus execution timing, rebalance timing, and transaction costs.
- [x] Require explicit per-date cutoffs and reject price rows whose supplied observation/availability times are after the cutoff.
- [x] Gate evidence-ready status on explicit point-in-time universe-membership verification; prices and cutoffs alone do not resolve survivorship bias.
- [ ] Obtain independent, effective-dated historical universe membership and genuine price-vendor publication/availability evidence. Yahoo response retrieval timestamps are not historical publication timestamps.
- [x] Keep historical outputs exploratory/insufficient when provider availability or universe membership is assumed or unknown.
- [ ] Run/confirm CI on the final integrated PR head. Tests validate gate logic, but do not by themselves validate the external provider’s claims.

### P1-C — Re-entry Telegram delivery and deduplication
- [x] Count delivery only when Telegram confirms `ok: true` and supplies a valid message ID.
- [x] Add transition and durable-claim tests; the same persisted alert episode is deduplicated, while an explicitly new persisted episode gets a new delivery key.
- [x] Prevent automatic duplicate retries after ambiguous Telegram/database outcomes; preserve known message IDs and require reconciliation before resetting a claim. Do not claim exactly-once semantics.
- [x] Inspect and record the 2026-10-15 natural scheduled run: zero rows scanned, zero Telegram messages, no row errors. This is an empty-watchlist run and **not** delivery evidence.
- [ ] After the approved migration/rollout, capture a natural run with a genuine candidate, Telegram message ID, persisted outbox status, and correlated workflow/API evidence. Do not manufacture production candidates or send test alerts.

## P2 — Product reliability and user trust
- [ ] Continue source-freshness normalization and cross-source conflict detection; keep insufficient evidence distinct from a successful conclusion.
- [ ] Verify earnings and re-entry notifications from scheduled delivery, including deduplication and actionable error reporting.
- [ ] Maintain clear data-health and evidence-coverage reporting, with provider/source timestamps and fallbacks disclosed.
- [ ] Keep decision rules, forecast verification, cash-flow accounting, and benchmark comparisons auditable.

## P3 — Longer-term product expansion (not a release blocker unless promoted)
- [ ] Expand event-study coverage only when reliable historical event and adjusted-price sources are available.
- [ ] Expand MCP specialist coverage (contracts, policy, risk, relationships) with schema validation, source provenance, bounded tool loops, and adversarial tests.
- [ ] Improve historical universe membership and point-in-time corporate-action data to reduce survivorship/look-ahead bias.
- [ ] Continue portfolio intelligence, alert UX, and research-evaluation improvements through scoped batches with CI.

## Separate learning/career roadmap
The two `AI_Engineering_Roadmap*.md` files describe study plans, courses, and career development. Reconcile/maintain those as a learning plan separately; do not mix course completion with product release status.

## Current release-gate state — 2026-10-15
- Integrated implementation and test harness are on draft PR #115; the latest head must have all required CI re-run after its final commit.
- GitGuardian incident `38232645` is scoped to historical disposable-CI test credentials. The `@gitguardian` note is recorded, but the actual `Skip: test credential` check-run action has not been confirmed and the check still fails.
- The production schema/outbox migration has not been applied. Production `reentry_watchlist` has no active rows, so a naturally scheduled run cannot currently prove message delivery.
- Historical publication timestamps and independent effective-dated universe membership have not been supplied; backtest evidence-ready remains blocked.
- JEV remains paper-only, US equities, weekly review, SPY + QQQ benchmarks, manual approval only. No merge, production migration, scan invocation, or deployment without explicit approval.

## Release gate
A milestone is complete only when its required checklist items are validated and CI is green. Open PRs, successful mocked UI tests, and assumed historical availability do not by themselves establish production correctness. Keep PRs preview-first and batch the final production deployment after explicit approval.
