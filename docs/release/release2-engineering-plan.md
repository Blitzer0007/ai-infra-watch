# AI Infra Watch — Release 2 engineering plan

Status: implementation in progress. R2.1 snapshot research and the first UI/UX pass are implemented in draft PR #168. The [calendar increment](release2-calendar-review.md) implements part of R2.2; the [read-only inbox and focused Portfolio workspaces](release2-inbox-portfolio-review.md) implement the first R2.3 reader slice. The [fictional notification-policy preview](release2-notification-policy-preview.md) adds the offline proposal slice of R2.3. Financial/provider work, authoritative live policy adapters and evaluation extensions remain pending. No new sending policy is activated.

The [controlled JEV increment and REA review](release2-jev-and-rea-review.md) add an on-demand Opportunities coverage review through the existing TypeSafe connector. Live development credit use awaits secure Cloud configuration; REA remains uninstalled.
Prepared: 8 November 2026, Asia/Kolkata.
Inspected code baseline: `4c008237453d8e31944cb5fba00cac9726f49501`.
Repository: `Blitzer0007/ai-infra-watch`.
Development: Codex Cloud, fixture-backed services and disposable databases only.

## 1. Release outcome

**Release 2: Opportunities, Catalysts, and Alert Transparency.**

Help a medium-term US-equity investor answer:

1. Which holdings or watchlist companies deserve further research?
2. What verified facts support or contradict the research case?
3. Which confirmed events could change the case over the next one to six months?
4. What portfolio exposure or existing risk rule would a proposed change affect?
5. Why was an alert generated, suppressed, accepted, rejected or left uncertain?
6. What evidence supports the quality of a signal family, and what remains unverified?

A complete release can present useful research while explicitly withholding investment classifications or historical performance claims that lack evidence. No promise of profitable predictions, automated stock selection, broker execution or guaranteed delivery is made.

## 2. Prerequisites and scope boundaries

### Release 1 contract

Complete or explicitly defer the remaining [Release 1 completion specification](release1-next-engineering-spec.md): risk-kernel extraction/parity, missing allocation threshold validation, accounting characterization/diagnostics and consolidated risk reviews. Reuse the existing glossary, Command Center, decision adapter, quote quality gates and local timezone preference.

Release 2 fixture work may proceed before a Release 1 merge, using a reviewed Release 1 commit as its base. Keep it in a separate branch/PR. If needed, use a stacked draft PR against the Release 1 branch, retargeting only after an approved merge. Do not mix new research features into PR #167 by default, or merge Release 1 solely to unblock development.

### Must ship

- Bounded opportunity research scanner over existing holdings and watchlist.
- Explainable candidate detail, sourced financial context and explicit data coverage.
- Confirmed-versus-estimated catalyst calendar with source/timezone integrity.
- Read-only alert inbox and scheduler/delivery transparency.
- Provider/evidence normalization shared across the new features.
- A research evaluation interface/protocol that distinguishes verified outcomes, pending outcomes and insufficient evidence.
- Offline tests, accessibility, exact-head CI, resource accounting and review/rollback documentation.

### Separate activation gate

Develop improved alert prioritization/digest proposals as preview-only policy output. Actually sending new alert classes, changing schedules, recipients, cooldowns, digest slots or production retention requires a separate explicit activation decision after tests and delivery semantics are reviewed. Existing live delivery behavior remains unchanged during development.

### Later or optional

Cross-device read/unread state, paid data vendors, larger universes, a full financial statement explorer, extended scenario planning, LLM-generated research synthesis and automated calendar ingestion are optional follow-ups. A scenario planner, if added, remains a local hypothetical exposure view with no order action and no accounting mutation.

Out of scope: broker integration, trade execution, trading bots, a full OpenBB/Ghostfolio deployment, Redis, a persistent autonomous agent, high-frequency scanning, REA installation, production-secret access and automatic production deployment.

