# AI Infra Watch · Milestone 4 continuation
Updated: 18 November 2026

## Baseline
- Main `77db3ca4f7f55b032935f20b7fde131f40caf940` is the exact released, 6/6-green Milestone 3 production commit.
- The next target is forecast evaluation and operational transparency. The current `/api/forecast-validation` reads only verified forecasts and therefore does not disclose pending/due/malformed or independent-scoring denominators.
- Work branch: `feature/milestone4-forecast-evaluation-20261118`. Initial increment is a read-only, bounded forecast-evaluation lifecycle protocol, unit tests, server API contract, and display in Forecast Validation / Data Health.

## Evaluation protocol rules
- Count **pending not due**, **pending due for UTC-calendar review**, and **pending with unknown target** separately. An elapsed date never proves that an adjusted trading-session outcome exists.
- Separate **verified reported** from **verified scorable**. Scoring requires a parseable time-zoned creation timestamp, strictly later valid target date, verification at/after target and no target in the future, safe horizon and finite outcome/median. Unusable records are excluded with aggregate reason counts, not silently cast to zero.
- Use the pre-existing ticker/horizon non-overlapping window selector for descriptive score denominators. Overlap filtering does not establish market-independent observations across symbols and horizons.
- Only valid ordered percentile pairs contribute to interval coverage. Display numerator, denominator and Wilson bounds, including **unavailable** where no comparable cases exist.
- Source-declaration counts and stored verified status do not authenticate issuer feeds or source availability at forecast creation; scoring is descriptive and **never trade eligible**.
- Include latest-window truncation status and permanently mark the returned window **not the full forecast universe**. No historical outcome is manufactured to satisfy the 50-sample gate. Existing validation metrics remain intact for backwards compatibility.
- API does not expose private rows, raw evidence snapshots, credentials, symbols or model payloads in the new protocol response. Use the existing authorized read-only Forecast Validation endpoint.
- **No scheduler, DB schema/row write, Telegram sender, model execution, production secrets or new provider requests** in this increment. GitHub CI is the validation runtime; nothing runs on the user's Windows PC.

## Further work before Milestone 4 release signoff
- Review independent historical/out-of-sample cohort availability and adjusted close/point-in-time provenance; do not claim real model accuracy without this.
- Add stable operational observability for forecast scheduler, data lag, quota and job outcomes using existing read-only access gates, keeping sender and model activation separate.
- Extend browser and API tests with fictional due/verified/unknown cohorts, incomplete result windows, and no-private-data/no-write claims.
- Complete exact-head CI and review again before production merge. Milestone 4 deployment is a separate release decision; Milestone 3 remains rollback.

## Authenticated lifecycle API and UI integrated
- The existing private `GET /api/forecast-validation` adds an independently bounded read-only SELECT of recent pending/verified rows. The protocol uses at most 1,000 rows; any transport/data failure yields `evaluationProtocolStatus: unavailable` without changing the existing verified-history metrics.
- The shared presentation-only `ForecastEvaluationLifecycle` component appears in Data Health and the per-ticker Forecast Validation panel, with due/pending/unknown, reported/scorable/non-overlap counts and explicit score denominators. It performs **zero additional browser requests**, writes, model/provider calls or background work.
- Counts are *window observations*, never all-time population counts. Imported reports expose no raw forecast/evidence rows or tokens.

## Fictional acceptance / CI integration
- Added a real access-gated endpoint contract test under `server/api/` to check private token protection, GET-only behavior, bounded second SELECT, zero raw evidence DTO leakage, and fail-closed lifecycle status without disrupting verified metrics.
- Added `src/utils/forecastEvaluationProtocol.test.ts` with pending/due/future, invalid/overlap, missing outcome, confidence denominator and source-data exclusion cases.
- Added a 360/768/1440px mocked browser journey in `qa/test_milestone4_candidate.py`: rendering, zero passive writes, no network on inspection, transparent uncertainty, invalid source outcome and unavailable fallback.
- CI acceptance includes the new browser test in the existing mocked UI API DB workflow. The main source tree and production deployment stay unchanged until separately approved.

