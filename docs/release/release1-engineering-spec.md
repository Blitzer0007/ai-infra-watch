# AI Infra Watch — Release 1 Engineering Specification

**Status:** Proposed
**Target repository:** `Blitzer0007/ai-infra-watch`
**Branch:** `feature/release1-portfolio-command-center`
**Investment horizon:** Medium term, approximately 2–12 months
**Environment:** Isolated Codex Cloud workspace using mocked or fixture-backed services
**Production changes:** Strictly prohibited during development

---

## 1. Goals and non-goals

### Goals

1. Present the portfolio's most important changes and required reviews on a single dashboard.
2. Explain why each position receives an existing `ADD REVIEW`, `HOLD / WATCH`, `RISK REVIEW`, or `INSUFFICIENT DATA` assessment.
3. Make investing terminology understandable through contextual glossary explanations.
4. Prevent stale, incomplete, inconsistent, simulated, or unverified financial data from producing actionable signals.
5. Preserve existing accounting, access control, evidence, forecasting, and release-gating behavior.
6. Maintain a responsive interface usable on desktop, tablet, and mobile.
7. Keep all development and testing isolated from production Vercel and Supabase services.

### Non-goals

- Automated stock order execution.
- Guaranteed stock-price predictions.
- Replacing the existing portfolio accounting engine.
- Deploying the entire Ghostfolio or OpenBB platform.
- Adding a new production database or persistent background service.
- Changing live Telegram notification schedules or delivery rules.
- Updating production schema, credentials, or environment variables.

---

## 2. Current architecture and baseline

The repository currently contains:

- `src/App.tsx`: Application navigation, data loading, and integration.
- `src/components/PortfolioIntelligence.tsx`: Portfolio analysis and simple/detailed view modes.
- `src/components/DecisionImpactCenter.tsx`: Existing risk and decision overview.
- `src/components/HelpGuide.tsx`: Educational explanations.
- `src/components/FreshnessBadge.tsx`: Data freshness presentation.
- `src/utils/portfolioPositions.ts`: Position analysis and existing decision states.
- `src/utils/portfolioAccounting.ts`: Position and transaction reconciliation.
- `src/utils/freshness.ts`: Timestamp-sensitive freshness classification.
- `server/api/decision-center.js`: Portfolio rule evaluation and server-side data aggregation.
- `api/_market-data.js`: Market-data provider selection, fallback, and history.
- `src/utils/decisionRules.test.ts`: Existing decision-rule tests.
- `src/utils/freshness.test.ts`: Existing freshness tests.

Reuse these implementations wherever possible. Avoid creating a second independent position classification or portfolio accounting engine.

---

## 3. Portfolio Command Center

### 3.1 Functional requirements

The Command Center is a new portfolio-level overview.

Display:

- Portfolio valuation with explicit coverage status.
- Total number of tracked holdings.
- Number of positions requiring immediate review.
- Existing decision-state distribution.
- Upcoming confirmed catalysts.
- Data-quality warnings.
- Portfolio concentration information.
- Timestamp of the latest validated snapshot.
- A prioritized decision-review queue.

The primary content is a **review queue**, not a screen dominated by historical charts.

Every position card should include:

- Symbol and company name.
- Position state.
- Current validated market price or `Unavailable`.
- Position-level return, only when accounting and quote coverage permit it.
- Reason for the assessment.
- Supporting evidence or missing information.
- Relevant risk trigger.
- Suggested next *review*, not an automatic trade instruction.
- Data timestamp and source.
- Expandable explanation.

### 3.2 Component interface

```ts
export type PortfolioSummary = {
  holdingsCount: number;
  portfolioValueUsd: number | null;
  valueCoverage: "complete" | "partial" | "unavailable";
  asOf: string | null;
  reviewCounts: {
    addReview: number;
    holdWatch: number;
    riskReview: number;
    insufficientData: number;
  };
  topConcentrationPct: number | null;
};

export type CommandCenterProps = {
  summary: PortfolioSummary;
  positions: DecisionCardModel[];
  loading: boolean;
  error?: string | null;
  onSelectPosition: (symbol: string) => void;
  onOpenEvidence: (symbol: string) => void;
};
```

