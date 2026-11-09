# Offline forecast session and history preflight

Version: `session-close-v1-experimental`. Implemented in Codex Cloud on 9 November 2026. This is a new, explicit offline measurement contract following the [forecast audit](release2-forecast-validation-audit.md) and [summary corrections](release2-forecast-summary-corrections.md). It is not wired into tracking, verification, model selection, the paper portfolio lab or the UI. Existing target dates/outcomes remain on their original contracts.

## Measurement convention

The planner supports explicitly identified USD instruments on XNYS/XNAS regular sessions, with 5 or 20 **completed close-to-close intervals**. Entry is the first declared session close strictly after the decision instant; target is the close five/twenty session indices after entry. Entry is not counted as an elapsed interval. This is a hypothetical future-close measurement, not an executable trade, latest-quote entry, next-open fill or reinterpretation of a legacy `5D` row.

A caller supplies every calendar day in a bounded coverage range, explicitly open with open/close instants or closed. Open-day instants must be ordered, valid and on the reported America/New_York date. Weekend openings are unsupported for these regular-session venues. There is no built-in holiday table, weekday extrapolation or generated exchange schedule. Missing/duplicate/unknown days and insufficient future coverage withhold a plan. A calendar revision must have been available by the decision cutoff; a later revision cannot silently alter the frozen target.

The fictional July fixture declares 3 July closed. For a decision after the 2 July close, its next entry is **6 July**, with a five-interval target on **13 July**. A premarket/intraday 2 July decision instead enters at the 2 July close and targets 10 July. Both conventions differ from adding weekdays to the capture timestamp; neither is applied to old records.

Explicit session instants handle DST and early closes. They are caller declarations: passing structural checks never verifies that a schedule matches the actual exchange, an unscheduled closure, a security's listing or its trading status.

## Interfaces and phases

`server/utils/forecastEvaluationPreflight.js` exports two pure functions:

- `planForecastSessions(input)` validates protocol/instrument/cutoffs/calendar and returns a versioned plan or a fixed missing-data reason.
- `evaluateForecastWindow(input)` additionally checks feature and outcome history, returning `needs-data`, `pending` or `conditional-outcome`. It has no transport, credential, filesystem, ambient-clock, writer, notification or model capability. It reads no application settings.

The input uses explicit `protocolVersion`, `symbol`, `venue`, `currency`, `horizonSessions`, `decisionAt`, `assessedAt`, `calendar`, `featureHistory` and optional `outcomeHistory`. Assessment cannot precede decision. Timestamp comparisons preserve up to six fractional digits with internal integer microseconds; no sub-millisecond truncation is used for cutoff/session admission. Outputs remain ordinary JSON without BigInt values. The committed fictional JSON is a complete interface example; unknown fields and legacy shapes are rejected rather than given implicit defaults.

| Phase | Required evidence declaration | Failure behavior |
| --- | --- | --- |
| Calendar | `forecast-session-calendar-v1`, venue/timezone, source/revision IDs, availability cutoff, inclusive day coverage with explicit open/closed records | No target if malformed, unavailable at decision or incomplete |
| Features | `forecast-history-v1`, exact identity/currency, split/dividend-adjusted close basis, source/vintage ID, snapshot availability, explicit `stale:false`, coverage through the latest session closed by decision | No substitution of fresh retrieval for a missing final session; future adjustment/publication vintages are withheld |
| Not yet matured | Valid features and assessment before target close | `pending`, with no outcome number; future outcome data is not inspected |
| Outcomes | Exact entry-through-target session window and publication/vintage availability by assessment | Missing sessions, absent/unpublished target, halt/delisting gaps or an unrelated later bar remain missing data; no forward fill, first-later-close replacement or zero-return fill |
| Conditional measurement | Both endpoint adjusted closes from one supplied outcome vintage | Finite `(target adjusted close / entry adjusted close − 1) × 100`; no mixing old entry adjustment with a newer target adjustment |

History envelopes name `coverageStart`, `coverageEnd`, `sourceId`, `vintageId` and `snapshotAvailableAt`. Each bar needs a real date, strictly positive finite `rawClose`/`adjustedClose`, an explicit publication `availableAt` and a distinct `recordId`. Decimal numeric strings remain supported. Publication must follow or equal that session's close, precede or equal its archive snapshot, and meet the phase cutoff. Bars must exactly cover open sessions within the requested range in order; missing, duplicate, unordered, future or closed-day bars are withheld. Calendar and history arrays are capped at 4,000 rows each. References are bounded tokens; private/unknown fields are not copied into outputs. Unexpected failures return a fixed code rather than exception text.