## 3. Repository reuse and concrete findings

| Existing code | Reuse | Required integration attention |
|---|---|---|
| `PortfolioCommandCenter`, `decisionCardAdapter`, `decisionEligibility`, `portfolioReview` | Reviews, evidence, quality, dates, filters | Preserve original position-state semantics and accounting gate |
| `BuySellWatchlist.tsx` | Existing watchlist, holdings/rules, local alert history | It has an independent automatic `/api/alert-config` POST path; App-level development guards do not cover every component |
| `ReentryIntelligence.tsx` | Existing sold-position research | Do not replace its ownership and delivery rules with a generic scanner |
| `EarningsAlerts.tsx`, `UnifiedEventTimeline.tsx` | Event presentation | Clearly distinguish estimates, confirmed dates, and unsupported coverage windows |
| `api/_market-data.js`, market-data validation service | Provider routing, fallback, session metadata | Normalize fundamentals/events separately; do not infer timestamps or fetch parallel duplicate quotes |
| `SignalScorecardPanel`, `signal-scorecard.js` | Signal-family history/lifecycle | Audit adjusted-price and decision-time semantics before reusing outcomes as evidence |
| `ForecastValidationPanel`, forecast APIs | Existing verification and independent-sample gates | Existing auto-tracking is 5/20 sessions; verification enumerates 5/20/60/120/252; do not relabel these as exact calendar months |
| `api/job-health.js` | Authenticated scheduler and ledger status | Bounded, redacted DTOs; missing data is not a healthy empty ledger |
| `reentry-alerts.js`, earnings/digest handlers | Existing authorization, claims, provider acceptance and uncertainty | Inbox reads must never invoke send/scan/retry paths |
| `docs/ROADMAP.md` | Point-in-time and natural delivery evidence limitations | Open evidence gaps remain open until independently established |

Do not import server handlers into client bundles. Extract only pure shared logic; keep credential access and network clients server-side. Review all development write paths, not only the main App component.

## 4. User experience

Retain existing navigation/routes and introduce clear destinations or subviews:

- **Overview:** existing Command Center, with a compact count of research candidates and upcoming confirmed events.
- **Holdings:** existing accounting/transactions and position details.
- **Opportunities:** research scanner, watchlist filters and candidate detail.
- **Calendar:** list-first catalyst timeline with 30/90/180-day views and explicit source coverage.
- **Alerts:** inbox, explanation and delivery/scheduler status.
- **Learn:** existing static glossary with new terms referenced by the research screens.
- **Validation:** existing forecast/scorecard screens extended with protocol, cohort, coverage and pending-horizon reporting.

Avoid charts as the main entry point. Use summary → explanation → advanced evidence. Retain simple/detailed and timezone preferences. At 360px use a readable list/card presentation rather than a compressed desktop table. Search/filter state should survive navigation where useful without persisting private portfolio data in URLs.

## 5. Workstream A — Opportunity research scanner

### Universe and execution

Initial universe is the deduplicated existing holdings plus watchlist, respecting the current 50-watchlist-symbol limit. Report actual universe composition; it is not a whole-market scan or a historically representative universe. Do not imply survivorship-bias-free results from today's watchlist.

First implementation scans the validated snapshots already available to the application. Scanning is deterministic and performs no network request. Provider enrichment is a later bounded server operation that reuses cache, returns partial coverage explicitly, and cannot silently expand the universe.

### Candidate model and eligibility

```ts
type ResearchStatus =
  | 'research-candidate'
  | 'monitor'
  | 'needs-data'
  | 'excluded';

type ResearchCandidate = {
  symbol: string;
  companyName: string;
  status: ResearchStatus;
  horizonMonths: { min: 2; max: 12 };
  snapshotId: string;
  asOf: string | null;
  ruleVersion: string;
  supportingReasons: DecisionReason[];
  conflictingReasons: DecisionReason[];
  evidence: EvidenceReference[];
  missingInputs: string[];
  dataEligibility: 'eligible' | 'insufficient' | 'conflicting';
  signalEligibility: 'experimental' | 'validated' | 'retired';
  portfolioContext: 'holding' | 'watchlist-only';
  nextReviewCondition: string;
};
```

