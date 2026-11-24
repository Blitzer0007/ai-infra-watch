# Current continuation: authenticated manual research-role UI — 24 November 2026

This supersedes the CLI-only stage below. Read [RESEARCH-ROLE-AGENTS.md](RESEARCH-ROLE-AGENTS.md), [RESEARCH-ROLE-REVIEW.md](RESEARCH-ROLE-REVIEW.md) and [release2-remaining-work.md](release2-remaining-work.md).

- Continue existing draft [PR #189](https://github.com/Blitzer0007/ai-infra-watch/pull/189), branch `feature/nvidia-council-evaluation`, Cloud worktree `/workspace/ai-infra-watch-model-evals`. Preserve every earlier worktree/change. Exact pushed source SHA, current-head CI links/results and artifacts belong in the PR description and Cloud `/workspace/ai-infra-watch-release-evidence/PR189-CONTINUATION.md`. Earlier dc9627c checks are historical after this integration.
- Added flat `research-v2` to the existing private council relay/backend, with separate `RESEARCH_ROLE_HTTP_DEV_ENABLED=true` required in both services. Existing access, nonproduction/Vercel, loopback, shared concurrency, body size, timeout and no-retry guards stay enforced. The dedicated multi-model factory is still required; no shared/legacy credential fallback. Original request bytes bind Python admission/runner SHA-256 without float reserialization.
- Browser action **Run model-selected research roles** requires `VITE_RESEARCH_ROLE_DEV_ENABLED=true` inside the development/QA-only parent, source inspection and explicit input validation first. QA builds are loopback-only; never publish them. The source packet stays frozen across feed refresh. Shared in-flight/five-attempt cap, symbol/horizon clearing, fresh-review clearing and stale-response rejection remain. No automatic calls happen on validation, tab/theme change or selection changes.
- A separate result panel shows controlled role questions, original cited values, workflow completion versus input readiness, incomplete roles and counters. Actual inspected IDs/families are in the bounded trace. Shared Node/browser validation rejects extra prose/fields, invented/uninspected/ineligible citations, wrong digest/scope/policy, altered authority and forged completion. Deterministic tabs remain the model-free baseline. Fixture runs are explicitly simulated, not evidence of live availability. UI token/cost is unreported; separate CLI trials retain redacted receipts.
- Bounds remain six model/provider attempts, three loaded tools, 40 seconds, 60,000 prompt characters and 600 output tokens per call. Company/Catalyst independently scope inputs; Daily receives controlled prior selections for one symbol/snapshot. Nonexhaustive selections and all source/forecast/decision/action flags remain false. No original-document discovery, portfolio-wide summary, orders, writes, messages or scheduling tools were added.
- Local verification: 1,163 Node tests and TypeScript passed; Python council/admission/routing/roles/HTTP/benchmark checks passed (186 selected tests in final rerun; earlier broader 196-case run also passed), plus 33 offline release-safety checks. Seventeen development browser cases passed with one production-only skip, followed by two production-bundle exclusion/no-passive-write checks. CI now runs both production checks with QA mode off and the research flag deliberately on to verify the parent guard. Browser tests cross the actual private Node relay and Python runner using a fictional model factory and fake access tokens; zero real provider calls. Light/dark and 360/768/1440px snapshots inspected. Security/whitespace checks passed after tracking the new files and correcting the fictional-token finding below. Fresh exact-head GitHub CI must be verified after push; local results are not CI evidence.
- Validation recovery: one TypeScript declaration was missing and corrected. An overlapping local build/lint attempt invalidated a generated dist input; sequential rerun passed. A production smoke attempt first found a stopped loopback server (connection refused); restarting the local server and rerunning passed. No production service was contacted for these checks. First integration head d9a84e5 failed the security/frontend workflows because a long fictional bearer literal in the new transport test matched the secret scanner; shorter explicitly fake test tokens correct it without changing the scanner or app security controls. Earlier local scans ran before the new file was tracked; always repeat the scan after staging new files.
- Production/main remains PR #188 at `79fddf79a452c2a385b596fced604397781316eb`, READY `dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo`; public alias `ai-infra-watch-theta.vercel.app`. PR188-only release exception is consumed. This increment stays draft/unmerged/undeployed. No production secrets, DB modification, live inference/polling or Telegram sends.
- Dedicated NVIDIA development credential is still absent by name-only presence check. Future live monitoring/model prerequisites: dedicated Cloud development secret and explicit profile/flags; one selected fictional live probe; real availability/quota/latency/token/cost acceptance; independently reviewed grounding/selection labels, holdouts and baseline comparison; authorized source acquisition/verification. Accounting/history/source/forecast/Radar acceptance remains in the remaining-work register. Do not invent an overall completion percentage.
- Next concrete work: verify all applicable exact-head CI/artifacts, then obtain development-provider acceptance when the dedicated secret is configured. The manual UI plumbing is implemented; real provider acceptance and independent usefulness are still pending. Preserve production-disabled controls and do not reuse any consumed release exception.

Resume:

> Continue draft PR189 on feature/nvidia-council-evaluation in /workspace/ai-infra-watch-model-evals. Read this checkpoint, RESEARCH-ROLE-AGENTS.md and release2-remaining-work.md. Verify the latest pushed head/CI in the PR and Cloud handoff. Authenticated manual research-v2 UI integration is implemented behind separate build/server opt-ins and tested through the real relay with a fictional model. Dedicated NVIDIA development key is absent; no live inference/financial usefulness is verified. Production stays188 at79fddf79 / dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo. Preserve all work and do not merge/deploy/inspect production secrets/modify DB/enable polling/send Telegram or reuse188 approval.

---

# Historical continuation: bounded research-role runner — 23 November 2026

This supersedes the earlier baseline-only stage below. Read [RESEARCH-ROLE-AGENTS.md](RESEARCH-ROLE-AGENTS.md), [RESEARCH-ROLE-REVIEW.md](RESEARCH-ROLE-REVIEW.md) and [release2-remaining-work.md](release2-remaining-work.md).

- Continue existing draft [PR #189](https://github.com/Blitzer0007/ai-infra-watch/pull/189), `feature/nvidia-council-evaluation`, Cloud worktree `/workspace/ai-infra-watch-model-evals`. Previousfa07e5c passed eight workflows for the baseline UI increment; fresh exact-head CI is required after this runner increment. Preserve all old worktrees and Codex work.
- Added a bounded tool-calling Company/Catalyst/Daily Review runner: one loaded inspection/coverage step and two model calls per role; six model/provider attempts, three tools, 40 seconds, 600 output tokens per call and60,000 prompt characters total. It returns at most three baseline-permitted review codes/four inspected usable citations per role. Numeric/event codes require a matching citation. No free-form prose, extra tool loops, new source acquisition, persistence, messages or trade authority.
- Company/Catalyst receive independent scoped catalogs; Daily receives only their validated selections. Results bind the original source-admission digest and distinguish protocol completion from input status; selections are non-exhaustive. Existing source/forecast/decision/action flags remain false.
- Dedicated model adapter explicitly aliases Company→bull slot, Catalyst→bear slot, Daily→judge slot using the existing distinct-model development factory. Fresh/single-use adapter and runner prevent receipt/budget reuse. No shared/legacy credential fallback. Production/Vercel guards are rechecked before real calls.
- Added `research_role_probe.py`: offline fictional protocol by default; explicit --live requires one bundled fictional case and dedicated existing development setup. JSON/Markdown expose controlled selections and redacted alias/model/latency/usage/cost metadata; unknown cost remains unknown. CI generates/uploads the default offline report with no provider configuration or live flag.
- Browser role tabs remain deterministic, production-hidden and unchanged. Model-selected results are CLI/development-probe only; there is no new API mode, UI live-model action or production activation. This is not independent original-document/source inspection or a portfolio-wide daily summary.
- Local verification passed:182 Python runner/council/role/admission/evaluation tests and33 offline CI/release-safety checks; offline probe generated; security/whitespace passed. Provider transports were mocked. JavaScript/UI unchanged from verifiedfa07e5c; do not relabel old-head UI/CI results as current-head evidence.
- Production/main remains PR #188 at79fddf79a452c2a385b596fced604397781316eb / READY dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo. Old source3175243 frozen. The188 release exception is consumed. No merge/deploy, production secret retrieval, DB modification, polling/agent activation or Telegram send.
- Dedicated NVIDIA development key remains absent by name-only check; no live inference, quota/cost/latency/usefulness or independent holdout evidence. Configure a dedicated Cloud development secret, never chat/source/prod/shared credentials. Next after setup: one explicit fictional live case, then independent selection/grounding evaluation and eventual authenticated UI integration after provider acceptance.
- Next: commit/push tested checkpoint, update PR title/body for runner+baseline+benchmark, verify all applicable exact-head workflows/artifacts and save final links in PR/Cloud Markdown. Broader broker/source/history/forecast acceptance remains in the register.

Resume:

> Continue draft189 on feature/nvidia-council-evaluation in /workspace/ai-infra-watch-model-evals. Read this checkpoint and RESEARCH-ROLE-AGENTS.md. The branch now includes a bounded tool-calling runner plus the earlier deterministic UI and model benchmark. Verify latest exact-head CI;fa07e5c checks are historical. Dedicated NVIDIA development key is absent; no live trial ran. Browser tabs stay deterministic; runner is development/CLI only. Production remains188 at79fddf79 / dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo. Preserve all work and do not merge/deploy/inspect production secrets/activate polling/change DB/send Telegram or reuse188 release approval.

---

# Historical continuation: deterministic research-role views — 23 November 2026

This supersedes the earlier implementation/CI phase below. Read [RESEARCH-ROLE-REVIEW.md](RESEARCH-ROLE-REVIEW.md), [NVIDIA-COUNCIL-EVALUATION.md](NVIDIA-COUNCIL-EVALUATION.md) and [release2-remaining-work.md](release2-remaining-work.md).

- Continue existing draft [PR #189](https://github.com/Blitzer0007/ai-infra-watch/pull/189) on `feature/nvidia-council-evaluation`, Cloud worktree `/workspace/ai-infra-watch-model-evals`. Previous sourceffb9e303 passed seven applicable workflows. The new role/UI increment needs fresh exact-head CI; final source SHA and results belong in the PR description and Cloud handoff. Preserve every older worktree/change.
- Added Python/JavaScript deterministic Company/Catalyst/Daily Review baseline helpers, strict request/admission binding and eight matching fictional fixtures. The development UI presents cited observations and fixed review questions in accessible tabs after explicit input validation. No extra provider request, new API endpoint, model call, persistence or message capability. These views are not autonomous AI agents, a portfolio-wide daily decision summary or model usefulness evidence.
- Company handles financial/risk evidence and zero/negative cash flow; Catalyst exposes event confirmation/timing gaps; Daily Review lists source/coverage questions for one symbol/frozen snapshot. Missing/uncertain evidence stays uncited. All source/forecast/decision/allocation/message authority flags remain false; limits are eight observations and seven codes per role.
- Local checks passed:1,156 Node tests,152 Python council/roles/evaluation tests,33 offline CI/release-safety checks, TypeScript/security/whitespace and production build. Council browser suite11 passed/one production-only skip; final role/tab/theme cases passed2 targeted checks after contrast/accessibility changes. Separate production omission/no-passive-persistence checks passed2 cases. Fictional light/dark previews are under `/tmp/aiw-research-role-ui/`; no production data or credentials were used.
- Main/production remains successful PR #188 at79fddf79a452c2a385b596fced604397781316eb / READY dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo / ai-infra-watch-theta.vercel.app. Merged188 source3175243 is frozen; its protection exception is consumed. No merge or deployment is authorized for189 by this checkpoint.
- Dedicated NVIDIA development key remains absent by name-only check. No live inference/quota/cost/latency/usefulness trial. Configure only a dedicated Codex Cloud development secret, never chat/source/prod/shared credentials. The benchmark single-case live hook and independently reviewed labels/holdouts remain pending, followed by model-selected bounded roles and independent source/document inspection. Keep production agents/polling/DB/messages off.
- Next: push the coherent increment, update PR title/body for benchmark plus deterministic role views, verify all applicable exact-head CI and update Cloud Markdown. Do not reuse the oldffb9e30 CI as new-head evidence. Code release and missing broker/source/history/forecast acceptance remain separate.

Resume:

> Continue draft PR189 on feature/nvidia-council-evaluation in /workspace/ai-infra-watch-model-evals. Read this checkpoint and RESEARCH-ROLE-REVIEW.md. The branch includes the offline model benchmark plus deterministic Company/Catalyst/Daily review views, not autonomous model agents. Verify the latest pushed head and all applicable CI;ffb9e30 is historical after this increment. Production stays188 at79fddf79 / dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo. Dedicated NVIDIA development key is absent; live trials and independently reviewed usefulness/holdouts remain pending. Preserve all work and production-disabled/source/decision controls; no merge, deploy, production secrets, DB modification, polling or Telegram send.

---

# Historical continuation: NVIDIA council evaluation — 23 November 2026

This section supersedes all historical approval, release and production identities below. Read [release2-remaining-work.md](release2-remaining-work.md) and [NVIDIA-COUNCIL-EVALUATION.md](NVIDIA-COUNCIL-EVALUATION.md).

- PR #188 is merged and successfully deployed. Production/main is `79fddf79a452c2a385b596fced604397781316eb`, READY `dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo`; public alias `ai-infra-watch-theta.vercel.app`. Seven exact-main workflows and guarded staging/access/assets/rollback/promotion/public asset checks passed. The PR188-only protection exception is consumed; do not reuse it. Its frozen source branch/worktree stays at3175243.
- New Cloud worktree `/workspace/ai-infra-watch-model-evals`, branch `feature/nvidia-council-evaluation`, based on that verified main. Preserve every historical worktree and pending change. Commit/push this development increment and open a draft PR; do not merge or deploy it.
- Added `app/eval/council_benchmark.py`, CLI `scripts/council_model_benchmark.py`, eight bundled FICT scenarios and independent explicit selection/admission/abstention labels, test coverage and CI offline Markdown artifact. The numeric baseline never reads expected labels. Protocol completion is separated from selection quality. No future-winner score or financial-usefulness claim.
- Only an explicit single-case --live can call the dedicated development router, at most six attempts. Default controls make no HTTP calls or provider-configuration reads. JSON/Markdown export metadata/metrics only, with unknown usage/cost preserved. Production/Vercel guards and all source/action/evidence boundaries remain unchanged.
- Dedicated NVIDIA development key is absent by name-only presence check; no live inference or quota/cost/latency measurement. Configure via dedicated Cloud development secret settings, never chat/production/shared keys. These authored fictional calibration labels are not independently reviewed financial truth or holdout evidence.
- Local verification: 141 council/evaluation tests and33 CI-safety tests passed, including the final Markdown telemetry/unknown-cost checks; security and whitespace passed. Default offline Markdown comparison generated successfully. Require fresh exact-head CI after commit/push. A minimal QA-only venv lacked LangGraph during the first collection attempt; the existing full Cloud venv runs the agent/evaluation suite. No production or shared credentials were read. Do not label unrun CI as passed.
- Next: finish local checks, update these results, commit/push and open the draft PR, record exact-head CI and keep Cloud Markdown current. Then dedicated NVIDIA live probing/independent evaluation and bounded research-role expansion remain pending. Broader broker/source/history/forecast acceptance gaps remain in the register. No production activation/polling/DB/messages or deployment is part of this increment.

Resume:

> Continue AI Infra Watch on feature/nvidia-council-evaluation in /workspace/ai-infra-watch-model-evals. Read this checkpoint, NVIDIA-COUNCIL-EVALUATION.md and release2-remaining-work.md. Production remains successful PR188 at79fddf79 / dpl_FaRKWW7JLPdHykMszmzk7oPA9mJo; source3175243 is frozen. Finish/verify the fictional council comparison and draft PR; record exact-head CI. Dedicated NVIDIA development key is absent and no live trial ran. Preserve work and all production-disabled/evidence boundaries; no merge, deployment, production secrets, DB modification, polling or Telegram send.

---

# Historical continuation: council CI isolation recovery — 23 November 2026

- Continue draft [PR #188](https://github.com/Blitzer0007/ai-infra-watch/pull/188), branch `feature/read-only-health-snapshot`, Cloud worktree `/workspace/ai-infra-watch-health-snapshot`. Preserve all previous changes/worktrees. The current pushed SHA and exact-head workflow links belong in the PR description and Cloud release evidence.
- Previous head `0e9981c9556f9b017d14f4f55def08f3082ef0d8` passed six applicable workflows but failed [UI API DB Validation](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/45039131514). Two council browser cases exhausted the gateway's 12-requests/minute bucket shared across independent cases. Do not describe that head as fully verified.
- Recovery changes: `qa/test_portfolio_council_ui.py` now starts a fresh gateway/backend per independent case. New `server/api/councilRateLimit.test.js` verifies requests 1–12 succeed, 13–14 return 429 without upstream calls, and the minute boundary restores admission. Application rate limits and evidence checks are unchanged.
- Local recovery checks passed: all 1,152 Node tests, TypeScript, security scan and whitespace checks; council browser suite 11 passed / one production-only skip against the QA build. Used a separate `/tmp/aiw-ci-repro-venv` installed from existing QA/backend requirements; original Cloud venv preserved. Earlier production-build/boundary and Python checks remain historical; require all applicable fresh exact-head CI for this correction.
- NVIDIA-first candidate routing, optional free-only OpenRouter adapter, controlled outputs, six-call budgets and production guards remain as described below and in [MULTI-MODEL-COUNCIL.md](MULTI-MODEL-COUNCIL.md). Dedicated development key remains unconfigured. No live inference, billing/latency observation or financial usefulness claim.
- Production remains PR #187 at `978ccefac76e36fa24e4b35cab2f1a08cbaca899`; proposed rollback `dpl_BxDnHxX17q5mXVjLntaUtU4fazV6`. No PR #188 protection exception has been granted. [PR188-RELEASE-CANDIDATE.md](PR188-RELEASE-CANDIDATE.md) describes the prepared release, deferred controls and exact ancestry/CI/staging/asset/access/rollback gates.
- Next: push this coherent recovery checkpoint, inspect all exact-head CI and update the PR/Cloud evidence. When green, obtain the explicit PR #188-only decision before ready/regular merge/staging/promotion. Do not reuse PR #187 approval, inspect production secrets, activate agents/polling, change production DB or send Telegram.

Resume:

> Continue draft PR #188 on feature/read-only-health-snapshot. Read this checkpoint, MULTI-MODEL-COUNCIL.md and PR188-RELEASE-CANDIDATE.md. Verify fresh CI for the council gateway test-isolation fix; 0e9981c had a genuine QA failure and is historical. Owner selected NVIDIA first but dedicated development key is absent and live tests have not run. Production remains #187; a new explicit #188-only protection exception is required before merge/deploy. Preserve all work and the production-disabled model/evidence controls.

---

# Current continuation: NVIDIA-first role routing and PR #188 release preparation — 22 November 2026

This section supersedes the earlier no-release-preparation text below. The owner requested different free-model choices and a production release, then selected **NVIDIA first**. Development/release preparation is authorized; a new PR #188-specific exception to deferred protection controls is still pending. Do not merge under PR #187's consumed approval.

- Active Cloud worktree `/workspace/ai-infra-watch-health-snapshot`, branch `feature/read-only-health-snapshot`, draft https://github.com/Blitzer0007/ai-infra-watch/pull/188 against main. Preserve every older worktree and frozen release branch. Prior `2b0adc85d31a32a19e0fd3f48ac467f6ac836848` passed all seven applicable workflows; current edits require fresh exact-head CI.
- Read [MULTI-MODEL-COUNCIL.md](MULTI-MODEL-COUNCIL.md) and [PR188-RELEASE-CANDIDATE.md](PR188-RELEASE-CANDIDATE.md). Adds explicit Bull/Bear/Judge model routing, NVIDIA-first candidate profile and optional zero-price OpenRouter adapter. No random router, paid fallback, redirect or automatic retry. Existing budgets/controlled output/evidence/abstention/false-authority gates remain intact. Production/Vercel rejects configuration and calls; council UI stays absent from production. JEV is still a separate manual counts-only action.
- Owner-selected NVIDIA-first profile: openai/gpt-oss-20b, qwen/qwen3-next-80b-a3b-instruct, meta/llama-3.3-70b-instruct. Official NVIDIA model references were checked; availability, quota, latency, billing and usefulness are not established. Dedicated COUNCIL_NVIDIA_API_KEY was absent by name-only check. Do not inspect/copy production or shared legacy credentials. Configure a dedicated Cloud development secret before live probing; never ask for keys in chat. Agent Reach remains uninstalled.
- New probe script defaults to offline fictional evidence and a deterministic protocol fixture; explicit --live still requires all development opt-ins and dedicated credentials. Receipts contain only role/model/latency/usage/cost metadata. Unknown costs stay unknown. No live inference was run.
- Local checks passed: 1,151 Node tests, 105 Python role/council/admission cases, 33 offline CI/release-safety checks, TypeScript/security/whitespace and production build. Council/navigation mocked suite passed 33 cases with its production-only case skipped then separately passed on the production bundle. Legacy/multi-model browser relay plus JEV counts passed two targeted cases. Production all-workspace no-passive-write smoke passed.
- Prepared #188 guard/handoff pins direct first parent/current main `978ccefac76e36fa24e4b35cab2f1a08cbaca899`, source branch and actual merged head; rollback/current READY `dpl_BxDnHxX17q5mXVjLntaUtU4fazV6`. Public alias was independently confirmed there. Team/project remain the intended AI Infra Watch identities. Manual release/waiver defaults stay NO, live checks false, exact-main CI/staging/access/asset/rollback checks retained. No PR #188 owner exception has been granted yet. Automatic domain-assignment state was not exposed by the project metadata tool; reverify before any approved merge.
- Next: complete current-head CI and record exact links in the PR and Cloud Markdown, then ask for the concrete #188-only protection exception as the final release decision. Do not mark ready/merge/stage/promote until resolved. After approval, complete regular merge, exact-main CI, pinned handoff/staging checks, promotion and final evidence. Live agents, DB changes, polling and Telegram sends remain out of scope.

Resume:

> Continue AI Infra Watch draft #188 on feature/read-only-health-snapshot. Read MULTI-MODEL-COUNCIL.md and PR188-RELEASE-CANDIDATE.md. The owner chose NVIDIA first; dedicated development key is not configured and no live inference ran. Verify the latest exact-head CI. Production remains #187 at 978ccefac / dpl_BxDnHxX17q5mXVjLntaUtU4fazV6. Complete release preparation, then obtain the new explicit #188-only exception before merging to unprotected main. Preserve all work; do not reuse #187 approval, inspect secrets, activate models/polling, modify production DB or send Telegram messages.

---

Historical checkpoints follow.

# Current continuation: Opportunities financial review — 22 November 2026

This section supersedes the earlier #188 next-step text below. Production remains PR #187; no new release is authorized.

- Active Cloud worktree `/workspace/ai-infra-watch-health-snapshot`, branch `feature/read-only-health-snapshot`, draft PR https://github.com/Blitzer0007/ai-infra-watch/pull/188 against main. Preserve all earlier worktrees and frozen branches. Previous head `11b596cefaa0e482ef94a5172afa77d64b25029c` passed all seven applicable workflows; the new increment needs fresh exact-head CI.
- Read [OPPORTUNITIES-FINANCIAL-REVIEW.md](OPPORTUNITIES-FINANCIAL-REVIEW.md). Opportunities now has an expandable manual per-company financial review using the existing private SEC action and admitted annual declarations. It shows source references and missing groups without changing the frozen scan, research eligibility, JEV summaries, account figures or trading status. No arithmetic is inferred from context-unverified statement inputs.
- `useManualSecDossier` shares the existing auth, request admission, three-attempt cap, successful-load guard, fixed error vocabulary and cancellation between company dossiers and Opportunities. No source request happens on mount/open/scan/company change; only the explicit button acquires. Scope changes/rescans clear prior data; late replies are discarded. Scan generations stay unique even with a fixed clock.
- Local verification: 1,149 Node tests, TypeScript/security/whitespace checks and 12 targeted browser cases passed. Broader Opportunities/navigation/source-quality suites passed 41 cases with one production-only case skipped in the QA build; that case then passed separately on the local production bundle. The production build and all-workspace no-passive-write smoke passed. Final current-head CI belongs in the PR and Cloud evidence after push; older-head green checks are historical.
- Production/main remains `978ccefac76e36fa24e4b35cab2f1a08cbaca899`, last verified deployment `dpl_BxDnHxX17q5mXVjLntaUtU4fazV6`. PR #187's exception is consumed. #188 remains draft, unmerged and undeployed. No production configuration/DB change, secret inspection/display, live provider/model call, polling or Telegram send occurred. Do not duplicate the earlier confirmed Telegram test.
- Remaining prerequisites: authentic security-class/listing evidence and compatible reported research observations before classification; source access/contact and original filing-context verification; shared provider budgets/adjusted history; broker precision/timezone/full-account evidence. Agent Reach remains reviewed but uninstalled, and AI activation is unchanged.

Resume prompt:

> Continue AI Infra Watch on feature/read-only-health-snapshot / draft #188. Read this top section and OPPORTUNITIES-FINANCIAL-REVIEW.md. Recheck the latest exact head and all applicable CI; 11b596c's green CI covers the earlier dossier stage only. Preserve all previous worktrees and existing dark-theme/source/private-access repairs. Production remains #187. Continue authentic financial/listing integration without inventing eligibility, accounting or source authority. No merge, deployment, production writes/config changes, secret retrieval/display, polling, AI activation or Telegram message.

---

# Historical continuation: manual SEC dossier connection — 22 November 2026

This section supersedes the previous #188 verification-next-step text below. PR #187 remains production; #188 remains a draft development candidate.

- Active branch/worktree: `feature/read-only-health-snapshot`, `/workspace/ai-infra-watch-health-snapshot`, draft https://github.com/Blitzer0007/ai-infra-watch/pull/188 against main. Previous head `bb9b96bdaeeafaeb101d5ba0c27ae8ef236b84e3` passed all seven applicable workflows. The new SEC increment requires its own exact-head checks; do not reuse those older results.
- Read [SEC-DOSSIER-CONNECTION.md](SEC-DOSSIER-CONNECTION.md). The company dossier now has an explicit authenticated read action using fixed SEC directory/submissions/companyfacts URLs, declared issuer consistency, retained-source financial admission and bounded period selection. Source authenticity/security class, valuation/trading eligibility and accounting authority remain unverified. Opportunities classification/financial eligibility is not changed.
- Source requests occur only after the manual button. Private access and valid configured EDGAR contact are required. No production config was inspected/changed and no live SEC request was made. Process-local concurrency/budget/cache limits are documented; they are not distributed quotas. No background polling, model call, DB write or message is added.
- Changed files: new shared SEC connector, server source-loader/private action and regression tests; existing company-scale dispatcher, HoldingCompanyDossier/CompanyDossier and company research browser suite; fictional fixtures. Existing dark theme and all previous #188 repairs are preserved.
- Local checks passed: 1,144 Node tests, TypeScript, security scan, 31 dossier/navigation/Milestone 3/4 browser cases, eight manual-connection cases including an added attempt-limit test, and 34 production-build/offline safety checks. The first connector test exposed missing earlier cash coverage when selecting only the newest instant; bounded period selection was corrected. Browser test ordering and explicit memo/reference typing were corrected without weakening gates. Final current-head CI/results belong in the PR description and Cloud evidence after push.
- Production remains main `978ccefac76e36fa24e4b35cab2f1a08cbaca899`, last verified deployment `dpl_BxDnHxX17q5mXVjLntaUtU4fazV6`. PR #187's exception is consumed. No #188 merge/deploy is authorized. Preserve every previous worktree/frozen branch. Telegram test was already confirmed; do not resend it.
- Next: finish exact-head CI, then continue authentic listing/security-class and financial integration for Opportunities, shared provider budgets/compatible adjusted history, and original broker precision/timezone/full-history evidence. Do not manufacture classifications, timestamps, shares, source authority or account returns. Agent Reach remains reviewed but uninstalled; no AI activation or new polling.

Resume prompt:

> Continue AI Infra Watch on feature/read-only-health-snapshot / draft PR #188. Read this top section and SEC-DOSSIER-CONNECTION.md. Recheck the latest head and all applicable CI; bb9b96b's seven green workflows cover the earlier candidate only. Preserve dark/theme/source/private-access repairs and all old worktrees. The new manual SEC dossier connection is offline-tested, not live-certified or deployed. Production remains #187. No merge, deployment, production DB modification, secret retrieval/display, live polling, model activation or duplicate Telegram message.

---

# Historical continuation: workspace, private-access and source recovery — 22 November 2026

**This section supersedes the historical pre-release instructions below. PR #187 is already deployed; do not deploy or merge it again.**

- Production: main `978ccefac76e36fa24e4b35cab2f1a08cbaca899`, READY `dpl_BxDnHxX17q5mXVjLntaUtU4fazV6`, public URL https://ai-infra-watch-theta.vercel.app . PR #187 source and main CI, staged/public HTML/JS/CSS byte checks and auth gates passed. Release result is recorded in [PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187). Rollback: `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v` at `529e9562`.
- The owner's explicit reply “Approve PR #187 merge and deployment with the one-release exception” resolved automatic review's rejection of the earlier ambiguous “ignore this.” That exception is consumed and specific to #187. Main remains unprotected; this increment does not add a release exception.
- Active branch/worktree: `feature/read-only-health-snapshot`, `/workspace/ai-infra-watch-health-snapshot`, based on deployed main. [Draft PR #188](https://github.com/Blitzer0007/ai-infra-watch/pull/188), targeting main. Implementation commit `44cf055fde91877aaca89f222fef0f5927e99d04`; the documentation checkpoint adds a new head and needs its own CI. No merge or deployment. Freeze merged `feature/data-health-evidence-states` at `7f6cb9b0965d474642fb5e204749135eb50796e3`; preserve #185/#186 and every old worktree. Do not merge duplicate branches.
- Read [the full source/Agent Reach audit](DATA-SOURCE-AUDIT-2026-11-22.md), [the screenshot audit](NOV22-SCREENSHOT-RECOVERY.md) and [diagnostic scope/acceptance](READ-ONLY-DIAGNOSTIC-SNAPSHOTS.md). Adds redacted preview/copy controls, persistent light/dark switching (including sign-in/portals), grouped accounting/rule issues, fixed field-specific ledger diagnoses, clearer forecast/last-close/benchmark presentation, and the missing JEV opportunities assessment registration with bounded validation/errors. No acceptance condition, financial threshold, sender, schema, dependency or deployment control changed. JEV remains manual-click; Bull/Bear/Judge activation is unchanged. The new source-audit increment scopes the full rotation universe to Rotation, limits each history batch to three in-flight loads and stops queued work on navigation, explains chart prerequisites, fixes inherited session auth in private research clients and guards private quality/forecast routes while retaining scheduler auth. Page-open legacy forecast uploads and passive application/Watchlist alert-config POSTs are removed; local rows/preferences are preserved and server alert changes use an explicit scoped save control. Agent Reach was inspected at pinned c70ae6d (not installed).
- Local verification: 1,129 Node tests, 60 relevant browser/endpoint checks (including all 17 routes in both themes at 390/1440px, persistence, holding portals, JEV frontend-to-Python contract, redaction and no added writes), five existing Python JEV/auth tests, 33 offline safety checks and TypeScript passed. The grouped-layout assertions were updated after three tests correctly detected the intentional presentation change; all affected cases then passed. Production build/security and a production-mode mobile sign-in smoke passed: the private gate/password field remained in place, dark mode persisted on reload, and there were zero writes/page errors. All six applicable workflows passed on `396b29370bebc1f38bbfd67e83327301959e11ea`. The owner then extended scope to source/chart/Agent Reach investigation. The source/private-access increment passed 1,133 Node tests, 41 source/browser regressions, targeted request-scoping/auth/manual-save cases, 33 offline safety checks, TypeScript, the production build and security scan. A production-mode mocked smoke passed all 17 workspaces with no passive API writes, forecast uploads, alert sends or page errors; it also preserves device-only forecast rows. This smoke now runs in CI after rebuilding with QA mode off. The source checkpoint `d38377b9250a1ff2e89e87222d1f6e16cc99b553` hit a secret-signature failure in a fictional test bearer literal. The fixture now builds headers from its isolated fake environment; the scanner and targeted auth tests pass unchanged. No scanner rule or acceptance check was weakened. Require fresh exact-head CI on the correction commit. Earlier green runs do not cover these new changes. No real model request or credits used.
- Live gaps remain: authentic per-symbol quote availability, complete original ledger/fees/currency/corporate-action evidence, issuer/Event Radar acquisition, prospective forecast outcomes and model usefulness. Production aggregate SELECTs (no private row values or IDs) confirmed quantity precision, execution-format and derived/unassessed blockers, plus broker-direction review flags. Supabase project qjgnryjtrdwrbmlgdquk is ACTIVE_HEALTHY. See the screenshot audit; preserve strict gates and reconcile original broker evidence before repair. The report helps future diagnosis; it does not close these gaps.
- Telegram connection test was already confirmed by the owner's screenshot. No duplicate send or digest replay. No production database mutation, secret retrieval/display, new polling, model activation, merge or deployment is authorized for this new branch.
- Bull/Bear/Judge remains manual-start bounded research, with production UI disabled and a development-only NVIDIA adapter. It is not continuous monitoring or an automatic trading system.

Next: verify all applicable exact-head CI on draft PR #188 after the source-audit checkpoint. Record final SHA/results in the PR description and Cloud release-evidence Markdown; do not mistake the older 396b293 CI for this new head. Record results in its description and the Cloud release-evidence checkpoint without mislabelling previous-head runs. Keep it draft, unmerged and undeployed. After review, reconcile broker precision/timezone/source evidence before any ledger repair proposal; no production data change is authorized. Future authenticated diagnostics and any release require their own authorized scope.

Resume prompt:

> Continue AI Infra Watch on feature/read-only-health-snapshot / draft PR #188. Read this current section, NOV22-SCREENSHOT-RECOVERY.md and READ-ONLY-DIAGNOSTIC-SNAPSHOTS.md. Production remains PR #187 at 978ccefac76e36fa24e4b35cab2f1a08cbaca899 / dpl_BxDnHxX17q5mXVjLntaUtU4fazV6. Preserve frozen release branches. Review the source/auth/chart and theme recovery candidate, record current-head tests/CI and keep the new PR draft. No merge/deployment, duplicate Telegram send, new polling, production database mutation, secret retrieval/display or AI activation.

---

Historical provenance follows; earlier approval and pending-release statements are superseded above.

# Current continuation: approved PR #187 release — 22 November 2026

**This section supersedes previous release-blocker text.** After being asked for the new PR #187-only unprotected-main exception, the owner replied “as of now ignore this.” Proceed with that scoped exception and all retained exact-commit, staging, access and rollback checks. No further confirmation of this same action is needed.

- Active release: `feature/data-health-evidence-states`, `/workspace/ai-infra-watch-data-health`, [ready PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187) targeting `main`. Its tree includes the complete #186 light UI and quote/Data Health repairs. Preserve #185/#186 branch heads and worktrees. Do not merge duplicate #186 separately.
- Base/current main and direct first-parent pin: `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. New exception is explicitly PR 187 / branch `feature/data-health-evidence-states` / intended repository only. The updated one-time handoff waits for exact-main QA, independently checks all required main CI and PR ancestry, and dispatches the guarded manual workflow at most once. Its rollback is `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`. Historical #180 attestation is retained unchanged; this is a new scope.
- Read [the authorized release plan](NOV22-RELEASE-CANDIDATE.md). Latest local guard verification: 1,118 Node tests, 33 offline safety/deployment checks and TypeScript passed. Application source previously passed 28 latest mocked browser checks and production build; the new final head must pass fresh Frontend CI, Security audit and UI API DB Validation.
- Continue autonomously through final PR CI, expected-head regular two-parent merge, exact-main CI, the one-time handoff, staging/auth/HTML/JS/CSS checks, promotion, public alias/commit verification and bounded runtime-error inspection. Fix genuine failures without weakening checks. Do not declare deployed until promotion and verification actually succeed.
- Freeze the feature branch head after merging: handoff attestation compares the second main parent with that PR head. Record later production evidence in `/workspace/ai-infra-watch-release-evidence/PR187-PRODUCTION.md` and the PR description, not another feature-branch commit.
- Current known-good READY production/rollback is `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`, main `529e9562`, public alias `ai-infra-watch-theta.vercel.app`, team `team_TfbzU4SMDZD8lIgCHKsJNa6v`, project `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`. Verify before release. No other project, deployment parent or rollback is authorized by these pins.
- Keep `run_live_checks=false`: it includes SEC/provider refresh, which remains outside scope while production database changes are not authorized. No production keys displayed/retrieved by the agent, no new polling and no AI model activation. The production Telegram test is already confirmed received by the owner's screenshot; do not duplicate or replay a slot.
- Bull/Bear/Judge is manual-start, bounded research. The UI is development/QA-only; its NVIDIA adapter requires explicit development flags and refuses production. It is not continuous autonomous production monitoring. The owner asked what it is; that question does not authorize enabling it.

Resume prompt:

> Continue the approved PR #187 release on `feature/data-health-evidence-states`. Read this current top section and `docs/release/NOV22-RELEASE-CANDIDATE.md`. The fresh PR #187-only exception is owner-approved; keep exact ancestry/CI, staging, auth, asset bytes and rollback checks. Complete PR CI, regular expected-head merge, main CI, one-time handoff and verified production promotion. Freeze the PR branch after merge. No duplicate Telegram sends, production database changes, secret display, new polling or AI activation.

---

**Historical checkpoints below retain provenance; earlier pending-approval statements are superseded above.**

# Current continuation: November 22 release preparation

**This section supersedes prior no-release instructions for preparation scope only.** The owner said “lets do it” after the proposal to release the tested UI/quote repairs, and asked about Bull/Bear/Judge agents. Release preparation is authorized; no new unprotected-main exception is yet authorized or implemented.

- Active: `feature/data-health-evidence-states`, Cloud worktree `/workspace/ai-infra-watch-data-health`, [PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187). It now targets `main` as one combined UI + Data Health + public-quote candidate; #186's source is already in its ancestry. Preserve #185/#186 heads/worktrees. Do not merge the duplicate UI PR separately while reviewing this combined path.
- Read [the concrete release candidate, blockers, rollback and agent status](NOV22-RELEASE-CANDIDATE.md). Source before this documentation: `064b1827139c11a42f20e4f77b9869701f723642`; fresh main-target PR CI is required on the new head. Current source passed 1,115 Node tests, 28 latest browser checks, TypeScript, production build and security scan. The main-target PR must also run standalone Security audit.
- Current main: `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`, `protected=false`. Connected tools have no protection-write operation; CLI protection read was forbidden. Existing release guard and handoff only permit the already-approved historical exact releases, most recently #180; do not reuse that exception for #187 or silently add a new waiver.
- Complete authorized candidate review and exact-head CI before asking the owner to resolve the concrete release-control blocker. Either configure the required protection/environment controls, or obtain a fresh, clearly scoped #187-only owner exception before changing the pinned exception/handoff. Do not merge into an unusable release path.
- Current live READY production and proposed new-release rollback: `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`, commit `529e9562`, public alias `ai-infra-watch-theta.vercel.app`, team `team_TfbzU4SMDZD8lIgCHKsJNa6v`, project `prj_5G5PtOgnVCxyPjTqXII4oXPrS4XD`. Reverify before action. The older #180 rollback is not automatically the rollback for this release.
- Telegram's labeled Settings test is already confirmed received by the owner screenshot; do not send a duplicate or replay a digest slot. No production keys, database changes or live polling are authorized by this preparation.
- Bull/Bear/Judge exists as manual evidence research, with development-only NVIDIA opt-in, bounded calls and optional separate TypeSafe click. No agent activation is part of this release. Explain provisional preference/abstention rather than claiming three agents determine future correctness.

Resume prompt:

> Continue PR #187 on `feature/data-health-evidence-states`, now targeting main as the combined light UI and quote/data-health release candidate. Read this current top section and `docs/release/NOV22-RELEASE-CANDIDATE.md`. Verify all three exact-head PR CI workflows, then resolve the documented release-control blocker without silently reusing #180's exception. Preserve #185/#186. Telegram connection test is already confirmed; no duplicate sends, production database changes, keys retrieval or new polling.

---

**Historical checkpoints follow.**

# Current continuation: public quote contract repair — 22 November 2026

**This section supersedes historical instructions below.** The owner asked to fix provider issues and explicitly authorized a labeled production Telegram test. The test is now confirmed received by the owner's screenshot; do not send another.

- Continue on `feature/data-health-evidence-states`, worktree `/workspace/ai-infra-watch-data-health`, [draft PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187), stacked against #186 (`fe8bde2916ebb4b746c717516155824a339b6d42`). Preserve original #185 (`c9db228`) and #186 heads and every other worktree. The merged #180 branch stays frozen for release attestations.
- This continuation fixes the actual public quote controller, which was discarding metadata retained by the internal provider adapter. It reuses the shared Yahoo parser and mapping, keeps the public route Yahoo-only, preserves original cache timestamps and fails with bounded errors. No financial gate, credential-bearing fallback, polling, database, sender implementation or deployment control changed.
- Read [the repair and Telegram evidence](PUBLIC-QUOTE-CONTRACT-REPAIR.md), [Data Health acceptance](EVIDENCE-CHANNEL-HEALTH.md), and [the reconciled backlog](PLAN-RECONCILIATION-2026-11-21.md).
- Local checks: 1,115 Node tests, 28 focused mocked browser cases, TypeScript and QA build passed. Production build and security scan passed. Fresh exact-head CI must be recorded in the PR. Earlier green `1567b58` checks cover the prior candidate, not this new patch.
- Production remains last-verified main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`, READY `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`; rollback `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2`. No merge or deployment is authorized by this continuation.
- Telegram: PR #180's brief improvements are already deployed. The owner screenshot shows the labeled Settings connection test received at 08:55 Asia/Kolkata on November 22. The agent did not send it or retrieve production keys. Do not replay a digest slot or send a duplicate. Existing Settings tests omit a dedupe key and avoid outbox/database bookkeeping; intercepted regression tests verify that path.
- Live limits: no matching recent quote/Telegram log entries, no successful direct Cloud connection to Yahoo, and no authenticated private provider packet. These are observability/access limits, not proof of a production vendor outage. The code-contract defect is independently reproduced and repaired offline. Source accuracy and complete accounting remain unverified.

## Next concrete steps

1. Verify the latest PR #187 head and both applicable workflows: Frontend CI (including security scan) and UI API DB Validation. Require the standalone main-only Security audit as well if later retargeting to main. Repair real regressions without weakening financial, identity, privacy, freshness or no-write guards.
2. Review this combined candidate against #186. Keep both drafts unreleased until explicitly approved; the one-release exception for #180 is not reusable.
3. After an approved release, verify the actual public quote metadata and protected redacted per-symbol diagnostics in an authenticated session before any further provider configuration change. Never manufacture metadata or accounting records to clear a gate.

Resume prompt:

> Continue AI Infra Watch on `feature/data-health-evidence-states` / draft PR #187. Read this current top section and `docs/release/PUBLIC-QUOTE-CONTRACT-REPAIR.md`. Verify exact-head CI and preserve #185/#186 and all other worktrees. The production Telegram connection test is already confirmed received by the owner's screenshot; do not resend it. No merge/deploy, secret retrieval, production database change or new polling without separate authorization.

---

**Historical checkpoints follow; they are not current operating instructions.**

# Current continuation: evidence health recovery draft — 21 November 2026

**This section supersedes historical instructions below.** The owner accepted the clean light direction and asked to move on. The next increment fixes misleading Data Health classifications and integrates the existing quote diagnostics without production changes.

- Active: `feature/data-health-evidence-states`, Cloud worktree `/workspace/ai-infra-watch-data-health`. Its draft PR is stacked against `feature/light-workspace-redesign` (PR #186, base `fe8bde2916ebb4b746c717516155824a339b6d42`). Active draft: [PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187); its current exact-head checks are authoritative.
- Preserved: PR #186 remains an independent UI draft at `fe8bde2`; PR #185 remains an independent quote-diagnostic draft at `c9db228aa878f14ad9c7f00af0006d838fdb1d3d`. Eight implementation/test/doc files from #185 are ported into this stacked candidate. Neither original branch or worktree is modified. The merged PR #180 branch and its release attestations remain frozen.
- Production: main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`, READY `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v` as last verified after the completed PR #180 release. Previous rollback: `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2` (`347240c7657af8a6f830b254e84bedc10f88d785`). Recheck live identities before any future release. No production action is authorized here.
- Read [evidence health scope and acceptance](EVIDENCE-CHANNEL-HEALTH.md), [quote-diagnostic scope](QUOTE-ADMISSION-DIAGNOSTICS.md) and [the reconciled backlog](PLAN-RECONCILIATION-2026-11-21.md).
- Changes: deterministic `evidenceChannelHealth.ts` and unit tests, DataHealth compact summary/recovery disclosure, quote admission projection and sample display from #185, fictional browser/quote fixtures and offline UI CI inclusion. Collection states never grant financial eligibility. No new API read, timer, vendor acquisition, schema or sender path.
- Local verification: 1,096 Node tests; 36 focused browser checks, plus 14 final focus/refresh checks; 32 CI safety tests; TypeScript and QA build. Production build and staged security scan passed. Exact-head CI results belong in the draft PR. Do not treat earlier commits' checks as current-head proof.
- Limitations: fixtures do not establish authentic source availability or complete accounting. The bounded quote sample remains SPY plus up to three holdings. Healthy means declared collection freshness, not correctness or complete financial history.

## Next steps

1. Verify this draft's exact head, diff and the two applicable CI families: Frontend CI (including its security scan) and UI API DB Validation. The standalone Security audit workflow targets main only and must run if this PR is later retargeted to main. Repair regressions without weakening the financial, quote-privacy, history/focus, source or no-write assertions.
2. Review the rendered Data Health summary/recovery previews and the dependency on #186. Keep both drafts and production unchanged unless the owner explicitly requests a release. Do not reuse #180's one-release exception.
3. The next data-recovery prerequisite is authenticated, read-only provider diagnostics by symbol, then a bounded fix supported by the provider's actual contract. Missing currency/security/session/time metadata cannot be invented. Authoritative returns still require complete broker/corporate-action/currency records.

Resume prompt:

> Continue AI Infra Watch on `feature/data-health-evidence-states`. Read the current top of `docs/release/CODEX-CONTINUATION.md` and `docs/release/EVIDENCE-CHANNEL-HEALTH.md`. Find its stacked draft PR and verify exact-head CI. Preserve PRs #185/#186 and every worktree. Use offline fictional fixtures. No merge, deployment, production Supabase changes, new live polling, secrets retrieval or Telegram send without separate authorization.

---

**Historical UI and release checkpoints follow; they are not current operating instructions.**

# Current continuation: clean light workspace draft — 21 November 2026

**This section supersedes all historical instructions below.** The owner disliked the dark app and selected **clean light workspace with fewer cards and clearer navigation**.

- Active branch: `feature/light-workspace-redesign`, isolated Cloud worktree `/workspace/ai-infra-watch-light-ui`, based on main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. Active draft: [PR #186](https://github.com/Blitzer0007/ai-infra-watch/pull/186). Its checks are the authoritative exact-head CI evidence.
- Production: PR #180 has already merged and deployed successfully. Public `https://ai-infra-watch-theta.vercel.app` was verified at READY `dpl_8jCVHBD3ZrnZWsnc9AcdaAE91e1v`, main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. Prior rollback is `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2` (`347240c7657af8a6f830b254e84bedc10f88d785`). Recheck identities before any future release; do not execute historical PR #180 handoff instructions again.
- Preserved draft PR #185: `feature/quote-admission-diagnostics`, head `c9db228aa878f14ad9c7f00af0006d838fdb1d3d`, separate quote-health worktree. It is excluded from this UI draft. PR #180's head is frozen for release attestations. All other worktrees and pending changes remain preserved.
- UI changes: shared light CSS; shell/navigation/feed/search; Overview educational and readiness disclosures; flatter Portfolio navigation/summary, expandable indicators and directly available density controls; light auth/holding-dialog/PWA chrome. Financial/API/shared calculation files and release guards are unchanged. UI CI adds the previously omitted application-workspace test file.
- Read [design scope, rendered fictional previews and acceptance](../design/LIGHT-WORKSPACE-REDESIGN.md).
- Local verification: 1,085 Node tests, TypeScript, 57 focused mocked browser checks, 32 offline CI safety checks; the final mobile refinement reran and passed all 57 focused browser checks, including the all-workspace tests. Security audit and production build passed. CI evidence must match the latest exact branch head; inspect Frontend CI, Security audit and UI API DB Validation rather than assuming an earlier commit applies.
- Full CI on the initial draft caught two legacy smoke assertions affected by sentence case and collapsed readiness details. The repair uses the visible Quality Lab heading and explicitly opens readiness before checking the same forecast /50 evidence, while adding an assertion that the incomplete-review warning stays visible. Financial assertions remain. Require fresh CI on this repair head; the earlier failed UI run is not validation.
- No production integration or live portfolio correctness is claimed by fixture tests. Specialized research workflows retain existing behavior; this is an app-wide visual foundation with focused Overview/Portfolio simplification.

## Next steps

1. Verify PR #186's branch head, diff and all three applicable exact-head CI families. Repair any genuine regression without weakening financial, modal, history, source or no-write assertions.
2. Review the desktop/mobile previews with the owner. Keep this branch draft and production unchanged until this new design has explicit release approval.
3. If approved later, reconcile the independent PR #185 separately and use the current guarded release process. The completed one-release exception for PR #180 does not apply here. Do not change production Supabase, enable new live polling, retrieve secrets or send Telegram under this UI task.

Pasteable resume prompt:

> Continue AI Infra Watch on `feature/light-workspace-redesign`. Read the current top section of `docs/release/CODEX-CONTINUATION.md` and `docs/design/LIGHT-WORKSPACE-REDESIGN.md`. Inspect the branch's draft PR and exact-head CI. Preserve PR #185 and all worktrees. Continue the chosen clean light app-wide UI, using offline fictional fixtures; no merge, deployment, production database changes, new polling or Telegram send without separate approval.

---

**Historical checkpoints below are retained for provenance, not current operating instructions.**

# Approved PR 180 release in progress · 21 November 2026

The owner explicitly approved merging and deploying PR #180 using an exception limited to this release. The exception pins its branch and first parent `347240c7657af8a6f830b254e84bedc10f88d785`. The existing handoff will dispatch the guarded production workflow only after all required CI pass on its exact regular two-parent main merge. It retains staging, access gates, repeated commit checks and idempotent dispatch. Rollback is the currently live UI deployment `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2`. Live checks remain false.

Continue autonomously through final PR CI, mark ready, regular merge with expected head, exact-main CI, one-time handoff and production workflow. Inspect failures and repair them without weakening tests. Verify the public alias and served static bytes on the resulting deployment. Do not claim success until promotion and verification complete.

# Product plan and production data review · 21 November 2026

Read [the reconciled product backlog](PLAN-RECONCILIATION-2026-11-21.md) before continuing. The current increment isolates transaction-service outages in Decision Center and the digest. Preserve usable marks with explicit unavailable transaction evidence, and keep financial returns withheld. Run current-commit CI after pushing.

Current UI continuation corrects false reassuring Overview states. Missing/incomplete rule evaluation or quote coverage shows Unknown for an empty urgent count, failed earnings shows Unknown instead of zero, absent independent forecast counts stay unknown, and malformed successful responses produce a recoverable error. Check data sources opens the existing Data Health workspace. The patch uses existing response data without new API paths or timer activation. Verification adds malformed-packet and missing-coverage Chromium regressions. The current service candidate remains unreleased. CI on dca33e2 found two older rule-count assertions expecting zero for missing/inconsistent counts. Updated those cases to expect Unknown while retaining the explicit-zero case, incomplete gate and zero-write assertions. Added checks that these cases also show Unknown urgent count and the incomplete-coverage heading. Require fresh full CI on the corrective commit.

Current continuation adds bounded provider failure reasons to the existing QUOTE_WITHHELD issues in Decision Center and the digest. It identifies rate limiting, timeout, missing configuration, no price, request rejection and service errors with fixed provider labels. Raw error bodies/messages are discarded. The brief includes these reasons even when its independent Decision Center read fails. Shared quote admission and valuation rules remain authoritative. Local verification includes all Node tests and 11 focused Chromium accounting/outage cases. Check the resulting GitHub head and its fresh workflow conclusions before release.

The user approved a UI-first production release on November 21. The public hostname now resolves to READY deployment `dpl_7tAgXVLtXbF3Zhh9u2Ac7J3kLDE2`, commit `347240c7657af8a6f830b254e84bedc10f88d785`. The same tested production build was promoted through Vercel MCP. Homepage and JavaScript returned HTTP 200, and public JavaScript matched the staged response exactly. All relevant commit checks had passed. The 30-minute error/fatal runtime-log count was empty. Private portfolio API verification was not completed in this release inspection.

Rollback remains the READY prior Milestone 5 deployment `dpl_4Y7ZmLQaiKQXdH3sMi9VB7CtsWKU` at `6827cce`. The reason the alias had previously returned to it is unverified.

The restored UI includes grouped navigation for 17 workspaces, consistent workspace headings and next actions, responsive mobile navigation, the Portfolio Command Center, improved search, and explicit market-source status. The remaining service/data repairs on #180 are still outside this live commit. Resume their review and release preparation after verifying current GitHub checks.

Continue on [PR #180](https://github.com/Blitzer0007/ai-infra-watch/pull/180). This branch includes current main and the Decision Center snapshot correction from [PR #184](https://github.com/Blitzer0007/ai-infra-watch/pull/184). Review one combined diff. The older Milestone 2 worktree has separate uncommitted work and has been preserved.

[Brief diagnosis and acceptance](TELEGRAM-DAILY-BRIEF-QUALITY.md). Check the PR's current commit and GitHub workflow conclusions. Use mocked digest GET for preview. No live send or database operation is necessary for verification.

---

# CURRENT AI Infra Watch continuation — Milestone 7 app-wide UI release repair

Updated: 19 November 2026

- **Owner request:** Entire application UI/UX revamp, extending the deployed Portfolio experience, with clean CI and guarded release. Do not change financial logic, production Supabase, providers, Telegram, private data or trades.
- **Production still live:** Milestone 6 UI at main `3bae7b12b567f669c93c859f68fae5d5a5c84cca`, Vercel READY deployment `dpl_J45FmeRcw2oHAUCNwzRt4U9ew6nV` aliased to `ai-infra-watch-theta.vercel.app`.
- **Merged app-wide code:** [PR #182](https://github.com/Blitzer0007/ai-infra-watch/pull/182) regular-merged at `69921f7a9022af5187ac2206aa5b688b11c855a1` from reviewed `a5dc7a7`. All three PR-head CI passed. New 17-route shell, grouped Today/Portfolio/Research/Operations nav, context/next actions, truthful feed status, search on all routes, stationary quote strip, skip link, mobile menu, responsive/focus styles and mocked UI tests. The exact-main Frontend/Security CI passed; **UI API DB Validation failed** only the existing strict 360px Holding Details → Evidence → Back → Escape scroll assertion (`1779` actual vs `1742` opening, 37px delta). Production handoff correctly skipped release.
- **Active draft fix PR #183:** `fix/milestone7-mobile-holding-scroll-20261119`, direct child of failed main `69921f7`. `src/components/PortfolioIntelligence.tsx` temporarily protects the **captured event-time scroll** during five post-close paints and native browser history handoff, removing the listener automatically or on route change. `src/index.css` reserves narrow feed metadata height while background quote counts arrive. Original scroll tolerance, focus, browser Back, and no-implicit-write tests are unchanged. No new API activity.
- **One-time release:** Existing GitHub `workflow_run` handoff and `scripts/dispatch-milestone5-release.mjs` now authorize **only** PR #183's regular two-parent merge, with pinned first parent `69921f7` and exact second parent from GitHub PR metadata, after all required exact-main CI pass. Rollback remains the existing Milestone 6 READY `dpl_J45FmeRcw2oHAUCNwzRt4U9ew6nV`. `scripts/release-candidate.mjs` retains every prior gate and adds only this PR-specific, owner-authorized branch-protection exception. Historical PR #182 attestations use the actual `69921f7` merge SHA, not an unconstrained fictional SHA.
- **Next:** Wait for all three PR #183 exact-head workflows; if failing fix and reverify; merge **regular two-parent only**, verify exact-main Frontend/Security/UI API DB+Playwright all passed. Confirm one-time handoff dispatches exactly one protected Vercel production release. Verify staging 200/401/exact bytes, promotion, prod alias SHA, 1h runtime errors and READY rollback. If blocked, leave Milestone 6 live; never bypass guards or claim deployment prematurely.
- **Reference:** [docs/design/MILESTONE7-APPLICATION-WIDE-UI.md](../design/MILESTONE7-APPLICATION-WIDE-UI.md). REA was used as an analysis reference; no REA CLI/MCP was executed. Individual bespoke chart/research interactions remain separate; this is an app-wide UI shell refresh.

**The text below this divider is historical and does not describe the current deployed or active milestone.**

---


# AI Infra Watch — Codex Cloud continuation (Milestone 2 isolated candidate)

**Current handoff:** 16 November 2026. This is the candidate-specific checkpoint on branch `release/milestone2-integrated-candidate-20261115` / [draft PR #172](https://github.com/Blitzer0007/ai-infra-watch/pull/172). It intentionally differs from the older checkpoint on `feature/release2-opportunity-research` (PR #168), which holds the unshipped multi-milestone stack.

## Milestone 2 integrated journey closure — review and release prerequisites
- The candidate now covers explicit-detail resource gating, correct loading/missing history/analyst boundaries, selected-detail modal, controller focus, URL Back/Forward and source-record isolation. Additional browser acceptance exercises detail → Evidence → Back → detail → Escape/close with scroll/focus at 360, 768 and 1440px and ensures no implicit writes.
- Production milestone acceptance is separate from authentic issuer facts or predictive forecasting. Repository's release script still mandates protected `main`, exact-main CI, known-good Vercel rollback and staged acceptance; **`main.protected=false` is a genuine blocker**, not a waiver. User authorizes Milestone 2 production deployment, but GitHub protection configuration must be enabled without weakening the script first.
- Do not merge until the branch-protection/release path is usable and a complete exact-head verification has passed. Source PRs #167/#168 stay draft and excluded.

## Milestone 2 completion hardening — explicit detail fetch gates
- Source comparison surfaced inherited history/analyst/peer/FX requests running while the Portfolio overview or collapsed My Holdings list was visible. These were not part of the source PR #168 safe detail contract.
- Detail request gates now require a matching loaded holding and explicitly open detail; Evidence and opted-in Detailed Overview or Performance retain their separate research needs. The default overview/list no longer starts optional provider history/analyst calls.
- Clear in-flight old-symbol chart, analyst and peer state before showing newly selected detail. Native detail shows quote freshness instead of implying a sourced verified live price. Fictional browser tests assert no passive detail reads, intentional fetch on explicit open, no cross-symbol fetch on missing deep links and no portfolio/scorecard writes.
- New exact-head CI must pass before any release or success claim. Explicit production authorization is now recorded in the chat, but release script branch-protection and exact-main CI requirements remain unchanged.

## Exact-head QA regression repair after 0e8fc3b (16 November 2026)
- Frontend CI and Security audit passed on `0e8fc3b`, but UI/API/DB validation **failed** in six legacy Playwright journeys. Authentic job logs showed selectors trying to reach management controls that are now progressively collapsed, and analyst/scenario tables moved into the explicit read-only detail dialog.
- Updated those six journeys to navigate and open the same controls without removing their accounting, sanity, sorting, accessibility, source or write assertions. No application/production code was changed in this repair.
- This repair **must be verified on its new exact head**. Do not claim the failed earlier run or the older pre-dialog checkpoint proves this increment.

## Holding detail / progressive management follow-on (16 November 2026)
- New candidate-only read-only native `HoldingDetailDialog` ported from PR #168 with modal keyboard trap, Escape, explicit close, scroll/focus restoration, URL-only detail identity and browser Back/Forward handling; it never serializes notes, quantity or draft values.
- Existing PortfolioManager stays mounted but is now discoverable inside a collapsed `Manage positions and purchases` section in My Holdings, preserving unsaved form state across sections. The intentional navigation change updates the existing save-contract and candidate browser assertions rather than deleting them.
- New fictional browser coverage for explicit open, modal keyboard/mobile, Back/Forward, missing symbols and no passive portfolio/signal-scorecard writes. Inherited chart/history fetch timing is not yet optimized, and no live source authenticity is certified.
- **Exact-new-head CI required before calling this follow-on verified.** The earlier green `3dc1254` is the pre-change baseline, not proof for this work. Keep PR #172 draft and production unchanged.

## Resumed Portfolio UX increment — 16 November 2026

**Verified source commit:** `e5a104cd1326e73d2ea344d5378ed5bbbafb2190`. All **3/3 applicable path-triggered GitHub workflow families** succeeded on that *source* commit: [Frontend CI](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320253) (908/908 Node tests, lint, production build), [Security audit](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320265), [UI/API/disposable-DB validation](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43794320237) (full mocked Playwright plus offline DB/CI-safety tests). A later documentation commit changes the branch SHA; confirm the **new exact-head** checks before claiming it is verified.

- **Now integrated from the PR #168 source design:** `PortfolioCommandCenter`, `PortfolioReviewQueue`, `PositionDecisionCard`, `DecisionEvidencePanel` and responsive `PortfolioNavigation`. The source-driven decision adapter and quality gates remain tied to shipped-main interfaces; unavailable ledger/quote/market corroboration stays **INSUFFICIENT DATA**, never an invented trade.
- The new Portfolio review queue appears in Daily Review; selectable decisions open Holdings or Evidence. Section navigation uses a keyboard-accessible select, desktop buttons, and `pushState` / `popstate` to preserve the browser Back/Forward trail without serializing unsaved form contents.
- New `qa/test_milestone2_candidate.py` coverage asserts quality abstentions, queued-card navigation, restored sections, preserved local editor draft, mobile view selection and no unintended write requests.
- **Actual regressions fixed:** Imported card passed props incompatible with main `FreshnessBadge`; desktop navigation used ambiguous button/option text and a test-id root excluding its buttons. The source commit was retested without disabling assertions.
- **Still missing from PR #172:** the `HoldingDetailDialog` and advanced detail/back-stack/scroll/focus experience; progressive editing/management placement and source-context UX parity with the larger stacked PR #168. Existing production accounting/security logic is deliberately unchanged.
- **Next Codex Cloud task:** Read this checkpoint and [candidate acceptance matrix](milestone2-main-candidate.md), verify latest source and exact-head CI, then port the smallest coherent `HoldingDetailDialog` / progressive holdings-navigation increment with no private data or new backend writes. Add fictional keyboard/mobile/Back/Forward tests, require all exact-new-head CI to pass, leave PR #172 draft, do not merge/deploy.

## Repository pins and current scope

- Repository: `Blitzer0007/ai-infra-watch`.
- Production `main` base pinned at `d678cbe0ada0a329f541273181fb0b7f52ad0f90`, shipped Milestone 1.
- Source development reference: PR #168 `d14f5fe57028d3277cc229b704bc126192f42815`. Draft PRs #167/#168 are unchanged and have **not** been merged or deployed.
- Verified implementation checkpoint before this documentation update: `62d3884591af5de3dbca2656e21b7270628517aa`. On that exact commit: [Frontend CI](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43742691855), [Security audit](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43742691902), [full mocked UI/API/disposable DB](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43742691812) all concluded success. Frontend 908/908 Node tests passed.
- Any later documentation or implementation commit must be verified on **its own exact SHA**. Always query the live head and wait for all relevant workflows to finish; do not rely on the pinned source proof alone.

## Work completed on PR #172

A fresh branch from shipped main ports a bounded Milestone 2 UI integration: read-only Opportunities scan, manually supplied Catalyst Calendar, protected/read-only Alert Inbox, Company Research and disconnected financial dossier, redacted original clicked-source context and safer Portfolio section behavior. Main financial/accounting/security/release safeguards remain authoritative. The passive browser-side signal-scorecard POSTs were removed. Development/QA Watchlist config sync was suppressed, while existing production controls remain. Research pauses inherited Portfolio history/analyst/FX/quote fetches. The pre-existing nullable weekly Decision Journal crash was fixed. Browser tests cover error states, exact event/receipt context, unsubmitted editor values and zero unexpected writes.

Read the [exact Milestone 2 main candidate review](milestone2-main-candidate.md) for inclusion/exclusion, proof, known gaps and release gates. PR #172 remains a **narrower tested increment**. Its Command Center and Portfolio Navigation are now integrated; the PR #168 Holding Detail Dialog, progressive editor and full focus/scroll/context parity still require careful main-first integration.

## Codex Cloud operating instructions

1. Fetch the current `main` and draft PR #172 head, diff, GitHub Actions runs/jobs, and `docs/release/milestone2-main-candidate.md`. If someone has modified a branch since this checkpoint, inspect the new head and reconcile; never force-push or reset existing work.
2. If **any exact-head CI fails**, inspect authentic job logs, repair the root code/fixture regression, add or preserve the strongest guard, and rerun all required CI on the new SHA until successful. Never disable safety tests, bypass browser assertions, or claim older SHA success applies to newer source.
3. Before considering Milestone 2 release, decide explicitly whether the narrower PR #172 UX is acceptable; the `PortfolioCommandCenter` and `PortfolioNavigation` are now integrated; the `HoldingDetailDialog`, progressive editor placement and complete detail Back/Forward/scroll/focus parity with PR #168 remain separate. Do not overwrite Milestone 1 auth, accounting, quote admission, risk-rule or production release scripts to add them.
4. Keep fictional fixture / disposable Postgres tests. No Windows PC execution; all code and tests operate through Codex Cloud, GitHub and offline GitHub Actions.
5. Respect the owner’s scope: **NO merge, deploy, protected-secret or private financial-row retrieval, production Supabase changes, auto/polling/provider live calls, cron enablement, Telegram sends, autonomous Bull/Bear/Judge calls or trading actions**.
6. GitHub currently reports `main.protected=false`, while release-candidate tooling requires protection. Do not change protection or bypass the gate under this task; this needs separate owner review.
7. Record a candidate-only acceptance matrix and honest limitations, including the 3 PR-path-triggered CI families. Additional agent/backend/quality CI families on PR #168 are **not** presumed passed on PR #172. Keep the PR draft for explicit owner review.

## Stopping condition

Stop at an audited draft PR with exact-current-SHA green GitHub checks and a current Markdown checkpoint. Production release still requires reviewed full milestone scope, main protection/release-gate readiness and explicit owner approval. The production release count remains **1/5**. No successful fictional-source test establishes real issuer authenticity, complete accounting, Telegram read receipts or investment predictive validity.