Amounts must not become zero simply because a provider did not return data.

### 3.3 Presentation

Implement three information levels:

**Level 1 — Immediately visible**

- Portfolio summary
- Critical review items
- Data-quality status
- Next significant catalysts

**Level 2 — Expandable**

- Position rationale
- Valuation context
- Risk conditions
- Supporting financial metrics

**Level 3 — Advanced**

- Full evidence and methodology
- Raw indicator values
- Rule thresholds
- Historical signal performance

Persist the existing simple/detailed view preference.

---

## 4. Explainable medium-term decision cards

### 4.1 Decision states

Preserve the existing internal states:

```ts
type DecisionState =
  | "ADD REVIEW"
  | "HOLD / WATCH"
  | "RISK REVIEW"
  | "INSUFFICIENT DATA";
```

Do not rename the underlying states in Release 1.

Provide user-friendly display labels:

| Internal state | Display label |
|---|---|
| ADD REVIEW | Potential opportunity — review |
| HOLD / WATCH | Continue monitoring |
| RISK REVIEW | Risk review needed |
| INSUFFICIENT DATA | Not enough reliable data |

These are research classifications, not personalized trade orders.

### 4.2 Decision model

```ts
export type EvidenceReference = {
  id: string;
  label: string;
  source: string;
  url?: string;
  publishedAt?: string | null;
  observedAt?: string | null;
};

export type DecisionReason = {
  code: string;
  title: string;
  explanation: string;
  direction: "supporting" | "risk" | "neutral";
  evidenceIds: string[];
};

export type DecisionCardModel = {
  symbol: string;
  companyName: string;
  state: DecisionState;
  horizonMonths: { min: 2; max: 12 };
  priceUsd: number | null;
  positionReturnPct: number | null;
  reasons: DecisionReason[];
  evidence: EvidenceReference[];
  missingInputs: string[];
  dataQuality: DataQualityResult;
  nextReviewAt: string | null;
  reviewTrigger: string | null;
  generatedAt: string;
};
```

### 4.3 Decision rules

The presentation layer must consume the existing decision engine. It must not independently invent or recalculate trading signals.

Every conclusion must identify its originating rule or metric.

Examples:

- Portfolio allocation threshold exceeded.
- Existing downside rule approached.
- Upcoming earnings event requiring review.
- Material deterioration in verified evidence.
- Existing add-review criteria satisfied.
- Incomplete data preventing assessment.

**Important:** If a required input fails its quality gate, the overall decision state becomes `INSUFFICIENT DATA`, even if a prior cached classification suggested adding or reducing a position.

Preserve historical results separately, clearly labelled with their original timestamps.

### 4.4 Interaction

Selecting a card opens a details panel with:

1. Why the stock is flagged.
2. Supporting and conflicting evidence.
3. Risk thresholds and assumptions.
4. Data sources and timestamps.
5. Next review condition.
6. Links to existing journal, forecast, and research screens.

Do not introduce a broker-connected Buy or Sell button.

---

## 5. Contextual financial glossary

### 5.1 Requirements

Provide reusable explanations in simple and advanced language.

Initial coverage:

- P/E ratio
- Forward P/E
- EPS
- Revenue growth
- Free cash flow
- Operating margin
- Debt-to-equity ratio
- RSI
- 50-day moving average
- 200-day moving average
- Relative strength
- Drawdown
- Volatility
- Support/resistance
- Valuation multiple
- Catalyst
- Portfolio concentration
- Cost basis
- Unrealized P&L
- Risk/reward ratio

### 5.2 Data model

```ts
export type FinancialTermDefinition = {
  id: string;
  label: string;
  shortDefinition: string;
  detailedExplanation: string;
  example: string;
  commonMisinterpretation: string;
  relevanceToMediumTermInvesting: string;
  relatedTermIds: string[];
};
```

### 5.3 Component interface

```ts
export type FinancialTermProps = {
  termId: string;
  children?: React.ReactNode;
  display?: "inline" | "icon" | "label";
  explanationLevel?: "simple" | "advanced";
};
```