## Newly published transitive security advisory — launch blocker

The initial Milestone 4 Frontend CI failed *before* running TypeScript/unit/build, at its unchanged `npm audit --audit-level=low` step. As of 18 November 2026, GHSA-fc5q-39xc-vjpf / CVE-2026-112366 affects picomatch through 4.0.7; the official package's published latest is 4.0.7 and no official patched release was identified. It is inherited through the existing Vite/fdir/tinyglobby dependency tree and is not caused by Milestone 4 code.

**Do not** waive `npm audit`, use unreviewed forks, perform production deployment or claim security CI green. To still identify correctness defects, the existing isolated **mocked UI/API/DB** GitHub workflow now runs `npm run lint`, `npm run test:unit` and `npm run build` *before* launching its browser and disposable DB jobs. The independent Frontend CI advisory gate remains unchanged, required and failing until safely remediated.

## First integrated CI findings and correction

PR #174 `343c659` passed the complete mocked UI/API/DB browser workflow and the repository security script. Frontend CI failed before typecheck at the newly disclosed, as-yet-unpatched transitive picomatch advisory (GHSA-fc5q-39xc-vjpf). The next head `b19e454` added independent TypeScript/unit/build verification without modifying that audit. TypeScript passed; 995/996 unit tests passed; the single failure was a mistaken fictional test expectation: one recorded -2% outcome was **not** inside its copied +1% to +9% middle interval. The correct coverage is 1/2, not 2/2. Updated only that assertion, leaving actual scoring logic and all security gates unchanged.

No production merge or deployment is authorized by this checkpoint; the inherited npm advisory still blocks signoff.

## Standard Codex continuation updated
The root release handoff `docs/release/CODEX-CONTINUATION.md` now begins with the current Milestone 4 PR #174 and distinguishes the archived Milestone 2 instructions, the already released Milestone 3 baseline, and the new unpatched advisory. It preserves all historical context below a divider. Added a unit regression proving 5D/20D horizon overlap is handled independently *within* horizon but does not justify cross-horizon market independence.

## Read-only forecast operations reconciliation (18 November 2026)

Added a *pure*, source-limited `summarizeForecastOperations` observer and a mobile-first Data Health panel that combines already loaded job-health telemetry with the bounded forecast-evaluation lifecycle. It distinguishes the last recorded forecast scheduler result, unverified/missing scheduler telemetry, due/pending/unknown target counts, unusable verified outcomes and recent-window truncation. A successful scheduler run is **not** an assertion of valid outcomes, current data, complete DB coverage, cross-worker budget enforcement or prediction accuracy.

No new backend fetch, poller, cron, database write, model/provider usage, Telegram message or trade path was introduced. Hardened the Forecast Validation text so it does not claim auto tracking is running merely because the UI can display the scheduler. Pure unit tests cover absence, skipped/stuck runs, due-but-unverified reports, truncation and secret-bearing inputs. Exact-current-SHA CI is required after this commit. The known unfixed picomatch audit remains a release blocker.

## Browser acceptance added for operational transparency

The existing Milestone 4 Playwright suite now asserts the read-only operations panel at 360/768/1440px, verifying the due count, no fabricated scheduler success and no extra writes. Additional fictional browser cases provide a `completed/success` forecast scheduler with **real due/unscorable records** and require a visible review warning; a second exercises both missing telemetry streams and requires explicit `unavailable`, never zero/success. No tests were skipped or weakened.

## Historical evidence admissibility checklist (candidate)

Added a pure zero-request historical study readiness observer and read-only Data Health panel. It compares **only already fetched** forecast lifecycle aggregates with the existing private metadata archive inventory. It makes the missing proofs explicit: original publication as-of decision time, adjusted-close/corporate-action validity, point-in-time index membership, and prospective holdout/leakage evaluation. Even a reported `historicalGate.status=READY` or indexed SHA-256 **cannot independently certify** these facts. Unknown metadata is not converted into zero records. The panel never downloads private archives and never emits raw object paths, symbols or secrets.

