# PR #188 production repair candidate — 22 November 2026

The owner requested a production release alongside multi-model development. This document prepares the concrete release. The previous PR #187 exception is consumed; an explicit PR #188-only decision is still required before merging into currently unprotected main.

## Proposed release

- Repository: Blitzer0007/ai-infra-watch.
- Draft PR: https://github.com/Blitzer0007/ai-infra-watch/pull/188 .
- Source branch: feature/read-only-health-snapshot. The final exact head and all applicable CI results are in the PR description and Cloud release-evidence handoff.
- Required current main / direct first merge parent: 978ccefac76e36fa24e4b35cab2f1a08cbaca899.
- Team: team_TfbzU4SMDZD8lIgCHKsJNa6v. Project: prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD, ai-infra-watch.
- Verified READY current production / proposed rollback: dpl_BxDnHxX17q5mXVjLntaUtU4fazV6 at that main commit. The deployment alias endpoint confirmed ai-infra-watch-theta.vercel.app on this deployment.
- Public URL: https://ai-infra-watch-theta.vercel.app .

Scope: persistent dark/light UI across workspaces; grouped/accounting diagnostics; JEV Opportunities and private-session/access repairs; bounded history loading; removal of passive settings/forecast writes; local redacted diagnostic reports; explicit private SEC dossier/Opportunities financial reviews. The new model-role adapters are shipped disabled in production. No ledger repair, schema migration, new scheduler, model activation or Telegram send is part of this release.

## Prepared control path

The manual production workflow remains workflow_dispatch-only, production-environment bound, default-NO for release and waiver, and defaults live checks to false. No controls were made permissive for arbitrary commits.

The release guard adds the prepared PR #188 tuple: intended repository, exact branch, main base, regular two-parent merge directly after the pinned current main, and second parent equal to the actual merged PR head. The historical #187 tuple remains separate and unchanged. Wrong PR, branch, ancestry, failed/missing CI, unknown target or absent waiver remain failures.

The one-time handoff is pinned to #188 and the current rollback. Only successful exact-main push QA can proceed; it independently checks all applicable main CI and the PR/merge ancestry, and prevents duplicate dispatch. It has no Vercel secret or production-environment access. The guarded deployment then stages with --prod --skip-domain, verifies the intended target and rollback, private/anonymous access boundaries and exact HTML/JS/CSS bytes, rechecks the candidate, and promotes that same build. Production checks repeat exact asset/access checks. Live provider/database/model checks remain off.

Before any approved merge, reverify all current source CI, main/base, target/rollback and deployment/domain behavior. Project metadata confirmed intended account/id/name; automatic domain-assignment details were not exposed by the normalized project tool and must not be assumed. Deferred branch protection and required environment reviewer/main restriction controls need the owner's explicit one-release decision or actual configuration.

## Acceptance and limits

Local verification includes 1,152 Node tests, 105 Python role/council/admission cases, 33 offline deployment safety checks, relevant mocked browser/production-boundary checks, TypeScript, production build and security scan. The 23 November recovery isolated each council browser case's gateway so independent cases cannot exhaust one shared rate bucket; 11 browser cases passed with one production-only skip against the QA build. A direct regression preserves the actual 12-requests/minute limit. Previous 0e9981c passed six workflows but failed the shared-bucket browser cases; all applicable fresh exact-head CI is required on the correction. Previous 2b0adc8 checks do not cover this increment.

After an explicitly approved regular merge, require successful exact-main CI, staged access/assets and rollback checks before promotion. Capture the actual released main SHA, immutable deployment, public alias and observed limitations in the PR and Markdown evidence.

Green CI is not live financial acceptance. Broker history/precision/timezone, source availability/contact, verified security classification, retained filing context, adjusted history, authentic forecast outcomes and model usefulness remain open. No secrets or private financial rows were retrieved for release preparation. No merge, staging, deployment, model inference or production mutation occurred.
