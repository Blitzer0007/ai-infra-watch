# AI Infra Watch — Canonical Product Roadmap

Last reconciled: 2026-10-14

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
- [ ] Add/confirm a production-safe authenticated smoke path for the dashboard and JEV UI; no proposal writes.
- [ ] Verify authenticated response shapes and confirm unauthenticated requests remain rejected.
- [ ] Run a real user-session check only if a secure, user-approved session path is available. Do not store credentials or treat mocked Playwright as proof of authenticated production behavior.
- [ ] If the environment cannot supply a safe real session, record the item as blocked/unverified rather than claiming success.

### P1-B — Historical backtest integrity
- [ ] Audit adjusted-close semantics, date/benchmark alignment, decision/execution timestamps, rebalance timing, and transaction-cost accounting.
- [ ] Verify point-in-time cutoffs for every decision and reject look-ahead observations.
- [x] Gate evidence-ready status on explicit point-in-time universe-membership verification; price history and cutoffs alone do not resolve survivorship bias.
- [ ] Obtain reliable historical universe membership data and document residual survivorship-bias limitations when using today's selected universe and tickers.
- [ ] Keep outputs labeled exploratory/insufficient whenever provider availability timestamps or universe membership are assumed or unknown.
- [ ] Run unit tests, typecheck, build, API/DB validation, and Playwright CI; record remaining data-provider limitations.

### P1-C — Re-entry Telegram delivery and deduplication
- [ ] Count a notification only when Telegram's response confirms `ok: true` and supplies a message ID.
- [ ] Verify candidate-state transitions suppress repeat alerts while allowing a new alert after the state returns to non-candidate and later re-enters candidate.
- [ ] Preserve retry behavior when delivery fails; inspect scheduled workflow results and endpoint error counts.
- [ ] Record actual delivery evidence from a naturally occurring/authorized scheduled run. Do not send unsolicited test alerts or expose credentials.

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

## Release gate
A milestone is complete only when its required checklist items are validated and CI is green. Open PRs, successful mocked UI tests, and assumed historical availability do not by themselves establish production correctness. Keep PRs preview-first and batch the final production deployment after explicit approval.
