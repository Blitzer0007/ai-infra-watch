# AI Infra Watch — Release 1 completion specification

Status: proposed implementation plan; not release approval.
Prepared: 8 November 2026, Asia/Kolkata.
Repository: `Blitzer0007/ai-infra-watch`.
Inspected baseline: `4c008237453d8e31944cb5fba00cac9726f49501`, branch `feature/release1-portfolio-command-center`, draft PR #167.
Environment: Codex Cloud only; no execution on the user's Windows PC.

This document translates the supplied **AI Infra Watch 2.0 — Read-Only Feature-Gap Analysis** into an implementation plan against the actual current branch. It supplements, rather than replaces, the original [Release 1 specification](release1-engineering-spec.md). The [review notes](release1-review.md) and [acceptance checklist](release1-acceptance-checklist.md) record the work already performed.

No application, workflow, infrastructure, or database changes are authorized merely by this planning document. Existing authorizations and production restrictions continue to apply.

## 1. Product outcome and scope

Deliver a medium-term US-equity portfolio review tool for a 2–12 month research horizon. A holding should explain what deserves review, the originating rule or metric, supporting/conflicting evidence, missing inputs, and the next review condition. A review is never an instruction to place a trade.

Complete Release 1 in this order:

1. Retain the implemented Command Center, glossary, decision-card adapter, quality gates and Cloud isolation.
2. Expose existing configurable risk rules as auditable evaluations, with fixture-only local what-if controls.
3. Expand reconciliation diagnostics and edge-case tests without replacing accounting methods.
4. Verify normalization and evidence propagation across the existing quote path.
5. Complete offline accessibility, financial-correctness, access-control and deployment-safety checks on the exact candidate commit.

Preserve these internal decision states unchanged:

```ts
type DecisionState =
  | 'ADD REVIEW'
  | 'HOLD / WATCH'
  | 'RISK REVIEW'
  | 'INSUFFICIENT DATA';
```

Do not introduce another stock scoring engine. A risk-rule breach can add an explanation or a risk-review item; it cannot silently redefine the existing position-state thresholds. A failed required input continues to suppress actionable classifications.

Out of scope: broker execution, order buttons, new production databases, Redis or full Ghostfolio/OpenBB deployments, an always-running research agent, increased polling, provider subscriptions, production schema changes, notification activation, REA installation, and guaranteed forecasts. A medium-term opportunity scanner and broader 1M/3M/6M out-of-sample evaluation remain a subsequent release.

## 2. Verified baseline versus remaining work

| Area | Present at the inspected commit | Remaining completion work |
|---|---|---|
| Command Center | Summary, coverage, concentration, prioritized cards, filters, timezone display | Add auditable risk-rule summary and reconciliation diagnostics; retain existing screens |
| Decision explanations | Adapter, rule origins, missing inputs, supporting quote citations, expandable methodology | Explicit rule IDs/configuration/evaluation results; link each evaluated condition to its inputs |
| Glossary | 20 terms, local search, related terms, examples, keyboard/mobile dialog | Add EV/EBITDA and EPS growth from the new gap analysis; state when metrics are unsuitable |
| Data quality | Numeric/provenance/session/freshness/conflict/simulation gates; provider-session helper | Verify the entire existing quote path preserves required metadata and failure categories |
| Risk configuration | Stored allocation, loss-limit, exit, broker-alert, staged-rule and risk fields; `PortfolioManager` editing | Consolidated read-only evaluation UI and local draft overrides; no new persistence |
| Rule execution | Exported `ruleDistance` in `server/api/decision-center.js`; deterministic scenario tests | Separate the pure kernel from the HTTP handler before browser reuse; inject time explicitly |
| Accounting | Weighted-average inventory, realized/open P&L, quantity mismatch, mixed-currency and coverage statuses | Edge-case characterization, explicit coverage diagnostics, no assumption that unknown values equal zero |
| Catalysts | Confirmed/sourced feed entries, calendar-date handling, no extra polling | Make provider confirmation/coverage limitations visible; no inferred event confirmations |
| Telegram | Existing authentication, schedules, claims/deduplication and provider-acceptance logic | Mocked safety-contract regression coverage; real delivery remains unverified until separately authorized |
| CI/release | Offline PR checks, manual opt-ins for live QA, disabled Vercel Git deployment | Reconfirm checks on the exact final PR head; no merge or deployment as part of development |

