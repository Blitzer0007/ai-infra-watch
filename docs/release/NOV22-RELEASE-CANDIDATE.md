# November 22 authorized combined release

The owner replied “as of now ignore this” to the unprotected-main release exception question. This is treated as the fresh **PR #187-only** exception described there. Exact-commit CI, staging, application access checks, asset-byte checks and rollback remain required. No other bypass or agent activation is authorized.

## Concrete candidate

The owner asked to proceed with the tested UI and quote/data-health repairs. [PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187) now targets `main`, so one review contains the complete #186 light UI by ancestry plus #187's Data Health and public-quote fixes. The prior main-target source baseline is `064b1827139c11a42f20e4f77b9869701f723642`; this release documentation adds a new head that requires its own main-target CI. #185/#186 branches and all worktrees are preserved. The new approval above is specific to this release; historical approvals are not reused.

Base/main: `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. Team: `team_TfbzU4SMDZD8lIgCHKsJNa6v`. Project: `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`. Intended public alias: `ai-infra-watch-theta.vercel.app`.

The currently live, READY deployment `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v` is the proposed rollback for this new release. Its commit is `529e9562`. Recheck live identity before dispatch; do not substitute #180's older rollback automatically.

## Reviewed scope and acceptance

- Shared light workspace/navigation across 17 routes; calmer Overview and Portfolio, mobile fixes, accessible source/readiness disclosures, search and holding-dialog theme.
- Deterministic Data Health channel classification, consistent summary totals and bounded recovery guidance; quote admission diagnostics remain the existing bounded sample.
- Public quote HTTP metadata/normalization aligned with the internal Yahoo adapter, strict identity and null values, one bounded Yahoo request, preserved cache timestamps and redacted error classes.
- No diff from main in `shared/`, `api/`, `aitracker-upload/`, `vercel.json` or dependency manifests. Release scripts now additionally pin PR #187, its branch and its direct parent `529e9562`; the handoff pins the current rollback and requires an exact PR identity. No financial admission rule, AI agent implementation, sender implementation or polling setting changes. Release CI retains all existing gates and adds staged/public JavaScript and CSS byte comparisons; its tests cover those checks.
- Local application verification passed 1,115 Node tests and 28 latest focused browser cases. The new release guard/handoff additionally passes the expanded 1,118 Node suite and 33 offline safety/deployment checks, plus TypeScript. Production application build, security scan and whitespace validation passed before the final push. Fresh exact-head CI remains required. Earlier UI acceptance covered every route at 390/1440px; additional Data Health checks covered 360/768/1440px and zero writes. Require fresh Frontend CI, Security audit and UI API DB Validation on this main-target PR head; the feature-base two-workflow proof is historical.
- The labeled production Telegram connection test is already confirmed received by the owner's screenshot at 08:55. Do not resend or replay a scheduled digest slot. Live per-symbol provider availability and full accounting remain unverified; this release cannot claim complete financial correctness.

## Initial release-control blocker and scoped resolution

GitHub's branch response reports `main.protected=false`. Connected tools expose no branch-protection write operation, and the CLI protection read was forbidden. The repository's `scripts/release-candidate.mjs` rejects unprotected main except exact pinned owner-approved merges. The existing #180 exception is pinned to its own PR, branch and parent; it cannot release #187. The automatic handoff is also pinned to #180 and its older rollback. The newly approved resolution adds only PR #187 with its own pinned ancestry and rollback, retains all historical guard tests and rejects mismatched PR response identities.

The Vercel deployment skill requires reviewed protected-branch code or a required environment reviewer approving the exact commit for secret-bearing workflows, and production environment reviewers/main restrictions for the configured CI path. The earlier #180 one-release exception does not establish those controls or authorize a new bypass.

The owner exception at the top resolves this release-specific prerequisite. The implementation uses the existing default-denied dispatch input and independently attested PR #187 only; it does not change branch settings, environment permissions or required main CI. Do not mark a failed gate as passed or reuse this waiver for a different PR.

## Authorized release steps

1. Confirm exact PR head, base, full diff and all three PR CI families; make a regular merge with an expected-head check only once the release path is authorized and usable.
2. Verify all required workflows on the resulting exact main merge, and that current main still equals it.
3. Verify the live rollback/project/team and stage a production build without domain assignment through the guarded process. Keep secret values out of commands, output, traces and artifacts. Preserve auth gates and slot idempotency.
4. Check the staged homepage, static bytes, application access gates and reviewed source identity. Run bounded provider/private-data verification only through an authorized authenticated path; the existing `run_live_checks` option also authorizes SEC/provider refresh, so do not enable it merely to get a green status while production database changes remain outside scope.
5. Recheck candidate/main and promote the same tested production build, verify alias/SHA/HTML/JavaScript/CSS bytes, and inspect bounded error counts. Retain the verified rollback.
6. Freeze the feature-branch head after the regular merge because attestation compares that PR head to the second merge parent. Save post-release evidence outside this frozen branch and in the PR description. Clearly distinguish successful deployment from unresolved live provider/accounting/forecast/AI acceptance. Record exact evidence and remaining gaps in the handoff.

## Bull / Bear / Judge: current implementation

The JEV Portfolio Lab contains a manual research council. Bull and Bear select evidence independently and submit cited support/challenge cases. Judge compares their inspected claims and may prefer Bull, prefer Bear, remain balanced or abstain for insufficient evidence. A directional preference stays provisional; outcomes are not known in advance.

`JevCouncilPanel.tsx` exposes fictional demonstration, loaded-source inspection, research-input validation and loaded-evidence analysis. The UI caps attempts; Python caps six model calls and three loaded-data tool calls. Optional TypeSafe assessment is a separate click. `council_model.py` enables NVIDIA requests only after explicit development opt-in and refuses production/Vercel environments. No production agent activation is part of this release. Secure supported-model configuration and a frozen-evidence usefulness comparison remain prerequisites for a later live agent increment.

This is decision-support research, not a trading executor or proof of forecast accuracy. Multiple roles using a model can share biases; source quality and a deterministic baseline remain necessary.