The feature vintage must already exist by decision. An outcome vintage may include later split/dividend adjustments known by assessment, but both label endpoints must come from that one vintage. It is never reused as historical feature evidence. A split example produces +8% from adjusted 25 → 27 rather than treating raw 100 → 27 as a 73% loss; the separate feature vintage is retained untouched. This is a declared adjusted-close ratio, not a verified cash-dividend/reinvestment or corporate-action accounting result.

## Limits and trust boundary

Every result keeps **`sourceVerified:false`, `productionEligible:false` and `predictiveValidityEstablished:false`**, including a successful conditional measurement. Source/vintage/record IDs and availability timestamps are claims in supplied data, not verified archive artifacts. No caller flag can promote the result. The evaluator neither certifies full market history nor enforces a model's minimum lookback: its feature start is explicitly supplied, its count is reported, and a short complete window can pass these structural checks while remaining inadequate for an analogue model.

The existing `hasFreshMarketHistory` helper and weekday writers are unchanged and retain their audit findings. The new evaluator does not repair, migrate, adapt or silently certify those paths. Existing read-summary nonoverlap/count gates, promotion thresholds and legacy analytics contracts are unchanged by this increment. There is no new persisted horizon or model family.

This contract does not supply issuer/listing provenance, instrument-level halt/delisting cash settlements, authoritative calendar revisions, independently verified publication times, immutable archive hashes, train/validation/holdout cutoffs, label purging, correlated-observation uncertainty, proper quantile scores, benchmarks, costs/slippage or investment-performance evidence. A missing bar alone does not establish why trading stopped.

## Cloud demonstration and checks

Run from the repository in Codex Cloud:

```bash
node scripts/forecast-evaluation-demo.mjs
```

The runner reads only its fixed committed fictional fixture and accepts no external input/file arguments. It prints four actual evaluator results: conditional complete window, pending target, missing target, and future feature vintage. It does not import provider/database/verification modules, read credentials or issue requests. Retained receipt: `/workspace/artifacts/forecast-session-preflight.json`.

**86 added offline cases** cover independent target-date expectations, microsecond cutoff/offset/entry boundaries, separate 5/20 horizons, premarket/intraday/exact-close/weekend/offset timing, DST, early closes, gaps and closures, calendar revisions, invalid numbers/dates/identity/currency/basis, duplicate/unordered/oversized histories, missing/unpublished/future bars, stale retrieval, split/dividend vintages, missing halt/delisting outcomes, finite arithmetic, legacy rejection, redaction and a frozen-input/no-clock/no-network check. A credential-free child-process test verifies the fixed CLI against the actual evaluator. Standard Node CI includes these tests; frontend/QA path filters also cover the exact runner and fixture paths. No workflow is dispatched and no live/deployment job is enabled.

Local Cloud validation: **776 Node tests**, typecheck, production build, source security, migration-manifest integrity and **25 offline workflow-safety cases**. The existing bundle-size warning remains. Exact-head CI is recorded in draft PR #168. No UI/runtime path changes, so no new browser interaction is introduced; existing combined UI CI remains a regression check.

## Next integration work

1. Add a separate trusted offline adapter that checks retained calendar/archive artifacts and source availability, reusing the existing artifact/hash review where applicable. Current live history DTOs lack this evidence; do not invent it from retrieval time or `adjusted:true`.
2. Freeze the chronological rolling-origin protocol: model lookback/feature availability, entry/target rules, purged train/validation/held-out partitions, same-cutoff baselines, proper point/quantile/interval metrics and pending/missing outcome counts. Add time/market-cluster uncertainty before calibration claims.
3. Characterize compatibility for new versus legacy snapshots and review any proposed writer/schema integration. Preserve original target/basis/version; do not reclassify old weekday rows as session-close rows or overwrite historical outcomes. Production activation and real-data acceptance remain separate work.

No live financial-data/SEC/NVIDIA/JEV call, production secret, hosted database access/write, real message, merge or deployment is part of this increment. Rollback is a reviewed removal of the isolated module/demo/tests; no stored-data repair is needed.