The historical analysis's statements about third-party licenses, quotas and repository names are inputs to planning, not independently verified current facts. This plan requires no third-party source integration or quota change.

## 3. Concrete source findings

- There is a `src/utils/decisionRules.test.ts`, but no current `src/utils/decisionRules.ts`. Tests import `ruleDistance` from the server handler. Do not add a competing implementation under the suggested filename.
- `StoredPortfolioHolding` already contains `lossLimitPct`, `exitRuleType`, `exitRuleValue`, `brokerAlerts`, `ruleStages`, `ruleStageState`, `targetAllocationPct`, `maxAllocationPct`, `riskGroup`, `riskBeta`, `riskLeverage` and `scenarioShockPct`.
- `PortfolioManager.tsx` already edits target/max allocations. This is an integration task, not a greenfield schema design.
- The decision-center handler can PATCH `rule_stage_state` when a staged evaluation is dirty. **Do not use the production GET endpoint as a supposedly read-only development data source.** Source inspection and pure-function tests are safe alternatives.
- The allocation block currently applies `Number(...)` before checking whether thresholds exist. JavaScript converts `null` to `0`. Missing/null/empty configuration must be distinguished from an explicitly configured zero before any new risk adapter consumes it. Treat this as a targeted validation correction, with a dedicated regression test and reviewer-visible behavior change.
- `calculatePortfolioTradingPerformance` already owns the weighted-average accounting behavior. Characterize edge cases before changing it; do not import a second accounting engine.

## 4. Component and domain contracts

Keep the existing `CommandCenterProps`, `DecisionCardModel`, `DataQualityResult`, `PortfolioSummary` and `FinancialTermProps` contracts. New fields are additive and optional where needed for backward compatibility.

### 4.1 Risk definitions and evaluations

```ts
type RiskRuleId =
  | 'allocation.maximum'
  | 'position.loss-limit'
  | 'position.exit-condition'
  | 'position.broker-alert'
  | 'position.staged-exit';

type RiskRuleConfig = {
  id: string;                    // stable holding/rule instance ID
  kind: RiskRuleId;
  symbol: string;
  enabled: boolean;
  threshold: number | null;
  unit: 'percent' | 'usd' | 'days' | 'configured-stages';
  origin: 'stored-holding' | 'local-draft';
};

type RiskRuleEvaluation = {
  rule: RiskRuleConfig;
  status: 'clear' | 'near' | 'breached' | 'target-reached'
    | 'insufficient-data' | 'disabled' | 'unconfigured';
  observedValue: number | null;
  distance: number | null;
  distanceUnit: 'percentage-points' | 'percent' | 'usd' | 'days' | null;
  reasons: DecisionReason[];
  evidenceIds: string[];
  quality: DataQualityResult;
  evaluatedAt: string;
  nextReviewCondition: string;
};

type RiskSummaryProps = {
  evaluations: RiskRuleEvaluation[];
  loading: boolean;
  error?: string | null;
  onSelectPosition: (symbol: string) => void;
};
```

A `target-reached` result remains distinct from a downside breach. Preserve the existing units: percentage points for portfolio weight versus an allocation limit, price-distance percent for existing stop/target rules, days for time limits. Never compare them as if interchangeable.

Configurable does not imply automated: existing stored rules are displayed as such; local overrides are explicitly labelled **Unsaved local scenario**. Editing a draft must not call portfolio/config/notification APIs. Reset restores stored values and triggers no write. Do not persist draft financial settings to a server, add active/disabled schema columns, or mutate live alert settings in this increment.

### 4.2 Evaluation boundary

Extract `ruleDistance` and its pure dependencies into a browser-safe shared module, tentatively `shared/portfolioRuleEvaluation.js`:

```ts
function evaluateExistingRules(
  holding: ExistingRuleHolding,
  quote: ExistingRuleQuote,
  history: ExistingRuleHistory,
  nowMs: number,
): ExistingRuleDistanceResult;
```

Use existing domain types where available; otherwise add narrow JSDoc/TypeScript declarations matching existing fields. Do not pass a generic secret-bearing API response into the kernel. Keep a re-export/compatibility wrapper in `decision-center.js` so current imports and tests continue working.

Requirements:

- No `process.env`, request client, filesystem, session access or network calls in the shared module.
- Inject `nowMs` throughout time-limit/stage helper calls. Retain an optional `Date.now()` default only at legacy boundaries.
- Return prospective stage state without persisting it; preserve the existing authorized handler's persistence path.
- Freeze inputs in tests to prove no mutation of holding, stage state, history or quote objects.
- Preserve existing stop, trailing, target, time-limit and stage activation thresholds exactly.
- Validate configuration presence before numeric conversion. `null`, `undefined` and blank strings are unconfigured; finite explicit zero is not missing. Invalid numeric strings, NaN and infinity are invalid inputs.
- Disabled is not clear. Unconfigured is not an evaluated pass. Bad pricing or reconciliation produces insufficient data rather than a reassuring zero-risk result.
- Allocation evaluation uses complete validated portfolio value. Do not substitute invested cost or normalize the valued subset to 100% when quote coverage is partial.

### 4.3 Reconciliation diagnostics

```ts
type ReconciliationIssue = {
  code: string;
  severity: 'warning' | 'blocking';
  symbol?: string;
  transactionRow?: number;
  message: string;
};

type ReconciliationDiagnostics = {
  status: PortfolioTradingPerformance['status'];
  issues: ReconciliationIssue[];
  quoteCoverage: 'complete' | 'partial' | 'unavailable';
  transactionCoverage: 'complete' | 'review' | 'unavailable';
  decisionEligible: boolean;
};
```

Derive diagnostics from the original accounting result plus validated input coverage. Do not recalculate realized P&L or invent cash-flow return figures in the presentation layer. Never present trade P&L as a time-weighted or money-weighted account return.

Unknown currency, ambiguous transaction ordering, unsupported corporate-action records, unpriced holdings, or derived inputs require explicit diagnostics. Do not invent a split/dividend ledger or silently treat an unsupported event as an ordinary trade. Any accounting-method, tolerance, fee-policy or corporate-action implementation change needs a separately documented financial contract and regression examples.

## 5. Provider and evidence contract

Reuse `ValidatedQuote`, `normalizeDecisionQuote`, `regularSessionMetadata`, `evaluateDecisionEligibility` and `compareProviderQuotes`. Do not install OpenBB to obtain a provider interface.

```ts
type ProviderFailure = {
  provider: string;
  code: 'not-configured' | 'rate-limited' | 'timeout' | 'transport'
    | 'no-data' | 'invalid-payload' | 'unsupported-currency';
  retryable: boolean;
};

type ProviderQuoteResult =
  | { ok: true; quote: ValidatedQuote; failures: ProviderFailure[] }
  | { ok: false; failures: ProviderFailure[] };
```

If these names differ from existing `classifyProviderError` codes, map at the boundary rather than renaming existing consumers' statuses. Failure messages must not contain credential values, token-bearing URLs, private response bodies or service-role data.

- Maintain existing primary/fallback ordering and display fallback behavior.
- An eligible fallback needs its own numeric validity, provenance and freshness; a cached stale fallback never inherits eligibility from its predecessor.
- Retrieval time is not market time. Provider date-only trading-day fields are not exact price timestamps.
- Closed-session eligibility requires a documented closing observation. The existing 96-hour ceiling accommodates ordinary weekends; it does not prove holiday-calendar completeness or the most recent session's identity.
- Compare independent prices only when symbol, currency, adjustment basis and observation times are comparable. Reject mismatched units/bases; do not average conflicts or claim consensus when no comparison was possible.
- Mixed raw/split-adjusted/total-return historical inputs cannot support calculations requiring total-return history. Reuse the existing adjusted-history gates for those calculations.
- Retain explicit simulation flags through normalization, adapters, fixtures and explanations. They cannot enable investment decisions or notification eligibility.
- Share the existing in-memory/component snapshot. Do not add parallel quote fetching, background subscription services or additional polling merely to increase source count.

## 6. UI requirements

### Command Center and risk summary

Show summary/coverage, urgent review items, data-quality problems and confirmed upcoming catalysts first. Add a compact `RiskSummary` with breached, near, insufficient, disabled and unconfigured counts. Counts must refer to evaluated rule instances, with a separate affected-holdings count; avoid counting one holding as several positions.

A rule row shows its name, configured threshold/unit, observed value, status text, source/time, and next review condition. Expand supporting evidence and assumptions on demand. Show the configuration's origin and whether it is a draft. No Buy, Sell, Send Alert or Enable Production button is added.

