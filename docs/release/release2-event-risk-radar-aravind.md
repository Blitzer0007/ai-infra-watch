# Release 2 proposal — Event Risk Radar with priority monitoring of @aravind

**Status:** Initial fictional-only contracts, manual UI and offline replay implemented on the feature branch. **Not deployed or approved for live activation.** See [implementation review, safety blockers and live prerequisites](release2-event-risk-radar-review.md). The proposal below remains the scope reference; authentic source acquisition and real-history evaluation are pending.
**Date:** 14 November 2026.
**Repository / working stack:** `Blitzer0007/ai-infra-watch`, draft PR #168 (`feature/release2-opportunity-research`) stacked on draft PR #167.
**User goal:** For held US stocks, especially **NVDA**, discover material controversies and breaking risk narratives early; pay **particular attention to public X posts by `@aravind`** (`https://x.com/aravind`) because the user considers some prior comments unusually timely. Evaluate this hypothesis carefully rather than treating its predictive track record as established.
**Execution preference:** Codex Cloud / GitHub CI only. No Windows/local execution, no Vercel deployments, no production Supabase access or writes, no real Telegram sends, and no unapproved scheduler/credential changes.

## Codex: resume here

1. Read this file and `docs/release/release2-remaining-work.md`, then check **current** PR #167/#168 heads and any newer work before touching files. `main` has separately advanced with PR #169 (glossary/help); avoid an unreviewed rebase/merge or duplicating existing code.
2. Keep existing **Financial Trust & Alert Safety** P0/P1 concerns ahead of new activation: stale/simulated quotes reaching price alerts, false zero P&L, invested cost mislabelled current value/weight, inconsistent valuation gates, and request-header-derived backend proxy origin. Re-audit their current state; don't assume previous findings have already been fixed.
3. First implement a **read-only, fixture-backed prototype** for a social/news controversy timeline. Begin with deterministic contracts and unit tests. Existing code may already cover parts of this; reuse it.
4. Do not open production URLs, request live credentials, enable X API, start scheduled polling, send Telegram messages, alter held-stock decisions, or move PRs out of draft without explicit authorization. Report exact files, test outcomes, risks and resource implications.
5. **No claim of “predicted NVDA correctly”** until independently checked, time-consistent retrospective evidence supports it. Separate detecting an early warning from predicting price direction or magnitude.

## Why this is needed; observed code baseline

- `api/live-data.js` collects broad AI/semiconductor headlines from GDELT or Google News RSS. Search terms primarily target AI, GPU, semiconductor, data centers, contracts and exports; this is **not complete governance/controversy coverage**.
- `server/api/company-scale.js` has `PROJECT_SOURCE_PROFILES`, optional direct X recent search using server-only `X_BEARER_TOKEN` or `X_API_BEARER_TOKEN`, and web/search fallbacks. Its existing X/project search is oriented to construction/contracts/deployments; NVDA's project profile has no official X handle. Do **not** mislabel `@aravind` as an official NVIDIA or issuer account.
- `aitracker-upload/mcp_servers/stocks/social_research.py` contains scoped public profile/source discovery patterns; reuse only relevant permissions-safe approaches.
- `src/components/opportunities/OpportunityScanner.tsx` is manual and operates on already-loaded snapshots. The Bull/Bear/Judge council is development-only and its outputs do not establish source authenticity or actionable price forecasts.
- `src/utils/alertEngine.ts` and `src/App.tsx` have independent quote/browser/Telegram alert paths. Any future controversy alert must have separate admission, delivery, and deduplication reviews; existing quote alerts must not inherit unverified rumour conclusions.

These are repository inspection observations, **not proof of existing live event coverage or prior early warnings**.

## Target feature

Create **Event Risk Radar** for the user's actual held symbols (NVDA first), with a visible **priority public-account watchlist**:

| Watch source | Priority | Scope | Trust/interpretation |
| --- | --- | --- | --- |
| `@aravind` on X (`https://x.com/aravind`) | **High discovery priority**; user-requested | Public posts referencing NVDA, Jensen Huang, NVIDIA governance, AI chips, export policy, geopolitical and closely related portfolio risks | **Unverified third-party commentary**, not primary company evidence, investment advice or a reliable forecasting signal by default |
| Official company investor relations/press releases and SEC EDGAR | High verification priority | Management, filings, material changes and risk disclosures | Authenticated issuer/regulator evidence when source and content are verified |
| Credible independent reporting | High corroboration priority | Material event reporting and independent confirmation | Secondary evidence, with attribution and publication times |
| Other public social accounts | Lower default discovery priority | Portfolio-linked leads | Unverified until separately corroborated |

