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
