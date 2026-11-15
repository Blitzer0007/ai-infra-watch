# Release 2 — risk and release foundation

15 November 2026. Implemented on `feature/release2-opportunity-research` for draft PR #168. This is an increment within milestone 1 of the [five-release plan](release2-five-deployments.md), not a completed production release.

## Rule admission and presentation

`shared/portfolioRuleReview.js:reviewHoldingRules` adds a pure strict boundary around the retained `evaluateExistingRules` calculator. The old calculator, server compatibility export and browser compatibility adapter retain their golden outputs and thresholds. `reviewStoredHoldingRules` projects the same inputs for browser execution without importing handlers or credentials.

- `invalid-config` withholds results for unsupported types, invalid percentages/days/fractions, malformed or excessive arrays, ambiguous stages/dependencies and disagreeing explicit/legacy broker prices.
- `incomplete` withholds results for missing required cost/date/quote, unreviewed broker directions, manual exit types without automatic monitoring, uncalculable results and missing or incompatible declared history coverage.
- An empty supported configuration remains `no-rule`. Zero is not a synonym for a missing or disabled rule. No new stored disabled-rule convention is introduced.
- History-dependent review requires a purchase date and a bounded, nonempty, unique, valid point collection with `coverage: {status:'complete', startDate, endDate}` spanning purchase through assessment. This declaration is **not independent source/coverage authentication**. The existing history adapter does not supply it; affected reviews remain incomplete until the source contract is supported. Do not add a hard-coded completeness flag to make them pass.
- Stage activation/peaks are recomputed from admitted history. Stored state cannot substitute for missing observations. Review returns `stageStateDirty:false`; the Decision Center read path no longer PATCHes inferred `rule_stage_state`.

The Decision Center exposes `invalidConfig`, `incomplete`, `evaluated`, per-symbol issues and expandable configuration/coverage explanations. Missing or inconsistent count evidence cannot make the Position rules gate ready. A mathematically clear rule still grants no quote, accounting, source, model or trading authority. Custom/thesis/price-stop automatic monitoring is not implemented by this change.

## Server Smart Alert admission

`server/utils/serverAlertQuote.js` retains and checks the Yahoo response before price/large-move evaluation. It requires matching returned identity, positive numeric price, USD/raw quote units, supported New York exchange zone, exact market/retrieval instants, maximum 15-minute age, no future observations and a provider-declared regular-session interval containing both observation and assessment. Explicit non-regular states and stale/simulated/fallback markers are withheld. Missing market-state text may use the explicit provider regular-session interval; wall-clock weekday/hours alone are insufficient. Early provider-declared closes are respected.

An unknown previous close remains null, allowing an otherwise admitted price review without inventing a zero daily return. Rejected observations never enter the scan's quote map, cannot reset active price state and cannot generate price/large-move events. The scan reports unavailable/withheld quote counts. Invalid target types, nonpositive/coerced targets and unknown directions are rejected. The handler now **awaits asynchronous authorization** before evaluation; the previous unawaited Promise could allow evaluation after an access rejection.

These are declared-metadata checks, not proof Yahoo metadata is authentic or correct. This increment covers Server Smart Alert quote events; it does not certify every return/re-entry/catalyst/digest path or change delivery schedules/policies. Existing historical after-session summaries remain a separate path.

## Manual release controls

The workflow remains manual, main-only and requires `YES`. It now:

1. Checks out the dispatch SHA without retained checkout credentials. Requires a reviewed full `expected_main_sha` matching dispatch and current main, before Vercel authentication is exposed.
2. Requires successful main push/manual runs of Frontend CI and UI API DB Validation for that exact SHA. PR runs cannot substitute. Latest present runs of the other five known validation workflows must also pass; path-filtered workflows without a run are not invented as successes. Frontend CI can now be dispatched manually when a path filter omitted it. Evidence paging is bounded and incomplete evidence blocks release.
3. Serializes releases, references the `production` GitHub environment, pins checkout/Node/Python actions to official tag commit identities and requires a reviewed exact `VERCEL_CLI_VERSION` environment variable instead of `latest`.
4. Checks the fixed Vercel team/project and an explicitly recorded READY production rollback deployment using read-only management requests. READY/identity does not itself establish the rollback content is known-good; retain prior acceptance evidence.
5. Builds production, rechecks main/CI, stages with `--skip-domain` and binds commit metadata. Verifies target/commit and the exact generated homepage bytes plus anonymous access gates. Redirect/protection pages do not pass as the app. Rechecks candidate and stage identity before promoting that same production build.
6. Checks the production homepage against the built bytes and records SHA/build URL/rollback ID in the run summary. SEC fundamentals and authenticated provider-refresh/job-health checks require separate `run_live_checks:true`; default is false.

### Prerequisites before using the workflow

- Configure/verify required reviewers and main-only deployment restrictions on GitHub's `production` environment, and confirm branch protection plus disabled Vercel automatic production assignment. Referencing an environment in YAML does not prove these hosted settings exist. No hosted settings were changed here.
- Review an available exact Vercel CLI version and set the protected environment variable. Public npm metadata lookup failed with `EAI_AGAIN` in this cloud session; no CLI installation or version approval was performed. Python build-tool reproducibility remains a broader tooling follow-up.
- Verify the read-only Vercel management response contract and protected-stage access with configured CI authentication. Missing fields/protection block promotion. This workflow does not retrieve a protection bypass secret or weaken protection.
- Prepare an isolated milestone candidate compatible with current main and its production schema. Do not merge the unfinished draft stack to satisfy the main-only control. Obtain exact-main CI evidence and retain a prior verified rollback deployment.
- Complete accounting abstention, remaining source/history/quote consumer review and integrated release acceptance. Static/access probes are not full feature acceptance. Code rollback cannot undo database operations or external sends; those remain separate.

## Verification and limits

Offline coverage includes retained math goldens; malformed/configuration and missing-history cases; real browser adapter execution; UI counts/issues; a fully mocked authenticated Decision Center request that exposes blocked review states without writes; server quote metadata/transport cases; unauthorized handler access; stale-quote scans that cannot send/reset state; exact-SHA/CI/target/URL release failures; workflow ordering, pinning and live-check controls.

Local checks: **1,640 Node tests**, TypeScript, production Vite build, source security scan, local migration-manifest integrity, all 25 workflow YAML parses and whitespace validation pass. The focused browser/workflow/accounting selection contains **51 cases**: 50 passed in the combined run; the existing glossary Escape/return-focus assertion failed once and passed unchanged in isolation. Do not describe that combined run as failure-free. GitHub CI for the saved commit is tracked in PR #168. The existing main-bundle warning remains (about 1,766.7 kB / 491.2 kB gzip).

No production API handler was called, deployment dispatched, production secret retrieved, database modified, live polling enabled or Telegram message sent. Provider/source effectiveness and deployment/rollback acceptance remain unverified. Milestone production releases completed: **0/5**.