Provide a reusable popover or dialog using semantic buttons and appropriate accessibility attributes.

On desktop, users can click or activate the explanation using a keyboard.

On mobile, tapping opens an accessible dialog or sheet.

The glossary must not require network requests; its initial definitions are bundled static content.

### 5.4 Example

**P/E ratio**

Short: Share price divided by annual earnings per share.

Example: A $100 stock with $5 earnings per share has a P/E of 20.

Why it matters: Helps evaluate price relative to earnings, but should be compared with growth, risk, and business quality.

Common misunderstanding: A lower P/E does not automatically mean a better investment.

---

## 6. Data-quality gates

### 6.1 Core principle

**Fail closed for investment decisions.**

A missing, stale, inconsistent, simulated, or insufficiently documented data point must not be silently substituted with a trusted-looking value.

The UI may still display historical data when properly labelled, but should not use it to generate new actionable assessments without meeting the specified quality requirements.

### 6.2 Data-quality model

```ts
export type DataQualityStatus =
  | "valid"
  | "delayed"
  | "last_close"
  | "stale"
  | "missing"
  | "conflicting"
  | "simulated"
  | "invalid";

export type ValidatedQuote = {
  symbol: string;
  price: number | null;
  currency: string | null;
  provider: string;
  marketTime: string | null;
  retrievedAt: string | null;
  isMarketSessionOpen: boolean | null;
  status: DataQualityStatus;
  fallbackUsed: boolean;
  adjustedBasis?: "raw" | "split_adjusted" | "total_return";
};

export type DataQualityResult = {
  eligibleForDecision: boolean;
  status: DataQualityStatus;
  checkedAt: string;
  reasons: string[];
  sourceCount: number;
  marketTime: string | null;
  retrievedAt: string | null;
  source?: string | null;
};
```

### 6.3 Validation gates

**Gate A — Numeric validity**

Reject:

- Missing price
- Zero or negative price
- NaN or infinite values
- Malformed numeric fields
- Unsupported currency

**Gate B — Provenance**

Require explicit provider and timestamp information.

Do not confuse retrieval time with market time.

**Gate C — Freshness**

Reuse `classifyFreshness()` as the starting point.

Evaluate market session and data type before determining whether a quote is sufficiently current.

A valid last-close price outside US trading hours must not automatically be treated as invalid simply because several hours have elapsed.

**Gate D — Cross-provider conflicts**

When comparable independent provider observations are available, compare their timestamp, currency, adjustment basis, and prices.

Use a configurable discrepancy threshold for review.

Do not average discrepant values to fabricate a consensus.

**Gate E — Corporate actions**

Ensure that adjusted historical prices are used for calculations requiring split- and dividend-adjusted history.

Do not silently mix unadjusted and adjusted series.

**Gate F — Portfolio reconciliation**

Check transaction quantities, holdings, currencies, cost basis, and accounting coverage.

A portfolio-level return must be unavailable when the required inputs cannot be reconciled.

**Gate G — Simulation protection**

Any mock or simulated quote must carry an explicit simulation marker and must never flow into production decision endpoints or notifications.

### 6.4 Decision eligibility

```ts
export function evaluateDecisionEligibility(
  quote: ValidatedQuote,
  requiredEvidenceComplete: boolean,
  accountingValid: boolean
): DataQualityResult;
```

This utility must be deterministic.

No LLM should be used to override an invalid or insufficient data-quality result.

---

## 7. File-level work plan

### Existing files to update

**`src/App.tsx`**

- Preserve current route and access behavior.
- Integrate the Command Center into the existing portfolio view.
- Avoid introducing additional production polling.
- Ensure development mode does not invoke the existing configuration-sync API against production.

**`src/components/PortfolioIntelligence.tsx`**

- Extract decision-related sections into smaller components.
- Preserve existing tabs and URL query-state behavior.
- Retain simple/detailed preferences.
- Integrate validated position summaries.

**`src/components/DecisionImpactCenter.tsx`**

- Adapt existing API results into the new decision-card model.
- Preserve authentication.
- Clearly distinguish missing data from zero.
- Avoid redundant API polling or separate duplicate aggregations.

**`src/components/HelpGuide.tsx`**

