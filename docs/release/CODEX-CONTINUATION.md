# AI Infra Watch — continuation draft (Codex / ChatGPT)

Updated 15 November 2026 UTC. This file is a living checkpoint for Codex Cloud and ChatGPT with connected GitHub tools. It is maintained proactively because an agent cannot reliably detect a quota cutoff. Read the latest copy on the feature branch, not just an older pasted copy.

## Repository and branches

- Repository: `Blitzer0007/ai-infra-watch`.
- Active development: `feature/release2-opportunity-research`, draft PR [#168](https://github.com/Blitzer0007/ai-infra-watch/pull/168), stacked on `feature/release1-portfolio-command-center` / draft PR #167. Do not retarget or merge the unfinished stack as a shortcut.
- Cloud workspace: `/workspace/ai-infra-watch`. No Windows execution is required.
- Source baseline before this checkpoint: `562d9ddc3a6c1be4f86471f4e9eea9f8c6a0a101`; 1,754 Node tests and all seven CI workflows passed on that exact baseline. Those results do not certify subsequent source changes.
- Previous verified Milestone 2 head: `8f22ee3ae49c02130dbd9a515359657035ba743c` (all seven CI workflows passed; 1,784 Node cases). Earlier navigation head: `378db7a8810e7147edc240a0d259124923f62e0f`. These results do not certify later edits.
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

Checkpoint: **Exact Calendar/Inbox opened-record context added; new-head CI pending; not deployed**. Earlier navigation checks are retained. Accounting and prior navigation checkpoints remain preserved. Inspect the latest PR head and exact-head CI before continuing.

Completed in this increment:

- Closed Calendar/Inbox URL contracts retain view enums across Back/Forward and company return links. Search text is bounded local browser-entry state, not copied into links. Only valid symbols and view options reach research; unknown/unconfigured company handling remains fail-closed.
- App-session memory retains expanded record explanations, origin focus/scroll, loaded Inbox delivery rows, failed refresh explanations and local acknowledgements. Reload loses source rows/expanded state; source reads remain manual. Changed windows invalidate the prior server cache, leaving aborts a pending request, and Back/return does not replay it.
- Calendar date precision, revisions/cancellations and Inbox unknown/uncertain/conflicting delivery semantics stay intact. No source authenticity, completeness, accounting, model or decision authority is granted.
- Portfolio-specific quote refresh is inactive in the research section and resumes in other Portfolio sections. Its cancelled loop stops remaining symbol requests. Existing app-wide bootstrap/refresh remains unchanged; no new feed/history/provider/model polling or sender activation is added.
- The current dossier remains manually opened and source-unconnected. All new development verification uses fictional inputs/intercepted transports in Cloud.

Files to inspect:

- `src/utils/reviewWorkspaceNavigation.ts` / `.test.ts`: bounded views, closed issuer/return paths, private local query and app-session types.
- `src/hooks/useReviewWorkspace.ts`: local query/history and reading-state restoration.
- `src/components/calendar/CatalystCalendar.tsx` / `CatalystEventCard.tsx`, `alerts/AlertInbox.tsx`: origin actions, retained filters/explanations and manual reads.
- `src/App.tsx`, `PortfolioIntelligence.tsx`, `portfolio/CompanyResearchWorkspace.tsx`: session ownership, controlled navigation, return focus and quote-loop section guard.
- `qa/test_review_workspace_navigation.py`: new intercepted integration suite, included in `qa-validation.yml`. Existing calendar assertions now count external source links separately from internal research links.
- `docs/release/release2-review-workspace-navigation.md`: scope, limits and evidence.

Validation: **1,792 Node tests passed** (eight new routing/privacy cases); TypeScript, production build, tracked-source security, unchanged 32-file migration manifest and whitespace checks passed. **61 distinct browser cases passed**, including the final eleven-case new suite after the hook updater review, across Calendar/Inbox/company research/Portfolio navigation/holding detail. The quote-resume regression waits for the actual mocked symbol response; a premature network-idle assertion was corrected. A further **37 financial compatibility cases passed** across valuation, conditional accounting, scenarios and sortable tables, for **98 distinct browser cases** in this checkpoint. Existing main-bundle warnings remain (~1,767 kB); the dossier stays split. Record actual final evidence and inspect exact saved-head CI on PR #168; previous-head checks do not certify later edits.

Next concrete increment — before a Milestone 2 release:

1. Verify the saved checkpoint and exact-head CI on draft PR #168 before new edits. Keep it draft; do not merge or deploy it.
2. Add company research context for the exact Calendar/Inbox record opened in this app session. Keep the selected record reference and contents in App-session memory, not URLs; use bounded allowlisted display fields rather than raw provider/alert bodies.
3. Show original event date precision, certainty/correction and source gaps, or separate browser-detection/server-delivery evidence. Do not infer a read receipt, correlate episodes by symbol/date, grant financial/decision eligibility or synthesize facts. On reload/unknown origin show unavailable context rather than selecting another record.
4. Verify multiple records for one symbol, Back/Forward/return focus, missing/loading/error and 360/768/1440px keyboard/mobile stories with fictional fixtures. No automatic feed/history read, model run, retry, schedule or send.
5. Continue broader Portfolio editing/source/conflict/context acceptance. Auxiliary disclosures outside record explanations and unsupported live/source/history integrations remain pending. Update this file/review/register after meaningful checkpoints. Production stays at Milestone 1 until a later release is ready and authorized.

## Checkpoint — exact Calendar/Inbox record context (15 November 2026)

**Implementation:** On draft PR #168, added `src/utils/reviewRecordContext.ts` (and five fictional unit cases), `src/components/portfolio/ReviewOriginContext.tsx`, and updated Calendar/Inbox links, App session navigation, and Company Research rendering. The clicked record is independently sanitized and bounded; App keeps at most 100 entries in memory. The navigation history carries only a random opaque key (never raw bodies, episode IDs or provider message IDs); a direct/reloaded research view cannot reconstruct missing context. Calendar shows original precision/confirmation and correction limitations. Browser detection and server delivery remain separate; a provider message ID is not a read receipt. The manually opened dossier stays source-unconnected. No new provider calls, writer, schedules, polling, Supabase changes or Telegram sends.

**Tests:** `src/utils/reviewRecordContext.test.ts` covers distinct same-symbol events, bounded corrections/credential redaction, alert source separation, provider receipt uncertainty and invalid input. `qa/test_review_workspace_navigation.py` now includes five fictional browser scenarios (three responsive widths and two inbox flows), including Back/Forward and reload failure-of-context. **This ChatGPT session did not execute Node, TypeScript, Python or browser tests.** Baseline `b2c5ef2` had seven successful workflows; that evidence does not certify these edits. Inspect the exact new head's GitHub CI and fix genuine regressions before additional implementation. GitHub source commits were made in small connected-tool updates, not a cloud workspace build.

**Next:** Verify the new head and repair failed tests if any; expand integrated Portfolio editing/source/conflict/context checks, including auxiliary disclosure retention and mobile/keyboard acceptance. Preserve main Milestone 1, the draft PR stack, and all no-production restrictions. The public `@aravind` Event Risk Radar is separately specified in `docs/release/release2-event-risk-radar-aravind.md`; it is not activated.

## Milestone 2 all-in-one integration acceptance checkpoint — 15 November 2026

This coherent candidate finishes an additional **fixture-based Milestone 2 integration pass** on draft PR #168. Read [the acceptance matrix](milestone2-integration-acceptance.md) alongside this handoff. No claim of complete source truth or production readiness is implied.

- `PortfolioManager.tsx` and `PortfolioIntelligence.tsx`: expose a visible unsaved holding-management editor/purchase session on section navigation, preserving existing mounted forms and requiring explicit Save/Cancel. No automatic save, storage or network request was introduced.
- `CompanyResearchWorkspace.tsx`: show the boundary between an original opened Calendar/Inbox record and the independent, unconnected financial dossier; a provider receipt is not a read receipt or corroborated investment event.
- `qa/test_milestone2_integrated.py` and `qa-validation.yml`: exercise actual browser journeys with fictional/isolated data, several same-symbol events, source/receipt uncertainty, 360/768/1440px editor retention, independent dossier disclosure, direct-entry failure and zero request writes.
- The previous head `8b5a2a2896c86bcaed39ad5033bdd503df2bd190` was confirmed **7/7 required workflows passed** before beginning this batch. The new commit must be verified independently; do not advance to another milestone or claim green until that exact SHA succeeds.
- The full draft stack is **not an isolated Milestone 2 release candidate**. Compare with current production `main`, preserve Milestone 3–5 work on branch, and obtain a separate review/authorization before any promotion. Live provider truth, ledger completeness, external model usefulness and historical forecasts remain outside fixture certification.

**After exact-head success:** finish only any outstanding Milestone 2 blockers discovered during integration, then prepare a read-only isolated release-candidate review and compatibility matrix. Remain draft; no merge, deployment, production-data reads/writes, Telegram or live polling.

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

## Verification-first development gate (standing user requirement)

**Do not advance milestones, declare completion, mark a checkpoint verified, or start the next feature batch until all required GitHub CI workflows on the exact current commit SHA have completed successfully.** Always monitor checks through terminal conclusions: running/queued/pending/cancelled/skipped/neutral are **not** equivalent to passed; investigate any missing or unexpectedly skipped required checks. If any required test or workflow fails, inspect its jobs/logs, fix the underlying regression without weakening tests/security/financial integrity gates, push a coherent fix, and repeat the complete exact-head verification cycle until green. Do not rely on green checks from an earlier commit; each code or documentation change advances the head and needs its own validation. Avoid sequences of tiny commits that repeatedly cancel required checks; prefer one coherent tested checkpoint. Do not merge or deploy under this rule without separate explicit owner approval. If infrastructure or access prevents verification, record **BLOCKED / NOT VERIFIED** with the exact SHA and cause, preserve the draft PR, and do not claim passing or continue into the next milestone.

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
