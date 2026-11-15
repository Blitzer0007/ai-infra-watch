# AI Infra Watch — continuation draft (Codex / ChatGPT)

Updated 15 November 2026 UTC. This file is a living checkpoint for Codex Cloud and ChatGPT with connected GitHub tools. It is maintained proactively because an agent cannot reliably detect a quota cutoff. Read the latest copy on the feature branch, not just an older pasted copy.

## Repository and branches

- Repository: `Blitzer0007/ai-infra-watch`.
- Active development: `feature/release2-opportunity-research`, draft PR [#168](https://github.com/Blitzer0007/ai-infra-watch/pull/168), stacked on `feature/release1-portfolio-command-center` / draft PR #167. Do not retarget or merge the unfinished stack as a shortcut.
- Cloud workspace: `/workspace/ai-infra-watch`. No Windows execution is required.
- Source baseline before this checkpoint: `562d9ddc3a6c1be4f86471f4e9eea9f8c6a0a101`; 1,754 Node tests and all seven CI workflows passed on that exact baseline. Those results do not certify subsequent source changes.
- Previous verified Milestone 2 head: `378db7a8810e7147edc240a0d259124923f62e0f` (all seven CI workflows passed).
- Accounting implementation source: `7c5bc59509a87b7475e37fa62dd9ff8689b1ac42`; a subsequent test-fixture compatibility checkpoint is included at the current PR head. The first full UI CI run exposed seven fixture-coupling failures; do not report that source head as all-green.
- Initial Milestone 2 source commit: `dbf0d1f36392464735b8da3d96f2cdeb7c80fba4`. The current checkpoint also includes legacy-link reload canonicalization; obtain the latest implementation from the current feature/PR head rather than stopping at that initial commit.
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

Checkpoint: **reviewed per-position accounting and historical abstention implemented and locally verified; not deployed**. The previous company research/navigation checkpoint remains intact. Read the latest PR head and exact-head CI rather than assuming the previous head certifies this implementation.

Completed in this increment:

- `reviewLoadedPositionAccounting` reviews original loaded receipts itself, binds the displayed holdings to original quantities, and folds exact remaining ledger cost into conditional per-position P&L and scenarios. It never mutates raw holdings/trades or grants accounting/source/history/decision authority.
- Unknown fees/currency/order, quantity gaps or unavailable original trades withhold cost/P&L/scenarios. Independently admitted current quote values stay separate; partial coverage retains no subset weights. Missing snapshot cost cannot override supported original trade cost, and a missing original quantity cannot become zero.
- Exact scenario cost avoids rebuilding cost from a rounded/divided average. Null, observed zero, losses, fractional quantities and tiny costs are kept distinct; finite bounded arithmetic and tiny-money formatting apply to the reviewed view.
- Unsupported portfolio historical returns/pressure reconstruction, benchmark comparisons, peer counterfactuals and historical-high exit targets show unavailable explanations. Their financial consumers and additional maximum-history requests are removed from this UI. The explicit descriptive price chart/correlation remains separate.
- The newer Portfolio dialog/navigation/editors, independent `research_symbol`, scanner return filters and shipped data-free auth check are preserved.
- Shared positive browser mocks now contain fictional original-ledger receipts; complete quote declarations are an explicit `declared_quotes=True` opt-in for scenario/table tests. Existing source-gap and controlled council-feed tests keep their incomplete-quote default. Missing-data valuation fixtures supply their own original quantity/trade receipts. These declarations are test inputs, never proof of authentic source/history coverage.

Files to inspect:

- `src/utils/reviewedPortfolioAccounting.ts`, `portfolioPositions.ts`, `reviewedPositionAccounting.test.ts`: strict per-position projection and exact conditional scenario cost.
- `src/components/PortfolioIntelligence.tsx`: projected rows/scenarios, abstention explanations and preserved newer navigation.
- `qa/test_reviewed_positions.py`, `test_portfolio_valuation.py`, `test_accounting_consumers.py`: fictional accounting/valuation integration; new suite in `qa-validation.yml`.
- `qa/test_ui.py`, `qa/fixtures/milestone1-portfolio.fictional.mjs`: shared positive fixtures reconciled from the production safety backport, preserving newer test flows.
- `docs/release/release2-reviewed-position-accounting.md`: review, limits and evidence.
- Previous navigation: `companyResearchNavigation.ts`, `CompanyResearchWorkspace.tsx`, scanner/card components and `qa/test_company_research_navigation.py`.

Verification: **1,784 Node tests passed** (21 new per-position cases); 60 focused original-input accounting cases also passed after the final explicit-null guard cleanup. **102 distinct focused browser cases passed** across the new view, existing accounting/valuation, dialog, navigation, company research and shared UI/exploratory flows. A sortable-column selector and shared positive-mock timestamp precision were corrected; the final new-suite and affected UI/exploratory reruns passed without weakening gates. The full CI run then exposed seven legacy fixture-coupling failures; these were corrected by scoping complete quotes to positive tests and supplying original valuation receipts. The follow-up run passed **29 cases**, with **one production-build council check skipped locally** because its separate preview URL was not supplied (the full CI job supplies it). TypeScript/build/tracked-source security/32-file migration manifest/whitespace checks passed. Existing main-bundle warnings remain (~1,760 kB). Exact saved-head CI is recorded in draft PR #168; inspect its current SHA/status, not previous-head evidence.

Next concrete increment — do this before a Milestone 2 release:

1. Verify this saved checkpoint and exact-head CI on draft PR #168 before starting further edits. Keep the PR draft; do not merge or deploy it.
2. Integrate retained Calendar/Inbox reading context with company research. Inspect `src/components/calendar/CatalystCalendar.tsx`, `src/components/alerts/AlertInbox.tsx`, App routing and the research navigation contract. Calendar/Inbox filters currently live in component state and can be lost when navigating away.
3. Add bounded URL-based view-state/Back-Forward restoration and fixed internal issuer/return links using already loaded context. Preserve event precision/corrections and alert delivery/source explanations; never infer read/acceptance or complete source coverage. Do not serialize alert text, financial rows, arbitrary URLs or credentials into links.
4. Verify return flows with fictional fixtures, loading/partial/error states, keyboard focus and 360/768/1440px layouts. Calendar stays loaded-snapshot only; Inbox server reads remain explicit. No automatic feed refresh, model request, polling, retry or send.
5. Update this handoff and integration review after each meaningful checkpoint. Broader remaining Portfolio/Opportunities/dossier/calendar/inbox acceptance still gates Milestone 2. Production stays at Milestone 1 until a later release is ready and authorized.

## Remaining integration/safety work

- The main-based Milestone 1 accounting compatibility safeguards are now reconciled in the newer Portfolio view in this checkpoint. Keep the strict projection and historical abstention while integrating additional contexts; do not copy the older whole component over the newer UI.
- The data-free auth handler/check is now reconciled from production main. Keep it intact; broader integrated Portfolio acceptance remains a release prerequisite.
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