Research status is separate from the four existing holding decision states. An experimental research candidate is not an ADD REVIEW instruction. Never upgrade a holding's state through a separate scanner score.

Validate quote/evidence quality for all candidates. Require reconciled accounting only for claims about a holding's return, sizing, concentration or portfolio impact. Watchlist-only research should report accounting as not applicable rather than falsely claiming reconciliation or blocking all research because no position exists.

### Research dimensions

Show verified business growth, profitability/cash flow, valuation context, trend/relative strength, confirmed catalysts, downside conditions, portfolio overlap and evidence freshness where supported. Unsupported metrics remain unavailable. Preserve leveraged-product distinctions and exclusions; do not rank a leveraged ETF as if it were an operating company.

Start with transparent versioned rule families and descriptive comparisons. Before activating a family, define its metrics, fiscal periods, units, thresholds, missing-data behavior and required evidence in a reviewed rule contract. No arbitrary 0–100 confidence score or LLM vote.

Default sorting favors existing review priority, eligible input coverage and next review/event timing, with deterministic tie-breakers. Expose the sort rationale. Do not market a descriptive ranking as expected return or a calibrated probability.

### Detail page

Explain what changed, why it may matter over 2–12 months, supporting and adverse facts, unsuitable/missing metrics, source dates, benchmark comparisons, risk conditions, catalyst certainty and next review trigger. Link to the existing journal/forecast/research views. Saving a research note or adding to a watchlist uses an explicit existing user action; simply opening a candidate creates no server write or notification.

## 6. Workstream B — Financial context and catalyst calendar

### Financial context

Reuse existing SEC/company-fundamental and peer paths before introducing providers. Initial fields: reported revenue growth, operating margin, free cash flow and supported valuation metrics. Include fiscal period, reporting basis, currency, source publication/observation/retrieval times and restatement status where known.

Do not combine an old share count with a current enterprise value without disclosure, compare adjusted EPS against incompatible prices, use negative denominators to imply a cheap P/E/EV-EBITDA, or treat analyst estimates as reported results. If fiscal periods/definitions are incompatible, withhold the comparison. Missing debt, cash, shares or EBITDA means EV/EBITDA is unavailable.

### Event model

```ts
type CatalystEvent = {
  id: string;
  symbol: string;
  kind: 'earnings' | 'guidance' | 'filing' | 'investor-day' | 'other';
  title: string;
  date: string;
  timeZone: string | null;
  precision: 'date-only' | 'exact-time';
  confirmation: 'confirmed' | 'estimated' | 'cancelled';
  source: string;
  sourceUrl: string;
  publishedAt: string | null;
  retrievedAt: string;
  supersedesId?: string;
};
```

Provide 30/90/180-day views without claiming that the provider actually covers all those days. Show requested range separately from observed/source-confirmed coverage. Sparse coverage is not proof of no future events.

Deduplicate stable source/event IDs, retain corrections/cancellations, and keep estimated dates visibly distinct. Date-only events retain their source calendar day; exact events render in the selected review timezone. Do not invent midnight timestamps, earnings certainty or a positive expected market reaction.

The calendar first consumes existing feed snapshots. New external calendar access, credentials, costs and refresh intervals require a separate integration decision. No new scheduled ingestion during fixture development.

## 7. Workstream C — Explainable alert inbox

### Read-only aggregation

Unify existing local alert history, relevant server delivery records and job health through a read-only adapter. Do not create a second sender/outbox. A delivery record is associated with a logical event only through a real correlation/episode key, never a guess based on symbol/date.

