# PR #189 manual release controls — 25 November 2026

**Prepared and default denied. No release approval, merge, workflow dispatch or deployment has occurred.** This supersedes the release-path implementation gap in the earlier [readiness review](PR189-RELEASE-READINESS.md). Main protection and production-environment reviewer/main restrictions are still unresolved; code preparation does not configure those controls or establish an exception.

## Scope and pins

The existing manual production workflow now has a separate PR189 confirmation, default `NO`, and an optional reviewed-source-head input (mandatory when that confirmation is `YES`). The old PR188 confirmation stays separate and must be `NO` for PR189. The PR188 automatic workflow/script are unchanged; regression tests show they reject PR189 even if main later becomes protected. PR189 has no automatic handoff.

The guard pins repository `Blitzer0007/ai-infra-watch`, PR189, branch `feature/nvidia-council-evaluation`, direct main parent `79fddf79a452c2a385b596fced604397781316eb`, and rollback `dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo`. Fresh read-only metadata reconfirmed that rollback as READY production in project `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`, with `githubCommitSha` matching that main baseline. Reverify before a future release; metadata is not financial/provider-health certification.

The final reviewed PR head is supplied as a full 40-character input and independently compared with the authenticated merged PR and second merge parent. It cannot be embedded as this file's own commit SHA without circularity. The owner's later review/approval must identify the actual final head; the input alone is not approval. Any change of source, parent or rollback invalidates that review and requires new preparation.

## Admission before Vercel secrets

For this PR189 path, `checkCandidate` requires:

- A manual `workflow_dispatch` from this repository's `main`, production confirmation `YES`, PR189 confirmation `YES`, old exception `NO`, and live checks exactly `false`.
- A full expected-main SHA equal to the workflow SHA and current main; a full reviewed-source SHA; pinned rollback; a valid workflow run ID and first attempt only.
- PR189 merged/closed into this repository's main, exact branch/repository/head, and its direct two-parent regular merge from the pinned baseline. Squash, rebase, a different parent or source do not qualify. These pins remain enforced even if protection is added later.
- All eight applicable exact-main workflows present and successful, including security, frontend, QA, Python agents, Vercel Python, AI quality, continuous quality and backend container. PR-only checks, missing workflows, failures, skips or newer pending runs cannot certify the main commit.
- Complete dispatch-run evidence identifying the current production workflow run only. Another release dispatch, missing current run, inconsistent counts, malformed identities or repeated evidence blocks release. A rerun is also denied; a failed attempt needs separate review and explicitly revised preparation, not a silent retry.

These are read-only GitHub evidence requests. The first candidate check runs before Vercel-token steps; checks repeat before staging and promotion. Rollback checks additionally bind its exact deployment ID and original commit, alongside existing team/project/production/READY checks. Staged deployment metadata still binds the new main commit.

The Vercel build step explicitly supplies empty QA/research-development frontend flags. Existing CI independently tests QA-off production access, council exclusion and no passive persistence with fictional intercepted APIs; the actual staged release still needs its own bundle/access checks. Existing stage `--prod --skip-domain`, HTML/JS/CSS byte comparison, anonymous API rejection and same-build promotion remain unchanged. No new cron, polling, AI inference, database operation or sender is introduced or enabled.

## Validation

- 52 targeted Node release/ancestry/handoff/dispatch tests passed with fake GitHub/Vercel evidence and no live dispatch.
- 34 offline workflow/safety tests passed, including default-denied inputs, separate historical handoff, pinned actions, scoped secrets, stage-before-promote and optional live-job boundaries.
- TypeScript and whitespace checks passed. Track/scan new files before commit. Fresh exact-head CI is required after push and recorded in the PR description and Cloud handoff; earlier `2105d9f` checks are historical after this increment.
- No unchanged local UI suite was repeated for guard/workflow changes. Automatic PR CI supplies full mocked UI, production bundle and disposable database evidence. Actual merge/staging/promotion checks remain unrun.

## Future owner decision and operator inputs

Review the final source and exact-head CI first. Standard branch/environment controls remain preferred. If the owner instead explicitly approves a PR189-only exception for unprotected main, that decision must cover the final reviewed head, regular merge, staged tests and promotion, while retaining rollback and all checks. Previous PR187/188 decisions do not apply. The [Vercel deployment skill](skill://plugin_connector_690a90ec05c881918afb6a55dc9bbaa1/deployments-cicd/SKILL.md) specifies a production environment with “required reviewers and a deployment branch restriction for main”; those settings were not verified and are not supplied by this code.

Only after that decision, a reviewed regular merge and successful checks on its actual main SHA, use the manual workflow on main with:

| Input | Value |
| --- | --- |
| confirm_production_deploy | YES |
| confirm_milestone5_unprotected_main_exception | NO |
| confirm_pr189_unprotected_main_exception | YES |
| reviewed_pr189_head_sha | Full source head named in the owner's approval; must equal merged PR head |
| expected_main_sha | Actual reviewed regular-merge SHA on current main |
| rollback_deployment | dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo |
| run_live_checks | false |

Do not dispatch while the PR is draft/unmerged or with placeholder SHAs. Do not reuse the old automatic handoff. Recheck target/rollback/domain behaviour before staging. Test the actual staged production build's private frontend gate, application API access and assets, then promote that same build and verify public assets/access. Record new production identity and retain the verified PR188 rollback. Real provider/source/accounting/model/forecast/Radar acceptance in the [remaining-work register](release2-remaining-work.md) is separate and is not established by a code release.