Retain portfolio tabs/query parameters, authenticated routes, the existing simple/detailed preference, review timezone and queue filters. Simple mode exposes essential explanations; detailed mode opens methodology/thresholds without creating another classification.

### Financial education

Retain all 20 existing definitions. Add **EV/EBITDA** and **EPS growth**, including common calculation limitations: negative/unstable denominators, inconsistent accounting adjustments, acquisitions, debt/cash composition, dilution and buybacks where relevant. Definitions must include a concrete example and a warning about when the metric is unsuitable. Compare metrics only for compatible periods/definitions.

Integrate contextual explanations beside risk and accounting metrics. Content remains bundled and React-escaped; no runtime model/API lookup or injected HTML. Modal keyboard focus remains contained, Escape closes it, focus returns to its trigger, and search/related-term navigation remain usable at 360px.

### Alerts and catalysts

Release 1 preserves the existing Telegram delivery path and all live schedules. Use fixtures/tests to expose the difference between attempted, accepted, rejected, uncertain and deduplicated deliveries; only Telegram acceptance with a message ID counts as accepted delivery. Existing natural-production-delivery evidence remains unverified unless separately obtained with authorization.

A new persisted alert inbox and richer delivery/digest policy belong to the subsequent alert release. Do not add a second delivery queue or call a production digest/alert endpoint from this UI work. A GET label is not proof that an endpoint is free of side effects.

Confirmed event dates require an explicit source and confirmation; estimates remain estimates. Preserve calendar-only dates without inventing a time. New calendar-provider access is deferred; reuse current snapshots only.

## 7. File-level tasks

| File | Task and completion condition |
|---|---|
| `src/App.tsx` | Preserve access/navigation; no new polling; keep development sync/notification guards and mobile toolbar bounds |
| `src/components/PortfolioIntelligence.tsx` | Compose existing analyses, quality, accounting and rule evaluations once; retain tabs/query state and display preferences |
| `src/components/portfolio/RiskSummary.tsx` (new) | Accessible rule coverage/review summary with explicit unknown/disabled states |
| `src/components/portfolio/PortfolioCommandCenter.tsx` | Add optional risk/diagnostics props without breaking current callers or loading/error/empty branches |
| `src/components/portfolio/PositionDecisionCard.tsx` and `DecisionEvidencePanel.tsx` | Add rule-specific reasons/citations and draft origin; preserve engine state semantics and unavailable values |
| `src/components/PortfolioManager.tsx` | Reuse existing controls; do not silently save local scenario overrides to stored holdings |
| `shared/portfolioRuleEvaluation.js` (new) | Extract browser-safe existing rule kernel/dependencies with explicit clock and immutable inputs |
| `server/api/decision-center.js` | Preserve authorization and response fields; compatibility export; narrowly fix missing-threshold coercion; keep staged persistence inside handler |
| `src/utils/portfolioRisk.ts` (new) | Typed configuration/evaluation adapter; no duplicate trading/accounting formulas |
| `src/utils/portfolioRisk.test.ts` (new) | Boundary, missing-input, disabled, allocation coverage and state-mapping scenarios |
| `src/utils/decisionRules.test.ts` | Retain all existing rule cases; fixed-clock and extraction-parity scenarios |
| `src/utils/portfolioAccounting.ts` | Preserve methods; only separately reviewed validation corrections supported by new regression tests |
| `src/utils/portfolioAccounting.test.ts` | Edge-case characterization: fees, fractional lots, order, oversells, missing values, currency and coverage |
| `src/utils/portfolioReconciliation.ts` (new, if needed) | Structured diagnostic adapter over existing accounting output; no second ledger |
| `api/_market-data.js`, `server/services/marketDataValidation.js`, `src/utils.ts` | Preserve provider metadata/failure categories end to end; do not add credential-bearing frontend output |
| `src/data/financialTerms.ts`, education components, `HelpGuide.tsx` | Two additional definitions, unsuitability notes, contextual links; retain search/dialog accessibility |
| `src/components/FreshnessBadge.tsx`, `src/utils/freshness.ts` | Preserve vocabulary and timestamp logic; reuse optional provenance expansion |
| `server/api/portfolio-digest.js` | Source inspection and mocked regression tests only in this increment; preserve live delivery behavior |
| `qa/test_release1.py` | Fixture-backed risk controls/diagnostics, mobile/keyboard, no-write and preference scenarios |
| Release review/checklist documents | Record the exact candidate, checks, known limitations and rollback scope |