```ts
type AlertInboxItem = {
  id: string;
  episodeId: string | null;
  origin: string;
  symbol: string | null;
  severity: 'info' | 'medium' | 'high' | 'critical';
  title: string;
  explanation: string;
  ruleId: string | null;
  evidenceIds: string[];
  observedAt: string | null;
  deliveryState: 'not-requested' | 'suppressed' | 'sending'
    | 'accepted' | 'rejected' | 'uncertain' | 'unknown';
  suppressionReason: string | null;
  providerMessageId: string | null;
  reconciliationRequired: boolean;
};
```

The DTO must omit chat IDs, destination credentials, service-role keys, auth headers and raw private provider bodies. Distinguish:

- Event detected versus delivery requested.
- Delivery attempted versus Telegram acceptance with a valid message ID.
- Telegram acceptance versus user reading a message.
- Rejected versus uncertain versus persistence failure after known acceptance.
- No events versus ledger/query unavailable.
- Local read/unread acknowledgement versus server delivery reconciliation.

Offer filtering, explanations and local-only read/unread state first. No resend, enable-scheduler or delivery-state-edit controls in the initial inbox. Read endpoints may only select redacted records; they must not call digest, scan, send, claim or retry handlers.

### Notification policy preview

Create a pure policy function over validated events and existing delivery state. Output the proposed disposition, changed condition, episode key, cooldown, deduplication decision and intended channel. It sends nothing.

Respect existing re-entry opt-ins, ownership state, market-session rules, recipient scope, durable episode claims and accepted-message reconciliation. New evidence may warrant a new episode only under a reviewed rule, not a new key on every poll. Lower-priority items can be proposed for digest batching; default schedules and recipients remain unchanged.

Do not automatically retry ambiguous/uncertain outcomes. Known accepted IDs suppress duplicate sends even when subsequent persistence failed. No exactly-once guarantee is claimed. Activation of a new policy is a separately approved release step after fixture/outbox tests.

## 8. Workstream D — Provider and evidence layer

Use small provider adapters rather than installing OpenBB. Keep the existing quote router and add narrow normalized financial/event contracts only where needed.

Each observation carries provider, symbol/entity, metric/type, value/unit, currency, fiscal/effective period, source URL, publication/market observation time, retrieval time, adjustment basis, fallback/simulation markers and quality status. Publication, observation and retrieval are separate concepts.

Normalize explicit failures: not configured, quota/rate limit, timeout, transport, no data, invalid payload, unsupported currency and conflict. Do not expose token-bearing URLs or credential values in errors.

Use one shared snapshot and bounded cache per required update window. Compare independent observations only when entities, time, currency, adjustment basis and metric definitions align. Never average away conflicts, count the same source twice or manufacture consensus when no comparable data exists.

Proposed starting budgets, to validate against provider contracts before activation:

| Resource | Initial design limit |
|---|---|
| Watchlist | Existing maximum 50; holdings reported separately |
| Scan computation | Once per explicit snapshot/request; no provider calls in the rule evaluator |
| Enrichment | At most 10 symbols per explicit bounded run; return partial results when budget ends |
| Provider concurrency | Start at one request per provider at a time until documented limits justify more |
| Inbox reads | Manual refresh, default 7-day window, maximum 30 days and 100 rows per page |
| Outcome evaluation | Due-only bounded batches, never rescan every historical record on each page load |
| Persistence | Normalized facts/references and minimal event metadata; avoid duplicated raw payload storage |
| AI calls | Zero required for scanning, quality gates, rule evaluation or routine notification policy |

These are design defaults, not changes to live settings, quotas or schedules. Measure actual call counts, latency, cache hit rates and storage growth with fixtures/test telemetry before choosing production budgets.

## 9. Workstream E — Medium-term evaluation and journal feedback

Retain existing 5D/20D forward tracking and 5/20/60/120/252-session verification semantics unchanged.

