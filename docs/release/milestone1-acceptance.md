# Milestone 1 — safety foundation acceptance

15 November 2026. This checklist separates implemented safeguards, candidate integration and hosted release acceptance. It replaces an informal completion percentage; **the milestone is not complete while required release controls are unverified or failing**.

## Implemented and offline verified

| Requirement | Evidence / behavior |
| --- | --- |
| Shared risk/configuration checks | Strict invalid/incomplete results, retained legacy thresholds, browser/server parity and no inferred stage persistence on reads |
| Conditional history contract | Versioned identity/currency/raw-close/retained-source declarations, matching declared calendar/bar coverage, availability/retrieval chronology and explicit corporate-action scope; a complete flag alone is insufficient |
| No fabricated history authority | Live adapters without the supported contract remain incomplete; declarations never authenticate publishers or grant trade authority |
| Shared accounting and valuation | Original fields, exact loaded quantities, fees/currency/order checks; no cost or history-price fallback; conditional P&L and signed/tiny/zero distinctions |
| Digest safety | Shared accounting/quote admission replaces independent average-cost calculations; compact text withholds unsupported financial claims and partial denominators |
| Financial-return notifications | Delivery/state mutation code is removed from unsupported portfolio/holding return evaluators. Caller booleans, claimed receipts or environment flags cannot enable them. They report authoritative receipt unavailable |
| Re-entry quote admission | Matching USD identity, numeric current price, nonfuture/fresh exact market time, regular-session bounds and simulation/stale rejection before indicator calculation; no history-close substitution |
| Smart Alert admission | Strict quote/session/quality checks, asynchronous authorization awaited, rejected samples cannot trigger/reset price state |
| Manual release pipeline | Exact candidate/main/CI checks, enforced protected-main requirement, pinned action commits and reviewed official stable CLI 58.4.4, fixed target/rollback checks, stage/check/promote same build and separately gated provider refresh |

Current feature-branch verification: 1,751 Node tests pass; TypeScript/source security pass; 35 focused browser/workflow cases pass. The existing large bundle warning remains. Exact saved-commit CI must be checked after each subsequent commit; previous-head results do not certify it.

Unsupported financial-return messages are intentionally unavailable. This is a safety change, not proof that a live accounting receipt or a replacement notification policy exists. Existing independent price alerts retain their source-admission requirements; no new delivery schedule, recipient or activation is introduced.

## Read-only hosted evidence

- GitHub `main`: `d59cb9191d2d33b4e698b7942f31bf5f7557da9c`. Branch metadata reports `protected:false`; repository rulesets collection is empty. Detailed protection administration returns HTTP 403, `Resource not accessible by integration`. Available GitHub tools cannot administer those controls.
- The attempted Cloud browser fallback is blocked by its URL security policy before settings can be observed. No workaround or settings change was attempted after that block. This is a browser access limitation, not a claim that GitHub itself is unavailable.
- Supabase identity: **AI Infra watch**, project `qjgnryjtrdwrbmlgdquk`, PostgreSQL 17, active. A read-only `information_schema.columns` query confirmed the existing holding/rule/risk columns, transaction IDs/execution/price/currency/derived columns, alert-state columns and re-entry watchlist columns. No portfolio rows, secret values, grants, schema or data were read/modified beyond that selected column metadata.
- Vercel team/project match the existing release target (`team_TfbzU4SMDZD8lIgCHKsJNa6v` / `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`). Production deployment metadata lists `dpl_A9SyRmrvss5zgio2i2hCWAcr4JP7` as READY for the current main SHA. This is a rollback **candidate**, not a newly tested rollback or proof of current alias mapping.
- Official Vercel release `vercel@58.4.4` and its package metadata declare Node >=18, compatible with the Node 22 runner. The workflow pins that exact version; no production deploy was dispatched and no local CLI install was needed for this review.

## Remaining acceptance gates

1. Prepare and verify an isolated main-based milestone candidate without merging the unfinished Release 1/2 draft stack. Backport needed safety dependencies and test compatibility with the production UI/source shapes; exclude unrelated research/navigation features.
2. Configure/verify enforced main protection and production-environment reviewers/branch restrictions, and verify Vercel automatic production assignment remains disabled. The workflow now fails before Vercel authentication when main is unprotected. A settings name in YAML is not evidence of protection.
3. Complete exact-candidate CI, protected-stage access, production access-gate/target/build acceptance and a retained known-good rollback procedure. Production secrets must remain inside configured CI; do not retrieve or display them.
4. Record the release decision and deployment evidence. No code rollback can reverse database changes or messages; neither is part of this milestone activation.

Authentic broker/full-history/corporate-action evidence, permitted source acquisition and future internal accounting receipts remain requirements for the affected financial features to become authoritative. They are not manufactured to pass this milestone's negative/safety gates.

No merge, deployment, production database write, live polling activation or Telegram send occurred. Milestone production releases remain **0/5**.