- Reuse existing educational material.
- Add links into the structured glossary.
- Preserve existing navigation.

**`src/components/FreshnessBadge.tsx`**

- Improve legibility and status explanations.
- Display provenance on expansion.
- Preserve the existing freshness vocabulary.

**`src/utils/freshness.ts`**

- Extend without weakening existing timestamp logic.
- Add session-aware decision eligibility separately.
- Keep current unit tests passing.

**`src/utils/portfolioPositions.ts`**

- Map existing `PositionAnalysis` states and rationales to the new card model.
- Avoid changing established scoring thresholds during the UI release.
- Preserve leveraged-product distinctions and risk disclosures.

**`src/utils/portfolioAccounting.ts`**

- Extend tests around incomplete and inconsistent input.
- Do not change accounting methods without separate approved specification.

**`server/api/decision-center.js`**

- Prefer an additive explanation structure.
- Preserve legacy response fields and existing endpoint authorization.
- Avoid additional database queries unless necessary.

**`api/_market-data.js`**

- Extend metadata normalization where needed.
- Preserve existing fallback behavior for display, while making fallback eligibility explicit for decisions.
- Avoid exposing provider credentials.

### New files

```text
src/components/portfolio/
  PortfolioCommandCenter.tsx
  PositionDecisionCard.tsx
  DecisionEvidencePanel.tsx
  PortfolioReviewQueue.tsx

src/components/education/
  FinancialTerm.tsx
  FinancialGlossary.tsx

src/data/
  financialTerms.ts

src/utils/
  decisionCardAdapter.ts
  decisionCardAdapter.test.ts
  decisionEligibility.ts
  decisionEligibility.test.ts

server/services/
  marketDataValidation.js
  marketDataValidation.test.js
```

Add component tests using the repository's existing testing approach. If UI testing requires new dependencies, review size and compatibility before adoption.

---

## 8. Unit and integration test matrix

### Data-quality tests

| ID | Scenario | Expected result |
|---|---|---|
| DQ-01 | Valid USD quote with authoritative market timestamp | Valid |
| DQ-02 | Missing price | Ineligible |
| DQ-03 | Negative, zero, NaN, or infinite price | Ineligible |
| DQ-04 | Retrieval timestamp exists but market timestamp missing | Not labelled Live |
| DQ-05 | Stale cached fallback | Historical display allowed; actionable decision blocked |
| DQ-06 | Valid previous close during closed US session | Correctly labelled Last close |
| DQ-07 | Conflicting provider prices | Conflicting; no automatic averaging |
| DQ-08 | Different provider currencies | Comparison rejected |
| DQ-09 | Mixed adjusted/unadjusted history | Return calculation blocked |
| DQ-10 | Simulated quote | Never decision-eligible |
| DQ-11 | Missing provenance | Insufficient data |
| DQ-12 | Future market timestamp outside tolerance | Invalid |

### Decision-card tests

| ID | Scenario | Expected result |
|---|---|---|
| DC-01 | Existing ADD REVIEW state with valid supporting inputs | Potential opportunity review |
| DC-02 | Existing HOLD / WATCH state | Continue monitoring |
| DC-03 | Existing RISK REVIEW state | Risk review needed |
| DC-04 | Required input missing | Insufficient data |
| DC-05 | Data-quality failure after prior eligible signal | New signal suppressed |
| DC-06 | Conflicting evidence | Explain supporting and adverse factors |
| DC-07 | No evidence linked to reason | Display unresolved evidence state |
| DC-08 | Upcoming confirmed catalyst | Correct date and review context |
| DC-09 | Partial portfolio quote coverage | No misleading total portfolio valuation |
| DC-10 | Leveraged ETF position | Existing leverage-specific rules preserved |

### Financial glossary tests

| ID | Scenario | Expected result |
|---|---|---|
| GL-01 | Known term | Correct definition loaded |
| GL-02 | Unknown term ID | Safe fallback; no crash |
| GL-03 | Keyboard activation | Explanation opens |
| GL-04 | Escape key | Explanation closes where appropriate |
| GL-05 | Mobile interaction | Popover/dialog usable |
| GL-06 | Simple/advanced mode | Correct content displayed |
| GL-07 | Static glossary load | No API request |

