# Product plan reconciliation — 21 November 2026

The five milestone releases describe increments of deployed code. The original Release 2 backlog also requires source acquisition, complete accounting evidence, operational acceptance and measured model usefulness. Those requirements remain open even where offline implementations pass.

## Compared sources

- Canonical product roadmap, `docs/ROADMAP.md`, dated October 15.
- Original Release 1 engineering and next-increment specifications, and Release 2 engineering plan, remaining-work register and five-deployment plan on the preserved development branch at `ac18fdb`. The corresponding shared Release 2 plans are also retained in source PR #168 at `d14f5fe`.
- Current main milestone handoffs, `MILESTONE3-CONTINUATION.md`, `MILESTONE4-CONTINUATION.md` and `MILESTONE5-CONTINUATION.md`.
- Open PRs #180, #181 and #184, current main `347240c7`, and Vercel deployment/alias records.

Older percentage estimates are historical. There is no defensible single completion percentage across implementation, authenticated live data and investment outcomes.

## Original commitments compared with current evidence

| Original track | Current implementation | Open deliverable and acceptance |
| --- | --- | --- |
| Release 1 glossary and decision cards | Contextual glossary, Command Center and gated decision adapters are implemented. | Eligible position classifications still require authentic source and accounting evidence. Glossary/UI deployment cannot establish those inputs. |
| Portfolio core and navigation | Main includes Command Center, holding dialog, Opportunities, Calendar, Inbox and company research. Mocked 17-route smoke passed. | UI restored to tested main build 347240c7 on November 21. Alias, homepage and identical staged/public JavaScript verified. Private authenticated journeys remain unverified. |
| Source truth and consumer contracts | Shared quote normalization, admission, issue reasons and provenance checks exist. | Real issuer/security mappings, vendor source/time evidence and authentic historical coverage need explicit validation. Missing metadata cannot be manufactured. |
| Resource coordination | Python provider attempt/token budgets exist and have offline coverage. | Multi-worker/account-level coordination and real provider quotas remain unverified. |
| Accounting and Python handoff | Strict original-row matching and conditional cost/P&L calculations exist. | Complete broker history, fees, corporate actions, currency and cash flows require authentic records. Empty or failed transaction retrieval cannot establish a zero balance. |
| Company dossier | Disconnected/manual dossier, declared SEC statement adapters and conflict presentation exist. | Production acquisition and verified issuer links remain incomplete. Confirm source/provider choice and securely configured access before connecting live acquisition. |
| Risk rules | Shared kernel, rule input validation, staged rules and quote gates exist. | Verify configured rules against authentic positions. Ten state rows do not prove ten successful evaluations. |
| Telegram and operational alerts | Existing sender, durable claims, inbox and scheduler health exist. | #180 contains reviewed useful-brief fixes and the #184 snapshot correction. Existing live sender behavior needs controlled release verification. |
| Forecast validation | Descriptive lifecycle, cohort/version checks, scoring denominators and provenance gates exist. | Historical source availability, adjusted outcomes, point-in-time universe and prospective holdout evidence remain open. Sample count alone cannot establish accuracy. |
| AI roles and free providers | Offline Bull/Bear/Judge, Source Quality and manual research flows exist. | Secure model configuration, endpoint/model availability and frozen-evidence usefulness comparison remain unverified. #181 remains a separate integration proposal. |
| Event Risk Radar and public X | Earlier stacked branch includes offline fixtures/specification. | Current main lacks the full requested source-acquisition integration. Public-account access, provenance and bounded manual monitoring must be implemented and tested before live polling. |
| REA mirroring | Prior source analyses informed UI behavior and reference comparisons. | REA is a feature-research tool. It cannot supply authentic financial rows or certify source correctness. Runtime parity with reference applications remains unverified. |
| Release acceptance | Main includes guarded production tooling and mocked/disposable CI. | User-approved UI restoration completed November 21. Cause of the earlier alias reversal remains unverified. Verify subsequent releases against the intended live commit. |

## Repairs in the active candidate

[PR #180](https://github.com/Blitzer0007/ai-infra-watch/pull/180) preserves the first Decision Center snapshot, exposes actual evaluated rule counts and useful quote observations, handles null percentages, isolates optional evidence failures and reports malformed earnings as a failure.

This continuation also isolates transaction-service failure in both Decision Center and digest. Successfully loaded holdings and admitted marks remain visible. Accounting receives explicit `transactions: unavailable`, preserving null cost/P&L and a records-unavailable explanation. It adds fictional handler/browser and digest regressions for this distinction. PR #184's behavior is incorporated without changing that separate PR.

## Remaining implementation order

1. Release the reviewed #180 repair and verify intended production alias, authenticated page data and the preview brief. Release is a separately approved production action.
2. Audit authentic quote metadata failures by symbol through the existing protected diagnostics. Choose bounded provider fixes based on observed errors and vendor contracts.
3. Reconcile authentic transaction coverage and establish supported currency/corporate-action records. Retain conditional labels until complete.
4. Connect manually requested issuer research and Event Risk Radar sources with provenance and explicit source-error behavior, before adding autonomous monitoring.
5. Evaluate configured JEV/NVIDIA models against frozen labelled evidence and deterministic baselines, then integrate useful roles.
6. Validate forecasts on authentic matched outcomes and prospective cohorts. Maintain the honest backlog alongside release records.

No live sender, polling, production database mutation or production deployment was performed during this reconciliation. Work remains in the existing reviewed repair branch, preserving the older development worktrees.


## Verification for this continuation

- 1,081 Node tests passed with fictional provider, database and sender transports.
- 11 focused Chromium accounting and outage cases passed, including null coverage, forecast failure, ledger failure and malformed earnings.
- TypeScript and the static QA build passed. The earlier production build passed on the preceding candidate, with a fresh build required for this commit.
- Require all applicable GitHub workflows on the resulting commit before calling this continuation CI verified.

Resume on the current head of PR #180. Read this reconciliation and CODEX-CONTINUATION.md, inspect GitHub checks, repair any failure, then work through the remaining implementation order using authentic source evidence where required. Preserve all other worktrees and draft PRs.


## UI-first release completed

On November 21 the owner requested UI deployment before remaining implementation. Vercel promoted the existing tested production build `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2` at `347240c7` for team `team_TfbzU4SMDZD8lIgCHKsJNa6v`, project `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`. The public alias resolves to that deployment, both static responses returned 200, and public/staged JavaScript matched exactly. The recent 30-minute error/fatal log count had no entries. These static checks do not certify private financial rows or provider availability. Service repairs remain on PR #180, with implementation commit `42717f7` already passing all applicable CI before this release-note update.
