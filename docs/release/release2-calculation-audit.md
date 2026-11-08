# Release 2 — rule and calculation audit

Status: repository-wide static inventory and first detailed correction pass complete; comprehensive numerical sign-off remains **open**. Scope expanded at the user's request after the daily Telegram increment. Everything below is feature-branch code and fictional/offline evidence, not a deployed correction or validated investment strategy.

## Coverage and method

`node scripts/audit-calculation-inventory.mjs /workspace/artifacts/calculation-audit-inventory.json` inventories 297 non-test source files: 186 contain arithmetic candidates, including 85 Python files. JavaScript/TypeScript and Python parse with no failures. All 32 migration SQL files are inventoried separately without semantic parsing. The manifest includes expressions/lines, source head and a working-tree caveat; arithmetic includes date/index/presentation operations, so these counts are not counts of financial formulas or audited-correct modules. Application code is parsed as text, not executed by the inventory script.

Detailed review focused on rule evaluation, allocations, scenario parameters, purchase/sale accounting, account cash flows, holding-return eligibility, same-cash benchmarks, peer counterfactuals and forecast interval arithmetic. Additional source review covered quote/evidence eligibility, portfolio weighting/history, forecast independence, research periods, macro scoring, paper allocation, Python earnings/event-study horizons and committed purchase-lot SQL. Existing tests were supplemented with hand-computed boundary examples and client/server accounting identities.

## Findings corrected in this draft

| Area | Before | Corrected behavior |
| --- | --- | --- |
| Missing allocation settings | `Number(null)` created a configured 0% maximum, producing false allocation prompts | Unset values stay unset; explicit zero remains a real configured value |
| Allocation validity | Out-of-range or target-above-maximum settings could enter comparison logic | Invalid/conflicting pairs are withheld with version-compatible configuration issues, surfaced in the compact brief |
| Missing risk parameters | Null beta/shock became zero exposure/stress | Missing values use the existing documented beta 1, leverage 1 and 15% shock defaults; explicit zero remains zero |
| Stop arithmetic | 100%+ stops could create zero/negative denominators; an invalid staged stop suppressed a valid fallback | Stop/trailing percentages require 0–100 exclusively; finite positive targets/distances only; malformed broker values are excluded |
| Time-rule priority | A near price rule or reached upside target could hide an expired holding-time rule | A breached time rule precedes those lower-priority states; downside breach priority is preserved |
| Proximity explanations | Time messages read nonexistent `distance`, producing NaN; upside targets were described as already below price | Use remaining calendar days and describe the rise needed to reach an upside target |
| Time provenance and future bars | Missing purchase date could infer a holding start from history; future bars could influence trailing calculations | Time limits require a valid purchase date; rule history is bounded by the assessment date; injectable time supports deterministic tests |
| Pullback denominator | A move from 100 to 80 was called a 25% pullback | Peak-relative drawdown is 20%; percentage recovery to the peak is a distinct measure |
| Sale fees | Fees above gross proceeds were clamped away at zero net sale proceeds | Signed net proceeds retain the full loss in client/server trading P&L, account cash and holding-ledger calculations |
| Server ledger inputs/order | Invalid fees/quantities could enter server totals; calculation depended on caller ordering | Invalid ledgers withhold decision totals; weighted-average inventory processes chronological trades |
| Currency compatibility | One non-USD ledger currency could still be combined with USD prices | Unsupported trade currency withholds total-return comparisons and holding-return eligibility; UI explains the status |
| Benchmark withdrawals | Excess sales clipped shares but subtracted full cash, falsely claiming complete coverage | Unsupported/unfunded sale cash flows yield partial coverage and null comparison P&L |
| Peer entry/cash flows | Future-price entry fills, ignored fees, clipped sales and skipped trades could produce complete-looking comparisons | Use an observed close on/before the trade; include fees, reconcile quantities and withhold unsupported cash-flow comparisons |
| Forecast coverage | Reversed intervals and boolean/blank fields counted toward sample coverage | Unusable bounds/observations are excluded instead of becoming counted misses or manufactured zeroes |
| Wilson intervals | Fractional counts or invalid confidence multipliers could produce invalid intervals | Require integer binomial counts and a positive finite multiplier |