Proposed additional research horizons are 21/63/126 trading sessions, clearly labelled approximately 1/3/6 months. They are not calendar months and must not overwrite or relabel existing 20/60/120 results. Begin with offline evaluation artifacts; inventory database/API horizon constraints before proposing a backward-compatible persistence migration.

Freeze an evaluation protocol before outcomes are inspected:

- Versioned signal definition, universe/cohort and per-date input cutoffs.
- Explicit entry/exit timing and adjusted-price basis; no same-bar execution using information unavailable at that time.
- Matched benchmark dates, with SPY and QQQ as the canonical baseline unless separately changed.
- Fees/slippage assumptions, missing-bar policy, corporate actions, delistings and overlapping outcomes.
- Train/validation/held-out periods; no tuning against the final holdout and then reporting it as untouched.
- Independent/effective sample counts and uncertainty, not just raw overlapping prediction counts.

Require genuine adjusted histories and decision-time evidence for historical claims. Today's surviving watchlist is valid as a prospective cohort, not as a survivorship-bias-free historical universe. When publication timing, effective-dated membership or corporate-action coverage is unknown, report insufficient/exploratory status and explain why.

Show raw and independent sample counts, pending/due/verified/invalid outcomes, coverage, error/interval calibration and benchmark-relative descriptive results. Zero observations means unavailable, not zero error or a perfect hit rate. A count threshold alone does not establish alpha or justify a trade.

Reuse existing family lifecycle/sample gates and treat new families as experimental by default. Advancing a family to decision-driving eligibility requires a reviewed protocol and genuine evidence; do not change current thresholds implicitly in a UI release.

Journal feedback links an existing reviewed decision to its frozen evidence and protocol version. It records user rationale through explicit actions, not automatic order execution. Do not use hindsight-edited notes to rewrite original signal evidence.

A new prospective 6-month cohort cannot have a completed 6-month result at launch. Launch with pending outcomes or independently justified historical evidence; do not fabricate mature validation to meet a release date.

## 10. API and persistence design

Candidate contracts, names subject to routing review:

- `GET /api/opportunities`: validated existing snapshot plus bounded research results; no hidden write or send.
- `GET /api/catalysts`: confirmed/estimated events with requested-range and coverage metadata.
- `GET /api/alert-inbox`: authenticated, paginated, redacted ledger/history aggregation.
- `POST /api/research-preview`: explicit hypothetical input if needed, returns a deterministic preview without persistence or notification.

Do not assume each new route fits the current Vercel function grouping/bundle budget; inspect routing before adding files. Prefer existing route groups where contracts and authorization remain clear. No client import of server handlers or server-only configuration.

Start with fixture JSON and read-only adapters over existing records. A new `notification_inbox` table is not the default: first determine whether existing outbox/run/scorecard records suffice. Add persistent snapshots or protocol tables only when a concrete query/retention requirement justifies them.

Any necessary schema/index/constraint work is developed against disposable PostgreSQL and reviewed as a separate migration artifact. RLS/grants, retention, indexes, query budgets, existing row compatibility and rollback must be verified. Never modify old migration history or apply the candidate migration to production during development.

User/destination scoping and authorization must apply before returning records. No anonymous alert history, portfolio exposure or private evidence metadata. Local read/unread preferences must not be confused with authoritative delivery state.

## 11. Proposed file map

Existing code is reused; new names are proposals, not existing files.

```text
src/components/opportunities/
  OpportunityScanner.tsx
  OpportunityCard.tsx
  OpportunityEvidencePanel.tsx
  ResearchCoverageSummary.tsx
src/components/calendar/
  CatalystCalendar.tsx
  CatalystEventCard.tsx
src/components/alerts/
  AlertInbox.tsx
  AlertDetailPanel.tsx
  DeliveryStatusBadge.tsx
src/utils/
  opportunityResearch.ts / .test.ts
  researchEligibility.ts / .test.ts
  catalystCalendar.ts / .test.ts
  alertInboxAdapter.ts / .test.ts
  researchEvaluation.ts / .test.ts
server/services/
  researchSnapshot.js / .test.js
  providerNormalization.js / .test.js
  alertInbox.js / .test.js
  notificationPolicyPreview.js / .test.js
qa/
  test_release2.py
  fixtures/release2/
docs/release/
  release2-rule-contracts.md
  release2-evaluation-protocol.md
  release2-review.md
```