Fictional unit tests cover absent and truncated sources, spoofed archive success, non-zero verified sample counts without source proof, and secret exclusion; browser coverage includes the readiness checklist and zero extra writes.

## Real browser regression — holding-detail mobile history scroll restoration

The earlier integrated browser run `44262185941` finished with one actual regression at 768px in the inherited Milestone 2 detail → Evidence → Back → Escape journey: 33px viewport drift, while focus and URL identity stayed correct. The application had been racing native browser history scroll restoration against the custom synchronous/RAF modal-focus restoration. Updated the *actual application* to temporarily set `history.scrollRestoration='manual'` during explicit holding detail navigation, restore the captured list scroll at close and after two render frames, then restore the prior browser history mode. Cleanup also restores the mode on component unmount. The original strict <3px test and keyboard/focus assertions remain unchanged; no fake tolerance increase or test skip. Exact-head browser CI must prove the fix.

## Explicit mobile history restoration regression assertion

The previously failing 360/768/1440px Holding Detail → Evidence → browser Back → Escape test now additionally asserts that `history.scrollRestoration` switches to `manual` only while the modal/history journey is active, then returns to its saved previous value after the two-frame stabilization. It measures the original strict <3px viewport contract **after** that cleanup, rather than before a pending browser animation can override it. All existing focus, identity and zero-write assertions remain intact.

## Real mobile history-entry restore regression repair

Exact-head full browser run `44263445628` caught the manual history-mode assertion at every viewport: `scrollRestoration` was `auto` immediately after opening the dialog. Setting the property only *before* `history.pushState` was insufficient because each new active browser history entry can restore its own default. The opening path now explicitly sets `history.scrollRestoration='manual'` **after** pushState as well, while the original mode is restored at the modal cleanup and unmount. The strict 3px focus/scroll test remains unchanged. This hypothesis requires exact-head browser proof; do not claim it fixed until CI confirms.

## StrictMode double-effect cleanup identified (18 November 2026)

Exact-head run `44282494224` still showed `history.scrollRestoration='auto'` immediately after the holding modal opened at 360/768/1440px. Root cause: the `HoldingDetailDialog` mount `useEffect` cleanup unconditionally invoked `onRestoreFocus`; React development-mode StrictMode replays mount cleanup/setup even though the modal remains open. The deferred two-frame list restoration from this **synthetic cleanup** overrode `manual` back to `auto` during the open dialog. Replaced that unconditional cleanup callback with a next-animation-frame condition `if(!node.open)restore.current()`. StrictMode replay re-opens the node in the same turn so no list restore occurs; actual unmount leaves it closed and allows restoration. Native modal close and body-overflow cleanup remain synchronous. Kept all exact focus/scroll/history tests unchanged, pending new CI proof.

## Evidence → Back cross-entry scroll restoration (18 November 2026)

Exact-head browser run `44283711030` passed the initial `history.scrollRestoration='manual'` assertion on all viewports after the StrictMode cleanup fix. It then timed out after the Evidence round-trip because the dialog cleanup had cleared the saved original history mode when **navigating to Evidence** instead of closing back to the holdings list. Reconciled these separate transitions: during Evidence navigation, restore that entry's native history mode temporarily **without clearing** the original saved value; on `popstate` back into the detail, set manual again; only clear the saved restoration mode when on the real closed holdings-list entry. Underlying strict <3px scroll, focus, no-write and browser-history restoration assertions remain, not weakened. This needs a fresh full mock-browser exact-head run.

## Out-of-order browser Back guard

If the user returns from Evidence before a prior dialog cleanup's two animation frames finish, the pending cleanup must not reset a newly reopened detail entry from `manual` back to `auto`. The final restoration handler now re-reads the live URL at the time of the last frame and restores the previous native mode only if the holdings list is genuinely closed or if the user is in a distinct no-detail Evidence workspace. The manual mode is retained while a detail is open. The same original strict Playwright round-trip assertions remain enabled.