Key examples: buy 2 shares for $2, then sell 1 for $1 with a $3 fee. Net sale proceeds are **−$2**, realized loss **−$3**; holding value $1 leaves total trading P&L **−$3**. A $10 opening deposit leaves cash $6 and total account value $7, the same −$3 P&L. Tests check all affected accounting paths. For ordinary transactions, `total P&L = current holdings value + net sales − gross purchases`, with chronological weighted-average realized/open cost accounting.

New numerical helpers are pure and add no dependency or endpoint. No stored rule, target, allocation, transaction, risk parameter or stage state was changed in a database. Existing numerical review thresholds are retained; this pass does not optimize them against historical outcomes. Production decision-center GET already has stage persistence; it was never called during this audit.

## Remaining audit work and release gates

| Priority | Area | Remaining evidence/decision |
| --- | --- | --- |
| High | Missing-data semantics in legacy group/rotation/stress displays | The [frontend follow-up](release2-missing-data-analytics.md) corrects the identified empty/partial score and quote-ingress defects. Shared source-status/provenance and remaining cost-fallback consumers still require review; decision-card eligibility gates remain intact |
| High | Adjusted prices and point-in-time provenance | Reconcile split/dividend adjustment, ticker changes/delistings and as-of source times across portfolio history, benchmark/peer views, forecasts and Python event studies; fixtures cannot prove real historical coverage |
| High | Shared client/server accounting contract | Corrections have cross-layer regression cases, but duplicated implementations remain; extend generated invariant cases for lots, full liquidation, invalid sequences, rounding, missing flows and FX rather than claiming parity from a few examples |
| High | Rule configuration lifecycle | Validate all rule types at API boundaries; define explicit invalid-configuration reporting, stale staged activation invalidation, calendar/session distinctions and signed/leveraged-product assumptions |
| High | Forecast/evaluation protocol | Freeze holdouts, cohort/delisting rules, outcome availability and new-horizon compatibility. Existing overlap, 50/25/25 sample and signal-family gates are retained; samples alone do not establish predictive validity |
| Medium | Score interpretation | Stress/group/macro/paper-allocation weights and cutoffs are descriptive heuristics, not calibrated probabilities. Review empty inputs, correlations, sensitivity and calibration wording before promoting them to decisions |
| Medium | Rounding and SQL precision | Committed purchase-lot RPC uses positive input checks, row locking and eight-decimal quantity/cost rounding. Full boundary/property tests in a disposable database and deployed-definition parity remain unverified; no SQL changed here |
| Medium | Earnings and Python analytics | Offline tests cover surprise denominators and post-event trading-session anchors. Verify adjusted/non-finite candle handling and event-time/source corrections against the shared protocol before treating results as investment evidence |

This report does not mark every arithmetic-bearing file correct. Inventory, detailed formula review, fixture verification, model calibration and production-data verification are separate evidence levels. The next implementation priority is completing the missing-data/rule-contract audit before adding company-dossier calculations.

Subsequent increment: [missing-data analytics correction](release2-missing-data-analytics.md), with explicit coverage, no neutral ranking defaults, matched rotation date windows, honest horizon comparisons, nullable stress and quote parsing without fabricated zero moves. The shared rule/source contract, concentration/attribution fallback and calibration work remain open.

## Verification and safety

Seventeen additional regression cases cover rule boundaries/priority/provenance, fee losses, currency, malformed ledgers, chronological accounting identity, peer dates/fees/cash-flow eligibility and forecast interval arithmetic. Total Node/TypeScript suite: **497 passed**. TypeScript, source security audit, production build, local migration-manifest integrity and whitespace checks passed. Exact-head CI is tracked in draft PR #168.

Additional offline Python/evaluation/workflow selection: **59 passed, 1 live test deselected**. An initial broader selection reached a live-tagged test that stopped at `NO_KEY` before any provider request; the corrected run explicitly excludes live tests. Existing pytest marker warnings remain. A long fictional bearer token in an integration fixture triggered the source scanner; the fixture now uses a short, clearly fictional value. The scanner and production authentication rules are unchanged.

Supabase skill review used current public changelog/function documentation; the markdown web reader required the HTML fallback. The observed breaking Flutter announcement does not apply to this JavaScript/Postgres source review. No hosted database query, production credential/API access, Telegram message, deployment, schema migration, linked-project command, JEV/NVIDIA call or financial-data import occurred.

Rollback: reviewed application-code revert; no stored-rule rewrite, ledger repair, message replay or database rollback is needed. Existing manual release and sender controls remain in force.