Suggested new paths are proposals, not assertions that these files already exist. Minimize extraction churn and keep public exports compatible. Never import the HTTP decision-center handler directly into the frontend.

## 8. Deterministic unit-test matrix

New tests supplement the existing suite; previous green tests must remain green.

| ID | Case | Expected outcome |
|---|---|---|
| R-01 | Kernel extraction against existing stop/target/trailing/staged fixtures | Same thresholds, states, units and prospective stage state |
| R-02 | Fixed-clock time limit; day before/on/after boundary | Stable results; no wall-clock-dependent test |
| R-03 | Frozen holding/history/stage objects | No mutation or persistence |
| R-04 | Disabled versus absent rule | Distinct disabled/unconfigured states; neither counted as clear |
| R-05 | Null/undefined/blank allocation threshold | Unconfigured, never converted to zero |
| R-06 | Explicit zero threshold | Retained as explicit configuration, evaluated according to documented boundary semantics |
| R-07 | Negative/NaN/infinite/invalid threshold | Visible invalid/insufficient state, no evaluation pass |
| R-08 | Partial portfolio quote coverage | Allocation percentage and breach conclusion withheld |
| R-09 | Valid allocation above/below/equal maximum | Existing comparison boundary preserved; units shown |
| R-10 | Target reached and stop breached in different fixtures | Upside target remains distinct from downside breach |
| R-11 | Stale/simulated/conflicting quote | Rule assessment blocked; no event eligible for notification |
| R-12 | Local draft changed/reset | Only draft evaluation changes; stored object and API clients untouched |
| A-01 | Fractional buy/partial sell with fees | Existing weighted-average amounts and realized/open P&L reconcile |
| A-02 | Sell before first buy; oversell; missing transaction side | Mismatch/unavailable diagnostics; no invented cost basis |
| A-03 | Missing amount/quantity, nonfinite values, negative fees | Blocking input diagnostics; no zero substitution |
| A-04 | Same-day ordered rows and ambiguous order | Stable documented order or explicit review requirement |
| A-05 | Ledger versus holdings just inside/outside current tolerance | Existing tolerance behavior characterized; unchanged |
| A-06 | Empty ledger, closed portfolio, missing quote | Correct unavailable versus genuine zero distinctions |
| A-07 | Mixed/unknown currency | No combined USD portfolio return claim |
| A-08 | Derived inputs and unsupported corporate-action rows | Explicit review/blocking diagnostics, no fabricated adjustment |
| P-01 | Missing market time with recent retrieval | Never Live/decision-eligible solely from retrieval |
| P-02 | Provider closing observation, ordinary/early close, holiday uncertainty | Existing documented-session gates; unknown calendar remains unknown |
| P-03 | Primary failure, valid fallback, stale cached fallback | Failure categories retained; stale result never upgraded |
| P-04 | Incomparable source currency/time/basis; price conflict | No fabricated consensus or average |
| P-05 | Malformed independent data or mismatched symbol/price | Fail closed without crashing |
| G-01 | EV/EBITDA, EPS growth, existing/unknown term IDs | Correct definitions or safe fallback, no network |
| G-02 | Example/unsuitability/related links | Complete content and valid local references |

Do not claim a new accounting-method test passes simply because a diagnostic flags an issue. When characterization reveals behavior outside the documented financial contract, record the discrepancy and implement a focused, reviewed fix rather than teaching the test to accept a misleading result.

## 9. Integration, security and accessibility checks

Use fictional portfolios and isolated fixtures only:

- Render complete, partial, stale, simulated, conflicting, empty, loading and error snapshots.
- Verify every displayed condition identifies its rule/metric and supporting evidence or explicitly unresolved inputs.
- Change/reset local rule overrides; assert zero portfolio/config/digest/Telegram writes.
- Verify original position-state classifications are unchanged for valid baseline fixtures; invalid fixtures cannot expose an actionable state.
- Confirm native keyboard/touch operation, focus containment/restoration, no nested interactive controls and readable text without color-only status cues.
- Check document, summary, rule rows, filters and dialogs at 360px, tablet and desktop widths; button bounds must remain within the viewport.
- Preserve authentication: mocked anonymous protected requests return unauthorized; authenticated fixture requests retain the expected header path. Never log auth headers or response bodies containing private data.
- Stub notification transports to test authorization, cooldown/deduplication, uncertain outcomes and provider-acceptance conditions. Assert no real transport/network call occurs.
- Confirm Vercel Git deployment remains disabled, manual production dispatch still requires `YES` on `main`, and feature/PR events cannot execute live QA jobs.
- Confirm bundle output contains no service-role/provider credential values or server-only module imports introduced by the extraction.