The user wants proactive discovery **specifically from `@aravind`** rather than a generic sentiment feed. Prioritization means looking early and clearly labelling relevant posts; it must **not increase factual credibility** or claim causal predictive skill.

### Coverage and monitoring semantics

- Only public, permitted content about relevant public-company/business developments. No private messages, personal profiling, sensitive-person inference, bypassing access gates, login scraping, or prohibited bulk collection.
- Identify X content by canonical post ID and account ID where available; verify handle-to-account mapping when using authorized APIs. Handle changes, quote posts/reposts, deletion, partial search results, impersonation and API rate limits explicitly.
- Separate account/post `publishedAt`, collector `firstObservedAt`, last retrieval, original publisher's `reportedAt`, and first independent `confirmedAt`. Never backfill `firstObservedAt` to the purported publishing time.
- Search portfolio symbols and issuer names, with alias disambiguation. Candidate categories: CEO/board changes, investigations, litigation, governance/accounting allegations, export controls, sanctions, supply chain/customer exposure, geopolitical developments, funding problems and business concentration. Record rumor, denial, retraction and resolution events.
- If X search/authorization is unavailable, show `not-configured`, `rate-limited`, `partial` or `unavailable`; do not show “0 rumours” or imply active surveillance.
- Deduplicate syndicated news and same-post reposts. Retain distinct independent publishers rather than counting copied reporting as independent corroboration.
- Do not store full raw posts or personal account data unnecessarily; retain the smallest allowed source reference, quoted paraphrase, timestamps, fingerprint and evidence status, in compliance with API licensing and retention policies.

### Suggested deterministic contract (adapt to existing shared types)

```ts
type EventRiskSourceKind = 'x-public-post' | 'company-primary' | 'sec-primary' | 'secondary-news';
type EventRiskStage = 'discovery-unverified' | 'corroborated' | 'primary-confirmed' | 'disputed' | 'retracted';
type Coverage = 'available' | 'partial' | 'not-configured' | 'rate-limited' | 'unavailable';
type EventRiskCandidate = {
  id: string;
  symbols: string[];
  category: string;
  sourceKind: EventRiskSourceKind;
  sourceUrl: string;
  accountHandle?: string;  // e.g. aravind; NOT an issuer verification flag
  canonicalPostId?: string;
  summary: string;         // attribution-first, never assert allegations as facts
  publishedAt: string | null;
  firstObservedAt: string;
  confirmedAt: string | null;
  stage: EventRiskStage;
  supportingIds: string[];
  contradictingIds: string[];
  coverage: Coverage;
  impactDirection: 'unknown' | 'potential-upside' | 'potential-downside' | 'mixed';
  decisionEligible: false; // social discovery can never directly authorize trades
};
```

Keep **source importance**, **factual verification**, **portfolio materiality** and **historical forecasting performance** as separate dimensions. Do not collapse them into a single authoritative “rumour accuracy” number.

### UI acceptance

- Portfolio/holding view has an **Event Risk Radar** or “Emerging concerns” panel, initially *manual* and fixture-only.
- NVDA view explicitly includes a monitored-source label `X · @aravind · third-party/unverified`, a source-health indicator, dated chronological cards and any relevant verified company/news counterparts.
- Display “first posted” versus “first seen by tracker,” narrative category, supporting/contradicting evidence, and `unverified / corroborated / confirmed / disputed / retracted`. Differentiate confirmed **events** from unproven **allegations about causes**.
- When source data are missing or not authorized, surface coverage gaps rather than an “all clear.”
- Explain why an event matters to a medium-term holding (thesis, concentration, catalyst review) without generating BUY/SELL predictions.
- Preserve readable typography, keyboard/mobile access, and direct source links. No automatic notification in initial release.

### Monitoring and notification policy — requires separate approval

**Phase 1 (safe now):** A manual button using fictional post/news fixtures; no network calls, persistence, cron, writes or sends.

**Phase 2 (authorization needed):** Scoped read-only searches using licensed/provider-permitted X recent-search and existing search/news APIs. Limit symbols and query terms; cache results, set per-provider budgets, report quota/rate-limit errors. Do not assume any X API plan entitlement or access to historical posts.

**Phase 3 (separate delivery approval):** Optional scheduled monitoring only after cost, quota, security and reliability review. Single uncorroborated `@aravind` post should normally generate a low-confidence dashboard *watch item*, **not** a “sell now” Telegram message. A verified major company event or independently corroborated material risk can become an *investment thesis review* notification, with source links, deduplication, severity/uncertainty, cooldown and delivery receipts. Keep existing manual deployment and notification release gates.

