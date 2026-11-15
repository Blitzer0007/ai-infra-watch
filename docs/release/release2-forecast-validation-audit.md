# Forecast validation — comparative audit

Assessed 9 November 2026, Asia/Kolkata. Baseline: `09a0276966e03936efcfd7a1402191b48207e9b4`. **The existing forecast validation cannot be certified correct: several logic defects are reproducible.** Some useful safeguards are present, but the validation numbers/labels are not proof of predictive usefulness or market outperformance.

This is a read-only audit of forecast logic, selected public source and pure-function counterexamples. No forecast rule, threshold, table or verification handler is changed by this report. The production verifier can write due outcomes; it was not invoked. No hosted forecasts, market prices or model were queried.

Follow-up: [forecast summary corrections](release2-forecast-summary-corrections.md) implement chronological loaded-window summaries, mixed-coverage diagnostics, strict scalar/calendar inputs, consistent read-side counts and clearer presentation. The baseline findings below remain historical audit evidence. Weekday/session alignment, the standalone history guard, legacy analytics and point-in-time/held-out validation remain open; this audit is not an all-clear.

## Reproduced findings

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| High | Recent windows are not chronological | `independentForecastRows` groups/sorts by ticker and horizon, and the summary/learning code slices the resulting tail. A packet with ten newer correct AAA rows and ten older incorrect ZZZ rows reports last-ten direction/match as **0%**, while the ten chronologically newest are **100%**. Drift and recent lessons inherit this ordering problem |
| High | Contradictory interval coverage can be called well calibrated | `calibrationVerdict` requires both intervals to be too narrow or both too wide. In 100 fictional cases the central interval covers **0%** (Wilson upper 3.7%) and the outer interval covers **100%** (Wilson lower 96.3%); the function still returns **well calibrated**. Both nominal 50%/80% targets are excluded, in opposite directions |
| High | Weekday targets differ from session horizons | Analogue outcomes use an index offset of 5/20 historical bars, while target dates add weekdays. With one declared weekday market closure, a five-weekday target can be the fourth market session. The pure existing date helper returns 9 July for an example whose fifth supplied session is 10 July. Selecting the first point on/after the weekday date does not generally correct an internal holiday |
| Medium | Invalid numeric/window inputs can count | The summary admits boolean returns/medians through Number coercion, and the window helper accepts a nonexistent 30 February date because it checks only the date pattern. A fictional boolean row counts as an independent verified observation with 100% direction accuracy. Database typing may prevent some such records; this demonstrates weak helper boundaries, not proof of corrupt hosted rows |
| Medium | The history freshness guard is weaker than its name | The pure guard accepts a truthy malformed date and boolean price, with no actual observation-age check. The adjusted-history path adds other checks, so this standalone result does not prove the entire hosted write path accepts the same packet. Legacy raw-basis and upstream validation still require review |

These are **six executable counterexamples**: rolling order, calibration, boolean metrics, invalid calendar dates, weekday/session alignment and the standalone history guard. Reproduction source and exact JSON outputs are retained at `/workspace/artifacts/forecast-rea-review/counterexamples.mjs` and `counterexamples.json`. The script imports pure helpers; only the existing weekday helper is extracted and executed in a fresh context, never its handler. No provider or database capability is called.

The script deliberately asserts the currently observed defects so the audit is reproducible; it is an evidence artifact outside application CI. Future regression tests must assert the corrected behavior, not adopt those incorrect outputs as golden expectations.

## Statistical and interpretation gaps

- Per-ticker/per-horizon nonoverlap is useful thinning, not statistical independence across correlated equities, overlapping horizons and shared market regimes. Pooled counts and Wilson intervals need time/market-cluster uncertainty treatment before strong calibration claims.
- Prediction match is a custom bounded error score: `max(0, 100 − abs(prediction−actual)/max(abs(actual),1) × 100)`, averaged after excluding zero medians/outcomes. Its arithmetic follows that formula, but it is not a standard forecast accuracy/probability or alpha metric. Report the formula/denominator, neutral-case coverage and a descriptive label; compare standard error/proper quantile scores separately.
- Fifty samples, the existing 50/25/25 gate and labels such as established describe a sample policy, not predictive validity. A confidence interval containing the nominal coverage is not proof of calibration. Keep experimental status until a reviewed protocol and genuinely held-out/matured evidence support promotion.
- Evidence-channel lift compares different observed cohorts, so it is association rather than a causal effect of adding evidence. Regime, ticker, horizon and data-availability differences can confound it.
- The no-change comparison is useful but does not establish performance against SPY/QQQ, transaction costs, a tradable entry convention or an investable strategy. Current 5/20-session tracking does not validate the intended 2–12-month research horizon.
- Freeze price basis, actual session mapping, entry timestamp/convention, future/duplicate-bar rejection, point-in-time feature availability, corporate actions, delistings and stale/missing outcomes. No real-data review is substituted by these fictional examples.

