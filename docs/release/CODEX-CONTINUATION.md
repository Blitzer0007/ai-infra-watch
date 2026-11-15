# AI Infra Watch — continuation draft (Codex / ChatGPT)

Updated 15 November 2026 UTC. This file is a living checkpoint for Codex Cloud and ChatGPT with connected GitHub tools. It is maintained proactively because an agent cannot reliably detect a quota cutoff. Read the latest copy on the feature branch, not just an older pasted copy.

## Repository and branches

- Repository: `Blitzer0007/ai-infra-watch`.
- Active development: `feature/release2-opportunity-research`, draft PR [#168](https://github.com/Blitzer0007/ai-infra-watch/pull/168), stacked on `feature/release1-portfolio-command-center` / draft PR #167. Do not retarget or merge the unfinished stack as a shortcut.
- Cloud workspace: `/workspace/ai-infra-watch`. No Windows execution is required.
- Source baseline before this checkpoint: `562d9ddc3a6c1be4f86471f4e9eea9f8c6a0a101`; 1,754 Node tests and all seven CI workflows passed on that exact baseline. Those results do not certify subsequent source changes.
- Discover the latest checkpoint SHA from the draft PR head or `git log -1 --format=%H -- docs/release/CODEX-CONTINUATION.md`; a file cannot embed its own future commit SHA.

## Production — Milestone 1 completed, 1/5 releases

- Live: https://ai-infra-watch-theta.vercel.app
- Production main: `d678cbe0ada0a329f541273181fb0b7f52ad0f90`, from merged PRs #170 and #171.
- Verified deployment: `dpl_27Ae6E5jH5f8vxBWFTAFcRZYh2Vc`; both canonical production aliases mapped to this same tested build.
- Rollback retained: `dpl_A9SyRmrvss5zgio2i2hCWAcr4JP7` / main `d59cb9191d2d33b4e698b7942f31bf5f7557da9c`. A rollback was not executed.
- Main CI: [Frontend](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43702764529), [UI/workflow/disposable DB](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43702764526), [Security](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43702764531) passed. Final main had 758 Node cases; the isolated candidate also passed 89 offline browser/workflow cases.
- Staged/live homepage bytes matched; JS/CSS served 200; the data-free `/api/auth?check=release` check returned the expected 401 and ordinary auth GET returned 405. The fetch proxy withheld the 401 body. The scoped auth runtime-error aggregate was empty.
- The owner explicitly approved PR #170/#171 readiness, merges and staged promotion while deferring main protection and production-environment reviewer/branch settings for this release. Temporary Vercel domain assignment was held during staging and the tested production build was manually promoted. The regular workflow still requires protected main.
- Do not probe `/api/portfolio` or `/api/decision-center` in production: automatic review blocked those requests because they could retrieve private financial rows. Use the data-free authentication check for future approved release verification.
- Canonical release evidence is retained in the merged [#170](https://github.com/Blitzer0007/ai-infra-watch/pull/170) and [#171](https://github.com/Blitzer0007/ai-infra-watch/pull/171) descriptions.

## Current task and checkpoint

Continue **Milestone 2 — integrated Portfolio core**. No second release is authorized merely by this development request. Maintain this handoff so a different ChatGPT model can resume safely using repository state.

Checkpoint: **company research navigation implemented and locally verified; not deployed**. The documentation-only checkpoint `8589c84d7ea9b74eaabe244f035777f9554b39f4` was pushed before implementation so a remote continuation was already available. This newer checkpoint contains the implementation; inspect the current PR #168 head and CI before continuing.

Completed in this increment:

- Independent `research_symbol` prevents an unheld Opportunities candidate from silently becoming the first holding. Invalid/ambiguous/unknown symbols show an explicit gap; no substitute dossier appears.
- `CompanyResearchWorkspace.tsx` uses the current configured watchlist plus bounded loaded holdings, separate membership status, a labelled picker and Back/Forward support. It reuses the manual, lazy, source-unconnected dossier without any provider/model/financial request.
- Scanner search/status/display limit use a bounded URL contract and a fixed return route. A lost frozen snapshot is not recreated or automatically rescanned. Positions, notes, credentials and arbitrary return URLs are not copied into generated links.
- The shipped `api/auth.js` data-free check and `server/api/release-access-check.test.js` were carried forward from production main without overwriting the newer Portfolio UI.
- A root `AGENTS.md` now requires this continuation file to be kept current at checkpoints. Release plan/register headings now point to the actual shipped Milestone 1 evidence.

Files to inspect:

- `src/utils/companyResearchNavigation.ts` and `.test.ts`: bounded URL/return contract and five deterministic cases.
- `src/components/opportunities/OpportunityScanner.tsx` / `OpportunityCard.tsx`: view-state retention and dossier links.
- `src/components/portfolio/CompanyResearchWorkspace.tsx`: independent read-only company destination.
- `src/components/PortfolioIntelligence.tsx` / `src/App.tsx`: current watchlist/context wiring.
- `qa/test_company_research_navigation.py`: ten intercepted integration cases; added to `qa-validation.yml`.
- `docs/release/release2-company-research-navigation.md`: implementation review and limits.

Verification at this checkpoint: **1,763 Node tests passed**, TypeScript/build/security/32-file migration manifest/whitespace passed; **51 focused browser cases passed** across the new flow, Opportunities, holding dialog, dossier and Portfolio navigation. The source security scan ran after new files were tracked. Existing large-bundle warnings remain. These are real Cloud checks; final saved-head CI is recorded in draft PR #168 and must be checked there, not inferred from a previous commit.

Next concrete increment — do this before a Milestone 2 release:

1. Reconcile the shipped per-position accounting safeguards into the newer Portfolio flow. `tradePerformance` is strict, but `rawAnalyses` still starts from stored holding average cost. Review `PortfolioIntelligence.tsx` near `rawAnalyses`/`tradePerformance`, `reviewedPortfolioAccounting.ts`, `loadedLedgerReview.ts`, and production main's older component for the intended abstention. Preserve the newer navigation/dialog; do not copy the whole older UI.
2. Fold reviewed original-ledger remaining cost into per-position conditional P&L/scenario displays. Unknown fees/currency/order/quantity or unavailable trades must withhold those financial fields; admitted quote valuation/complete-denominator weights remain separate. Never mutate raw holdings or saved rule configuration to make calculations pass.
3. Carry forward historical portfolio/peer return and historical exit-target abstention. Remaining feature paths still call legacy historical/counterfactual calculators without supported full-history/source contracts. Add visible unavailable explanations and fictional regressions rather than declaring source coverage complete.
4. Finish the remaining calendar/inbox/dossier context and accessibility stories without automatic provider reads or live activation. The new dossier remains explicitly unconnected; it is not financial enrichment or verified issuer research.
5. Update this file/review/register, run meaningful focused plus required checks, commit/push a coherent checkpoint to draft PR #168. Keep production at Milestone 1 until a later release is actually ready and authorized.

## Remaining integration/safety work

- The main-based Milestone 1 backport included compatibility changes in the older production Portfolio UI. Carry those safeguards forward while preserving the newer feature navigation: ledger-reviewed per-position cost/P&L, safe tiny/null formatting, and withholding unsupported historical/peer return claims. Do not copy the older whole component over the newer UI.
- The data-free auth handler/check is now reconciled from production main. Keep it intact; the remaining Portfolio compatibility work above is still a release prerequisite.
- Milestone 2 still needs broader Portfolio/Opportunities/dossier/calendar/inbox user stories, source/conflict explanations, retained reading/editing state, missing/loading/error cases and keyboard/mobile acceptance.
- Real issuer/source acquisition, authoritative full ledger/corporate-action evidence, live NVIDIA/JEV effectiveness and forecast outcomes remain unverified. Fictional fixtures, hashes and declarations do not establish those facts.
- Other milestones and historical scope: `release2-five-deployments.md`, `release2-remaining-work.md`, `release2-engineering-plan.md`. Older statements saying no milestone has shipped are superseded by this checkpoint.

## Standing preferences and model continuity

- REA is primarily for feature mirroring/reference analysis, not general development work. Existing pinned/static comparisons do not establish complete reference-runtime parity.
- JEV credits are in the official TypeSafe console. The configured NVIDIA shortlist uses `openai/gpt-oss-20b` at `https://integrate.api.nvidia.com/v1`; do not append OpenRouter's `:free` suffix or assume live availability/usefulness. No production key retrieval or unapproved provider call is implied.
- A different ChatGPT model is fine for continuation: repository state, contracts, tests and actual CI are authoritative. Re-read the checkpoint and diffs; do not invent missing conversation history or treat illustrative fixtures as verified financial facts.

## Working safely and testing

- Preserve all existing changes and draft branches; inspect status before editing. No force pushes, resets or discards.
- No production secrets, private financial-row retrieval, Supabase modifications, live API polling, new schedules/recipients or Telegram messages. Use fictional fixtures and intercepted transports. Do not weaken source/accounting/decision gates or introduce cost/history-price fallbacks.
- The connected GitHub service supports repository/PR operations. Native `gh` requests and native external `curl` were forbidden in this Cloud session. The connected Vercel tools were used for the approved release; do not search local credentials or read environment-variable endpoints to work around access.
- Node/npm and Python are available in Cloud. Standard checks: `npm run test:unit`, `npm run lint`, `npm run build`, `npm run security:audit`, `npm run migration:verify`, `git diff --check`.
- The security scanner reads **tracked** files. Scan after adding new fixture files to Git; never weaken the scanner to accept test literals. Use clearly fictional credentials assembled by the test, never actual credentials.
- Offline browser server: `env -i PATH="$PATH" VITE_QA_MODE=true node_modules/.bin/vite --host 127.0.0.1 --port 3000 --strictPort`. Check whether this task's server already exists first; do not terminate unrelated processes.
- Python: `/workspace/venvs/ai-infra-watch/bin/python`. Browser: `/usr/bin/chromium`. Run selected tests with sanitized environment and `QA_BASE_URL=http://127.0.0.1:3000 QA_UI_MOCKS=true QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium`; never set `QA_ALLOW_LIVE=true` for development tests.
- A ChatGPT chat without a Cloud shell should inspect/edit the feature branch using GitHub tools, keep PR #168 draft, and rely on real CI for runtime evidence. Do not claim local checks ran when no runtime was available.

## Paste into another ChatGPT chat

> Continue AI Infra Watch in repository Blitzer0007/ai-infra-watch. Read the latest docs/release/CODEX-CONTINUATION.md from branch feature/release2-opportunity-research and inspect draft PR #168 before changing anything. Preserve existing work. Resume the recorded Milestone 2 next steps using Codex Cloud or connected GitHub tools; do not run code on my Windows PC. Keep the Markdown checkpoint current and push coherent checkpoints. Do not deploy, merge to main, access production secrets/private financial rows, modify Supabase, enable live polling or send Telegram messages. Report real tests and any tooling limitations honestly.