Integration targets: `App.tsx`, `BuySellWatchlist.tsx`, `ReentryIntelligence.tsx`, `EarningsAlerts.tsx`, `SignalScorecardPanel.tsx`, `ForecastValidationPanel.tsx`, `DataHealth.tsx`, `api/job-health.js`, `api/_market-data.js`, relevant existing route groups and the glossary. Delivery handlers remain unchanged until a separately approved policy activation.

Do not introduce `researchEligibility` as another quality engine. It composes the existing quote/evidence gates and explicitly expresses when portfolio accounting is required versus not applicable.

## 12. Delivery sequence and review points

| Milestone | Deliverable | Exit condition | Rough effort |
|---|---|---|---|
| R2.0 | Baseline/dependency and safety audit; contracts; fixtures | Release 1 interfaces stable; write/notification paths inventoried; no unresolved financial-contract assumption hidden in a rule | 2–3 engineering days |
| R2.1 | Snapshot/provider contracts and pure scanner | Deterministic candidates, bounded universe, simulation/quality failures visible; no extra provider polling | 4–6 days |
| R2.2 | Candidate details, financial context and catalyst calendar | Source/period integrity, confirmed/estimated coverage and 360px/keyboard behavior demonstrated | 4–6 days |
| R2.3 | Read-only alert inbox and policy preview | Correct correlation/status/uncertainty, authorization and zero-send tests | 4–6 days |
| R2.4 | Offline evaluation protocol/interface and journal links | Horizon compatibility, adjusted/PIT gates and pending outcomes preserved | 3–5 days |
| R2.5 | Integrated regression, resource/dependency review and release candidate | Exact-head checks green; known limitations/rollback documented; production action still gated | 2–3 days |

Initial estimate: **19–29 focused engineering days**, approximately four to six focused development weeks before external-data delays. This is a planning range, not a completion promise. Re-estimate after R2.0. Provider coverage/licensing, horizon persistence and genuinely matured forward outcomes can take longer; elapsed market time cannot be compressed by coding.

Use separate reviewable increments. Do not mark stages done from screenshots, a PR title or mocks alone. Release the fixture-backed/read-only capabilities without activating new sends if delivery or provider evidence remains unverified.

## 13. Test and acceptance matrix

| Area | Required cases | Acceptance |
|---|---|---|
| Scanner | Valid, missing, stale, simulated, conflicting and mixed-period inputs; duplicate symbols; empty universe; held versus watchlist-only | Deterministic research state, explicit missing data, no independent upgrade of holding classifications |
| Financial context | Negative EPS/EBITDA; missing debt/cash/shares; restated reports; incompatible periods/currencies/bases | Unsuitable/unavailable, not fabricated valuation |
| Sources | Fallback chain, timeout, quota, malformed response, incomplete metadata, duplicate provider, incomparable observations | Explicit categorized failure, bounded calls, no credential disclosure or fake consensus |
| Calendar | Confirmed/estimated/cancelled; corrected dates; duplicate IDs; source timezone; date-only; DST; range beyond source coverage | Correct day/time and certainty; no false empty/full coverage claim |
| Inbox | Empty versus unavailable; event without correlation; rejected; uncertain; accepted with ID; accepted then persistence failure | Accurate statuses, no invented correlation/read receipt, no send on read |
| Policy preview | Disabled opt-ins, cooldown, unchanged condition, new episode, ownership/session restriction, ambiguous prior outcome | Pure output; no delivery transport, duplicate retry or live setting change |
| Evaluation | Fixed cutoffs, future evidence, missing adjustment, delisting gaps, overlapping cohorts, holdout leakage, outcomes not due | Insufficient/pending where required; original horizons and benchmark semantics preserved |
| Privacy/auth | Anonymous access; wrong user/destination; cursor tampering; raw error body/token URL; client bundle imports | Denied/redacted; no private data or server-only credentials in response, artifact or bundle |
| Accessibility | Keyboard/touch, dialogs, readable status text, filters, 360px/tablet/desktop, local preferences | No clipped controls/overflow, focus restored, no color-only meaning |
| Regression | Accounting, risk, forecasts, existing routes/query state, quote gates, glossary, notification claims | Existing financial and release contracts unchanged |
| CI/safety | PR and feature push triggers; mock URLs; config sync; send/scan endpoints | No production calls, preview deploy, linked DB changes or Telegram messages |
| Resource limits | Cache reuse, per-provider concurrency, partial batch completion, pagination, cold payload | Measured bounded work; no hidden fan-out on component mounting |

