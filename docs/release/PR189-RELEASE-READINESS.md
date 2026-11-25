# PR #189 release-readiness review — 25 November 2026

**Result: application candidate verified; production release blocked pending release controls and authorization.** This document is preparation only. No merge, workflow dispatch, staging, promotion, configuration change or rollback was performed.

**Subsequent preparation:** [manual PR189 controls](PR189-MANUAL-RELEASE-CONTROLS.md) now implement a separate default-denied manual path with explicit reviewed-source input, pinned ancestry/rollback, eight-workflow CI admission and duplicate/rerun rejection. The findings below describe the original `2105d9f` review baseline; implementation gap #4 is addressed by that preparation, not activated. The old PR188 path/handoff are deliberately preserved. Owner decision, unresolved protection settings and future exact-main/staged verification remain outstanding. Final source/CI evidence is recorded separately in the PR and Cloud handoff.

## Candidate and observed baseline

| Item | Verified value |
| --- | --- |
| Repository / PR | Blitzer0007/ai-infra-watch · draft https://github.com/Blitzer0007/ai-infra-watch/pull/189 |
| Branch | feature/nvidia-council-evaluation |
| Application revision reviewed | `2fd456db1182f08e0b7162be93d631856821ce02` |
| Current main / required baseline to recheck | `79fddf79a452c2a385b596fced604397781316eb` (PR #188) |
| GitHub state | PR open, draft, unmerged, mergeable; main `protected:false` |
| Vercel team | `team_TfbzU4SMDZD8lIgCHKsJNa6v` (scoped metadata lookup) |
| Vercel project | `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD` · ai-infra-watch |
| Current production / proposed rollback | `dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo`, target production, READY |
| Production immutable URL | https://ai-infra-watch-chfnzrgj8-green-2888.vercel.app |
| Public hostname lookup | ai-infra-watch-theta.vercel.app resolved to that deployment |
| Deployment commit metadata | `githubCommitSha` equals current main above |

The documentation checkpoint may advance the PR head without changing application code. Use the final PR head and its own CI evidence for any later approval; `2fd456d` is the reviewed application revision, not permission to deploy a different head. Final head/workflow links are in the PR description and Cloud continuation file. Recheck identities before any release action.

## What would ship

- A direct holding closing-price chart on Performance while accounting remains unresolved; retained provider/currency/stale/load metadata and rejection of malformed chart observations.
- Historical fallback that rejects wholly unusable primary data, retains partial-display quality counters, and keeps raw display separate from adjusted-use acceptance. Data Health explains omissions and redacted copied diagnostics retain numeric counters.
- Shared identical pending internal quote/history reads within one warm process; existing cache/refresh/failure/stale behavior preserved. This is not distributed quota protection.
- Bounded development-only Company/Catalyst/Daily research UI/runner and authored fictional evaluation tools. They remain disabled in production. Default probes/CI reports are offline, not model availability or financial-usefulness certification.
- Related offline tests and CI artifact generation. No schema migration, new provider credential, new cron, sender activation, broker repair, account reconciliation or automated trading is included.

The comparison against main contains 60 changed files before this documentation checkpoint. Existing CI verified the combined branch; this is a broader release than the market-data fixes alone. A smaller production scope requires a separate isolated candidate and its own checks, while preserving this PR.

## Existing verification

All eight applicable workflows passed for the exact reviewed application revision:

| Workflow | Run |
| --- | --- |
| Security audit | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699882 |
| Continuous Quality Eval | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699754 |
| Vercel Python CI | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699961 |
| AI Quality Gate | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699992 |
| Backend Container CI | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699841 |
| Frontend CI | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699845 |
| Python Agents Tests | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699892 |
| UI API DB Validation | https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45625699864 |

Evidence includes 1,183 local Node tests, TypeScript, 14 targeted sharing/normalization cases, full mocked UI, local production-bundle access/no-passive-write boundaries, disposable PostgreSQL checks and offline research artifacts. Live API/JEV/production database jobs were skipped intentionally. No unchanged local suite was rerun for this readiness review; any automatic CI on the documentation head is recorded separately.

## Release blockers and required preparation

1. **Current unprotected-main exception path does not cover PR #189.** `scripts/release-candidate.mjs` explicitly recognizes the prior PR #188 branch/first-parent tuple. `.github/workflows/vercel-production-deploy.yml` still supplies `AIW_RELEASE_PR: "188"`. Current main is unprotected; an attempted PR189 release using that old exception must fail. Do not broaden or bypass it.
2. **The one-time handoff is pinned to consumed PR #188.** `scripts/dispatch-milestone5-release.mjs` still requires PR188, first parent `978ccefac76e36fa24e4b35cab2f1a08cbaca899` and rollback `dpl_BxDnHxX17q5mXVjLntaUtU4fazV6`; `.github/workflows/milestone5-one-time-release-handoff.yml` calls it. It must not be reused for this candidate. A future handoff update requires its own review and tests; no such update is made here.
3. **Protection controls:** main is confirmed unprotected. Production-environment required reviewers and main-only branch restrictions could not be verified: the GitHub connector rejected the endpoint and a read-only CLI request was forbidden. Unknown settings are not certified controls. Configure/verify the standard protected release path, or prepare a tightly pinned PR189-only exception for a new explicit owner decision. Prior #187/#188 approvals are consumed.
4. **Any exception-path implementation must be concrete before approval:** pin PR189, this branch, the then-current reviewed source head, direct main baseline, actual regular merge ancestry and verified current rollback. Update guard/dispatch labels and tests consistently, retain default NO/live checks false and duplicate-dispatch protection, then verify exact-head CI. This preparation is still pending; do not ask an operator to run the old workflow with substituted values.
5. **Fresh post-merge checks remain required.** PR CI does not substitute for exact-main CI. The eventual dispatch SHA, expected SHA and current main must match; recheck the candidate before staging and again before promotion.

The Vercel deployment skill requires a production environment with “required reviewers and a deployment branch restriction for main” for its production-pipeline example: [deployment guidance](skill://plugin_connector_690a90ec05c881918afb6a55dc9bbaa1/deployments-cicd/SKILL.md). The user's earlier release-specific exceptions do not supply a new PR189 approval. This review does not request or grant a new exception.

## Future staged verification sequence

Only after the release path and owner decision are resolved:

1. Recheck final source/head CI, main baseline, project/team, current public deployment/rollback and domain-assignment behaviour. Repository Git auto-deploy is disabled in `vercel.json`; do not infer the separate Vercel automatic-domain-assignment setting from that flag.
2. Merge only the reviewed candidate using the ancestry required by the chosen guard, then require successful exact-main checks. Do not reuse an old SHA or PR result.
3. Use the existing guarded production staging pattern `--prod --skip-domain`; keep live checks false. Production build must use QA mode off and must omit the development council/role UI. Do not enable development/model flags or copy development credentials into production. Verify the actual release bundle's private access gate, not just API responses.
4. Verify staged deployment identity/commit and compare exact HTML/JS/CSS bytes. Check anonymous access is rejected and test authenticated flows through the approved fixture without exporting auth state, secrets, traces or private rows. Keep model inference, data writes, source polling and Telegram sends outside this release.
5. Promote that same tested production build, then repeat public asset/access checks. Record immutable deployment, source/main SHA, workflow runs, observed limitations and rollback.

## Rollback plan

Reverify `dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo` is still the intended READY production rollback at PR188 before staging. If staged checks fail, leave it serving production and do not promote. If post-promotion access/assets/chart regressions occur, use the approved rollback procedure to return traffic to this exact deployment, then confirm the public alias and access/assets again. No schema reversal is needed for this code-only candidate; do not change ledger rows or run migrations to roll it back. Record that Vercel rollback can disable automatic domain assignment and recheck the setting before any later release.

## Acceptance still outside this release

Real provider availability/entitlements and authentic issuer/session/adjusted-history evidence; original broker precision/timezone, full transactions/cash flows/corporate actions and reconciliation; dedicated NVIDIA development setup and real model trials; independent financial grounding/holdouts; portfolio-wide Daily Review; and Event Risk Radar live acquisition/delivery acceptance. Green CI is code-release evidence, not verified financial data or investment usefulness. The [remaining-work register](release2-remaining-work.md) stays authoritative; no overall completion percentage is established.
