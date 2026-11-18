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
