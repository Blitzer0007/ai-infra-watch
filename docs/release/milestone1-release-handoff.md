# Milestone 1 release handoff

Current status (15 November 2026): Milestone 1 is deployed under its explicitly approved control exception; [production evidence](milestone1-production-2026-11-15.md). The pre-release notes below are historical where they say the milestone is blocked/unshipped. Continue Milestone 2 from [CODEX-CONTINUATION.md](CODEX-CONTINUATION.md); broader source/accounting truth and future protection setup remain open.

## Candidate boundary

`release/milestone1-safety` starts at production main `d59cb9191d2d33b4e698b7942f31bf5f7557da9c`. It backports the shared accounting/quote/rule boundaries, alert and digest safeguards, production-UI compatibility and manual release guard from `feature/release2-opportunity-research` (source foundation `e53682c408ccd3346c554e6af4e76f37d9c93995`). The exact candidate head and CI links are recorded in [draft PR #170](https://github.com/Blitzer0007/ai-infra-watch/pull/170). Draft PRs #167/#168 remain separate; never merge that unfinished stack as a shortcut.

No migration, lockfile, new schedule, research agent, polling activation or Telegram recipient/policy is introduced. Existing Git deployment automation stays disabled in `vercel.json`. No release is dispatched by this branch or a PR.

## User-visible changes

- Unknown fees, currency, transaction order/quantity or missing original inputs withhold affected P&L. Unsupported quotes withhold values and full-portfolio denominators. Stored average cost cannot fill either gap.
- Valid loaded records permit explicitly conditional trade calculations. They do not prove full account history, corporate actions or trading authority.
- Financial-return evaluators have no delivery/state mutation path until a supported authoritative receipt exists. Digest and independent price-alert consumers retain their distinct admission requirements.
- Historical portfolio/peer returns and historical exit targets are withheld until their accounting/source coverage is supported. Standalone history charts remain descriptive. The production UI displays unavailable values safely and preserves tiny signed amounts.
- Incomplete/invalid rules show explanations. No Decision Center read persists inferred rule-stage state. Existing legacy numeric thresholds and frozen compatibility cases remain unchanged.

## Hosted controls requiring an administrator

Read-only evidence on 15 November: `main` is unprotected and the rulesets list is empty. Protection administration returns HTTP 403 to the GitHub integration. The Cloud browser fallback is blocked by its URL security policy. Production-environment metadata is not exposed by the available connector endpoint. These are unresolved controls, not completed checks.

1. At [GitHub branch settings](https://github.com/Blitzer0007/ai-infra-watch/settings/branches), protect `main` (or enforce an equivalent ruleset): require PRs and the successful Frontend CI, UI API DB Validation and Security audit checks, block force pushes/deletion and avoid an unrestricted bypass. Confirm the branch metadata reports protected and inspect the actual enforced rules; a rule name is insufficient.
2. At [GitHub environment settings](https://github.com/Blitzer0007/ai-infra-watch/settings/environments), configure/verify `production` required reviewers and restrict deployment branches to `main`. Configure existing CI secrets directly in GitHub; do not paste, export or show them to the agent.
3. Verify Vercel Git auto-deployment/production assignment remains disabled for project `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`, team `team_TfbzU4SMDZD8lIgCHKsJNa6v`.

The [Vercel deployments/CI skill](skill://plugin_connector_690a90ec05c881918afb6a55dc9bbaa1/deployments-cicd/SKILL.md) explicitly requires: “For an explicitly requested production pipeline, configure the `production` environment with required reviewers and a deployment branch restriction for `main`.” The requirement for protection before Vercel credentials is additionally enforced by `scripts/release-candidate.mjs`; unprotected main cannot pass that check.

## Final acceptance after controls are verified

- Review the isolated candidate and its exact-head checks. Resolve all failed or incomplete checks. Keep the PR draft until the hosted-control and release decision gates are met.
- Merge only the accepted candidate through protected main and obtain successful CI for that exact resulting main commit. PR-head CI does not certify a merge commit. Do not dispatch from the feature branch.
- Retain the current known-good production deployment `dpl_A9SyRmrvss5zgio2i2hCWAcr4JP7` for main `d59cb9191d2d33b4e698b7942f31bf5f7557da9c`. Read-only metadata confirms `ai-infra-watch-theta.vercel.app` and the project production alias point there. Recheck target/state/health immediately before release; alias mapping alone is not a rollback rehearsal.
- Review the exact full main SHA and rollback ID, then use the existing manual production workflow with `confirm_production_deploy=YES` and `run_live_checks=false`. Secrets stay inside protected CI. It stages one production build without domains, checks its bytes and anonymous access gates, rechecks SHA/CI, and promotes that same build.
- If deployment protection blocks the anonymous checks, stop and use an approved scoped testing method. Do not weaken protection or copy bypass credentials into commands, logs or PRs.
- Retain production build/deployment ID, exact SHA, test results, verified aliases and post-deploy access evidence. Rehearse rollback through the reviewed manual procedure when separately allowed; code rollback does not reverse database changes or messages.

Until those gates pass, milestone implementation and offline tests can be complete while milestone production acceptance is **blocked**. Production releases under the five-release plan remain **0/5**.