Mocked security tests establish code behavior, not authenticated production correctness. Production evidence is a separately authorized gate.

## 10. Cloud-only development and validation workflow

1. Inspect environment, branch, instructions and pending changes. Preserve unrelated work. Current feature branch already exists; do not recreate/reset it or overwrite the original specification.
2. Work in small increments: pure extraction/parity tests; rule adapter and local drafts; reconciliation tests/diagnostics; UI/education integration; regression validation.
3. Use existing Node 22-compatible tooling and Python 3.12 in the Cloud environment. Keep production secrets out of processes, local files and artifacts. No REA installation.
4. Reuse the committed dependency lockfile. Review install scripts before executing dependencies; use the existing Cloud-owned cache. Add no library without a demonstrated need.
5. Serve the frontend-only Vite entry point, not the legacy Express runtime, for mocked UI testing:

```sh
VITE_QA_MODE=true npm exec vite -- --host 127.0.0.1 --port 3000
```

6. Run approved source/fixture checks:

```sh
npm run lint
npm run test:unit
npm run security:audit
npm run migration:verify
npm run build

QA_BASE_URL=http://127.0.0.1:3000 QA_UI_MOCKS=true \
  QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium \
  python -m pytest -q qa/test_release1.py qa/test_ui.py qa/test_ui_exploratory.py
```

Use the Cloud project virtual environment containing pytest/Playwright. `QA_CHROMIUM_EXECUTABLE` is the Cloud-installed-browser override, not a Windows path. Do not set `QA_ALLOW_LIVE` for development. Existing source-defined safety suites and new pure-function tests also run in PR CI.

7. Use disposable PostgreSQL only for an explicitly necessary integration test; no linked production Supabase dry run or schema push. Pure adapters/tests should not need a database.
8. Update the authorized draft PR only after local checks pass. Retain draft status, no auto-merge, and no deployment. Require CI on the exact pushed head. Keep preview deployments disabled unless separately approved.
9. Produce changed-file notes, test counts, source/coverage limitations, accessibility findings, fixture-only screenshots, dependency/license review and rollback notes.

Cloud development and GitHub CI may consume resources; this plan promises zero production deployments/calls/writes, not zero cloud cost. Do not infer current free-tier quotas or buy services from the historical analysis.

## 11. Acceptance and release gates

The completion increment is review-ready when:

- The baseline UI/quality/glossary behavior remains intact.
- Existing configured risk rules are visible through stable IDs, threshold units, enabled/configuration origin, evaluations, evidence and review conditions.
- Local scenario changes/reset work without persistence or notifications.
- Reconciliation coverage and uncertainty are explicit; existing accounting methods and financial thresholds remain preserved or separately reviewed.
- Provider metadata survives normalization and only validated inputs can enable new assessments.
- Glossary covers the existing 20 terms plus EV/EBITDA and EPS growth, with examples and unsuitability warnings.
- All new deterministic tests, existing regression suites, TypeScript, security audit, migration-manifest checks and production bundle build pass.
- The original scoring, ledger, authentication, scheduled delivery and production approval behavior is preserved, except for specifically documented validation corrections.
- Mobile/keyboard evidence and the exact final commit/check results are recorded.

A merge, authenticated production acceptance test, preview/production deployment, schema change or notification activation still requires its own authorization. Unknown real-provider quality and unverified natural Telegram delivery cannot be marked complete using synthetic fixtures or test messages.

Rollback for this increment is an application-code revert through the existing review/manual release flow. No database rollback should be required. Preserve unrelated work and do not reset shared branches.

## 12. Recommended next implementation batch

Start with **risk-kernel extraction plus parity tests, allocation-threshold presence validation, and accounting edge-case characterization**. These establish the financial contract before adding a configuration UI. Then build `RiskSummary` and local scenario controls against fixtures, followed by the two glossary additions and integration checks.

The opportunity scanner, persistent alert inbox, digest-policy changes and broader out-of-sample evaluation require their own scoped specification after this foundation is reviewed. No implementation is completed or authorized merely by checking a planning box here.