Review third-party licenses and attribution before incorporating code. Prefer original implementation of concepts. No new dependency is justified merely because an upstream platform offers it.

## 14. Cloud workflow and production safeguards

- Run all code, browsers and disposable services in Codex Cloud.
- Preserve the current branch and uncommitted Release 1 planning document; no reset/overwrite.
- Develop Release 2 on a separate authorized feature branch after choosing its reviewed base. No direct commits to `main`.
- Use fictional fixtures and mock transports. Do not load production credentials, private portfolio exports, real Telegram destinations or authentication state into test artifacts.
- Run frontend-only Vite with the existing QA mode/network guards; audit component-specific config writes such as the watchlist's independent path.
- Run TypeScript, deterministic unit tests, mocked browser/workflow tests, source security audit, migration-manifest verification and production bundle build. Use disposable migration tests only when required.
- Add no scheduled job, live scan, archive ingestion, notification or production external API call during development.
- Keep Vercel Git deployment disabled and live QA/manual deployment controls intact. No preview deployment without separate approval.
- Record exact commit, CI results, data coverage and known limits. Merge approval is separate from deployment, schema application and notification activation approval.

Cloud and CI usage are not free by definition. No purchase, paid integration, vendor account, quota increase or infrastructure provisioning is authorized by this plan.

## 15. Release readiness and rollback

Release 2 is ready for review when all must-ship offline features work, the existing contracts remain intact, tests on the exact candidate head pass, and UI/data/resource evidence is documented. The review packet contains changed files, rule/protocol versions, test results, screenshots of fictional data, dependency/license review, unresolved external evidence and the explicit activation matrix.

Activation matrix:

| Action | Default development state | Required later decision |
|---|---|---|
| New scanner computation | Fixture-only/on existing validated snapshots | Approved application release and provider budget |
| Additional provider enrichment | Mocked/off | Approved provider access, cost, freshness and request limits |
| New inbox reads | Fixture-only | Approved authenticated route/query/RLS review and deployment |
| New alert classes or digest policy | Preview only, no send | Explicit delivery-policy and recipient/schedule activation approval |
| New horizon persistence/schema | Offline artifacts/disposable DB | Approved migration/compatibility/rollback and deployment |
| Production acceptance checks | Not run | Separately authorized secure session and bounded test scope |

Roll back UI/API increments through reviewed application-code reverts and the existing manual release mechanism. If an approved schema is additive, retain compatibility with the prior application; do not delete existing ledger/history or rewrite old migrations. Stop/disable only newly approved activation paths using their documented controls. Never replay uncertain notification episodes as a rollback step.

**First implementation batch:** inventory write paths and finalize Release 1 dependencies, then implement pure snapshot/provider contracts and a fixture-backed opportunity scanner. Add calendar and inbox views after those contracts are proven. Keep notification activation and production evidence separate throughout.