## What the current code does usefully

Separate 5D/20D streams and deterministic daily forecast IDs are present. Same-ticker/horizon overlapping windows are thinned. Outcome verification defers when target history is unavailable and avoids using a point before its target. Explicit stale flags and missing adjusted-history references can defer processing. Reversed interval bounds are excluded and Wilson input bounds are checked. Those are worthwhile guards; they do not cancel the findings above or establish source truth.

## Comparison with auditable reference implementations

| Reference, pinned source | Observed practice | Useful adaptation and limits |
| --- | --- | --- |
| [Microsoft Qlib](https://github.com/microsoft/qlib/tree/54355232463878d2eebb91fe0ee5fa7fa1f5976c) | Selected rolling task generation uses horizon-dependent truncation to avoid label leakage. Evaluation exposes risk/IC measures, explicit benchmark/cost configuration and a T+1-style prediction shift in the reviewed long/short helper | Define per-cutoff train/validation/test availability and a label purge/gap. Make benchmark, costs and entry timing explicit. Qlib is a finance research framework, not a guarantee of leakage-free inputs or investment returns. Its example market/cost defaults are not adopted for our US portfolio |
| [Nixtla StatsForecast](https://github.com/Nixtla/statsforecast/tree/9e1f760435a4864d5551fe905021d98e9f0836cd) | Selected cross-validation code defines horizon, test size, step size, input window and refit policy. It trains before each cutoff and retains held-out targets per rolling window | Store cutoff/horizon/outcome rows explicitly; evaluate chronological rolling origins and proper interval/point scores. Future exogenous inputs still require caller-side availability proof. General time-series cross-validation does not supply an exchange calendar or make stock returns predictable |

These source-available frameworks are more auditable evaluation references than copying a consumer app's accuracy badge. They are not a ranking of financial applications. No reference project was installed or run, no market data/model was fetched, and no reference source is incorporated into the product. Reviewed licenses: Qlib MIT; StatsForecast Apache-2.0.

Source anchors: Qlib `qlib/contrib/rolling/base.py:get_task_list`, `qlib/contrib/evaluate.py:{risk_analysis,long_short_backtest}`, `qlib/contrib/eva/alpha.py:calc_ic`; StatsForecast `python/statsforecast/core.py:GroupedArray.cross_validation` and selected utility source. Reference files and LICENSE texts are retained outside Git under `/workspace/references/forecast-review`.

## Actual REA work and limits

Used the existing isolated **REA 6.8.0** CLI. Parsed five selected application JS files as inert text: auto-tracking, verification, validation summary, independence and calibration. The scoped copy has five syntax-complete files and no parse failures; application coverage remains partial and semantic coverage unknown, with unresolved relationships. A first root-inventory run parsed the same selected files but inventoried unrelated paths; the bounded isolated-copy run is the retained scoped result.

Syntax-compiled five selected reference Python files without importing/executing them, then used REA's inert pyc inspector: **five successful inspections, 124 code objects**. This is Python bytecode/container metadata, not a Python semantic call graph, reference runtime test or model evaluation. Manual source review supports the protocol comparison; the independent fictional numerical cases establish the reproduced defects.

Hashes, pinned refs, evidence IDs, exact coverage and limitations are retained in `/workspace/artifacts/forecast-rea-review/manifest.json`. Scoped JS summaries/evidence, pyc summaries and counterexamples are in the same directory. REA is useful for implementation mapping, while cutoff-aware tests and independent numeric cases are the stronger correctness check here.

## Recommended correction sequence

1. Add failing regressions with corrected expectations for chronological rolling/drift/lessons and mixed calibration failures; fix those helpers without relabeling old horizons or lowering sample gates.
2. Enforce strict finite-number/calendar/window inputs and explicit neutral-case denominators. Rename or explain prediction-match/established/evidence-impact labels so they do not imply probability, alpha or causality.
3. Specify actual exchange-session entry/target mapping and point-in-time raw/adjusted history guards. Characterize split/dividend, holiday, missing-bar and future-bar cases before changing the writer or historical outcomes.
4. Freeze a versioned rolling-origin/purged evaluation protocol, holdout, benchmark/fee assumptions and time-cluster uncertainty. Compare no-change and supported baseline/model variants on the same cutoffs using point error, quantile loss and interval coverage/width.
5. Review any schema/history compatibility separately. Existing forecasts/outcomes must not be silently rewritten; hosted acceptance and any verification run remain separately authorized.

This audit answers the correctness question with specific counterexamples and reference practices. It does not certify the remaining code or change production forecast outcomes.