Prefer manual checks or a small bounded cadence first; do not add always-on workers, new databases, broad ingestion pipelines or expensive LLM calls to Vercel Hobby/Supabase Free.

## Historical claim evaluation (must be lookahead-safe)

Use NVDA developments in November 2026 only as a **candidate retrospective case study**, not an already validated successful prediction. For any selected `@aravind` post:

1. Verify exact original post URL/ID and publisher, with actual timestamp and what could genuinely have been observed before the event. Mirrored or indexed timestamps alone are not sufficient evidence of historical first visibility.
2. Translate the **specific falsifiable claim** into a dated hypothesis; record unclear/ambiguous claims as `unscorable`. Broad worries or post-event interpretations do not become advance predictions.
3. Build a time-ordered source ledger: social post, first corroboration, company/regulatory confirmation or contradiction, market session/price changes, and all known data limitations.
4. Compare to baselines that **exclude `@aravind`**: official announcements, general news only, simple price/volatility change alerts. Measure incremental lead time, false positives, timeliness and missed events.
5. Evaluate across **all identifiable posts**, not only famous hits: false claims, unverifiable statements, missing/deleted posts and no-event cases are essential. Use independently retained pre-event captures if available. Do not infer accuracy from outcome-driven sample selection or retrospective reconstruction.
6. Adjust timestamps to US market sessions and use corporate-action-adjusted price series when appropriate. Report subsequent returns as *descriptive*; correlation with a post does not establish causation or reliable trading alpha.
7. Bull/Bear/Judge may summarize conditionally verified events with citations **after** admissible evidence exists. Council preference must not override verification, accounting or risk gates.

Provide an honest “insufficient historical evidence to measure predictive accuracy” verdict when appropriate.

## Work packages for Codex (in order)

**R2-RADAR-0 — Branch/safety baseline:** inspect current PR heads, read ongoing shared rule and alert safety work, identify existing functions/tests to reuse, and record which network/write paths exist. Do not rebase, merge or deploy.

**R2-RADAR-1 — Pure contracts and fixtures:** typed `EventRiskCandidate`/coverage, relevance and exact ticker/issuer mapping, source verification classes, post/news fingerprints, time-ordered event grouping, high-priority `@aravind` configuration. Use **fictional** data and repository-standard unit tests.

**R2-RADAR-2 — Read-only presentation:** extend the existing Portfolio/Opportunities presentation with accessible manual “Event Risk Radar” and source provenance/counter-evidence. No production API or schedule integration.

**R2-RADAR-3 — Reproducible offline replay:** fixture-backed lead-time and false-positive evaluation, with frozen capture timestamps and baseline comparisons. No future knowledge leakage. Include the ability to enter a user-supplied *public* original post URL later under an approved acquisition plan.

**R2-RADAR-4 — Provider integration proposal only:** review `company-scale.js`, `api/live-data.js` and `API_KEYS.md` for bounded X API/GDELT/web acquisition; specify expected usage, licensing, permissions, security and quote/risk gates. Do not activate without approval.

**R2-RADAR-5 — Optional alert/scheduler rollout:** separately scoped approval, privacy/budget/security audit, independent acceptance and a controlled release. Not part of first Codex resumption task.

### Regression test examples

- `@aravind` post mentions NVDA + governance event → **high-priority discovery lead**, still unverified.
- Another X account copying the same post → **no independent corroboration**.
- Source says NVDA but underlying article is about a different issuer → reject ticker attribution.
- Company official denial → show contradiction/disputed, never silently delete prior history.
- Primary filed event → promote the **event** to confirmed, not all rumoured explanations.
- Post timestamp after first official announcement → cannot score as pre-event warning.
- Missing original post ID, uncertain time, API unavailable, deleted post → explicit limits/unscorable.
- Incorrect or stale quote, unsupported session/adjustment basis → no usable price-impact number.
- Fixture replay with future article included → reject lookahead leakage.
- Closed-session post → align to next supported US market session, not an invented immediate close.
- Unit/browser tests show **zero** external X/API/provider calls, zero production Supabase writes, zero Telegram sends and zero deployments during Phase 1.
- Source profile for `@aravind` must not silently become an official issuer source or receive a higher fact-confidence score merely due to watch priority.

## Definition of done for initial offline handoff

A discoverable manual NVDA event-risk panel and source-watch configuration, pure deterministic risk/event contracts, fictional tests for discovery/corroboration/denial/retrospective timing, explicit source-coverage states, and an integration/usage proposal. All existing tests pass on the exact changed branch head. Record sources and limitations and leave both PRs draft.

**Do not merge, deploy, change Supabase, enable live X credentials, activate automated Telegram or declare the account a proven forecaster.**