### Security and regression tests

- Protected portfolio API returns unauthorized response to unauthenticated callers.
- Service-role credentials are never included in frontend responses.
- Rendering glossary content cannot execute injected HTML.
- Existing decision journal interactions remain functional.
- Existing portfolio accounting tests pass unchanged.
- Existing freshness tests pass.
- No frontend development action contacts production Supabase.
- No test sends a Telegram message.
- No test triggers Vercel deployments.
- Existing GitHub production-deployment gating remains unchanged.

---

## 9. Cloud-only development workflow

The development environment must be an isolated Codex Cloud workspace.

Nothing should need to run on the user's Windows PC.

### Stage A — Environment readiness

1. Confirm the workspace runs in Codex Cloud, not a local desktop execution context.
2. Confirm GitHub repository identity and current branch.
3. Inspect pending workspace changes before any edits.
4. Ensure no production secrets are loaded into test commands.
5. Review existing network access and identify production endpoint dependencies.

If cloud environment creation fails, do not substitute local execution without explicit approval.

### Stage B — Read-only baseline

Run approved static inspection and existing tests against repository source and local fixtures.

Do not invoke live production jobs or network-dependent integration tests.

### Stage C — Feature development

Use the feature branch and implement changes in small, separately testable increments:

1. Financial glossary.
2. Data-quality eligibility model.
3. Decision-card adapter.
4. Command Center layout.
5. Integration and regression tests.

### Stage D — Validation

Run in Codex Cloud:

```bash
npm ci
npm run lint
npm run test:unit
npm run security:audit
npm run migration:verify
npm run build
```

Review the scripts and dependency installation behavior before executing. Avoid installing arbitrary post-install tooling or connecting production services.

Use mocked endpoints and fixture-backed tests for rendering and API behavior.

### Stage E — Review

Produce:

- Changed-file summary.
- Test results.
- Data-quality evidence.
- Accessibility findings.
- Remaining risks.
- Screenshots or cloud-generated UI previews where supported.
- Release notes.
- Explicit statement that no production changes occurred.

Keep production deployment disabled. Do not merge to `main` without approval.

---

## 10. Acceptance criteria

### Functional

- Existing holdings are visible in the redesigned Command Center.
- Every displayed decision uses the existing decision-state semantics.
- Each decision explains its reasons and evidence.
- Invalid or incomplete data cannot generate actionable classifications.
- Missing values are not converted into zero-valued investment metrics.
- The glossary explains at least 20 financial terms.
- Simple and detailed modes remain available.
- Existing portfolio screens remain accessible.

### UX and accessibility

- No horizontal overflow at 360px viewport width.
- Navigation works with keyboard and touch.
- Interactive controls have accessible names and visible focus.
- Supporting text is legible without relying on 9px labels.
- Color is never the only indication of risk or status.
- Loading, empty, stale, and error states are distinct.
- Financial terms are understandable without consulting external documentation.
- Source timestamps are understandable in the user's chosen timezone.

### Reliability

- Existing unit tests pass.
- All newly introduced deterministic utility tests pass.
- TypeScript checks pass.
- Production build succeeds.
- Existing authentication behavior is preserved.
- No new runtime dependency is required for core financial calculations.
- No production data or schema change is required for Release 1.

### Deployment safety

- No Vercel production deployment.
- No Vercel preview deployment unless separately approved.
- No production Supabase writes.
- No Telegram messages.
- No change to deployment approval policy.
- No direct commits to `main`.
- No secrets copied to logs, artifacts, or pull-request descriptions.

---

## 11. Definition of done

Release 1 is ready for review only when:

1. The four scoped features are implemented.
2. Financial calculations and existing decision semantics are preserved.
3. Data-quality failures correctly block investment decisions.
4. The UI is demonstrably usable on desktop and mobile.
5. All required tests pass.
6. The implementation has been reviewed for licensing, security, and regression risks.
7. A clear release candidate and rollback plan exist.
8. The user explicitly approves any subsequent production deployment.

Completing Release 1 development does not authorize production release.
