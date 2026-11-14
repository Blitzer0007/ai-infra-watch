# Release 2 — raw SEC statement adapters, stage 1

Implemented offline in Codex Cloud on the existing Release 2 feature branch, 14 November 2026. The pure `buildSecStatementObservations` function in `shared/secStatementObservations.js` projects supplied companyfacts declarations into a separate **sec-statement-observations-v1** contract. It does not fetch data, widen the existing council/dossier v1 receipt, alter peer calculations, connect actual holdings or enable valuation/scanner decisions.

## Supported concepts and distinctions

| Group | Supported declaration | Unit / scope |
| --- | --- | --- |
| Cash | `us-gaap:CashAndCashEquivalentsAtCarryingValue` | USD, instant carrying value; no restricted-cash or investment substitution |
| Debt components | `LongTermDebtCurrent`, `LongTermDebtNoncurrent`, `ShortTermBorrowings` | USD, separate instant declarations; not total interest-bearing debt |
| Point shares | `us-gaap:CommonStockSharesOutstanding` | shares at the explicit requested date |
| Cover-page shares | `dei:EntityCommonStockSharesOutstanding` | shares at its own explicit requested date; no balance-date substitution |
| Weighted shares | `WeightedAverageNumberOfSharesOutstandingBasic`, `WeightedAverageNumberOfDilutedSharesOutstanding` | shares over an explicit annual-duration interval, kept separate from point shares |
| EPS | `EarningsPerShareBasic`, `EarningsPerShareDiluted` | USD/shares over the requested annual duration; basic/diluted remain separate |

Each observation retains the original namespace/tag/unit/row index, accession/form/filing day, calendar frame, supplied value and measurement definition. Companyfacts `fy`/`fp` are retained as **filingFiscalYear / filingFiscalPeriod**, not assigned to the fact period. A comparative 2024 fact reported in a filing focused on FY2025 must not become an FY2025 fact. Fact fiscal labels remain unknown.

Cash, debt components and shares require nonnegative supplied values, preserving reported zero. EPS preserves losses, zero and tiny nonzero values. Booleans, nulls, strings, nonfinite values and unsafe integral binary64 values cannot become valid observations. Fractional numbers are copied as declarations; original source precision is not supplied or certified. Original adjustment and dimensional/share-class scope remain unestablished.

Debt components are never summed. Their lease/carrying-value scope and overlaps are not established by these tags alone. Neither point shares nor weighted shares are used for market capitalization or enterprise value. EBITDA, total interest-bearing debt, EV, P/E and EV/EBITDA remain unsupported; EPS/share/price compatibility and positive-denominator gates require a later reviewed contract.

## Explicit scope, chronology and vintage selection

The request contains an exact symbol/expected CIK, explicit assessment/retrieval instants and an exact period `{start, end}`. `start: null` selects instant observations; annual durations retain the existing 300–400 elapsed-day support policy. No latest-period guessing, calendar-year-to-fiscal-year conversion, quarterly/YTD EPS relabelling or fallback to a different period is performed.

Instant declarations may come from 10-K/10-K/A with filing focus FY or 10-Q/10-Q/A with filing focus Q1–Q3. Annual-duration EPS/weighted shares require the annual filing contract. Quarterly/YTD duration support is not implemented. A later quarterly filing can supply a comparative point balance while its FY/FP remain filing metadata.

For each requested concept/period the adapter selects the newest **declared filing day** before admitting values. Identical newest rows deduplicate; different same-day accessions or conflicting newest values/metadata withhold the metric. A malformed, unsupported or not-yet-available newest record cannot silently disappear into an older successful result. Unidentifiable record periods or vintages also withhold the affected metric. This conservative policy may withhold otherwise usable older data; it does not claim complete recovery of historical vintages.

The existing conservative date-only publication envelope is reused. The whole range must close by declared retrieval, and retrieval must not follow assessment; ordering retains microsecond precision. Exact publication/observation timestamps remain null. Declared amendments, later-vintage selection and prior-vintage counts are recorded without asserting an actual financial restatement or comparing prior values. Conflicting metadata for a shared accession fails the snapshot; mixed accessions across distinct metrics are explicitly flagged and never aggregated.

These are checks of supplied metadata, not proof of when data was actually public or acquired. The reference URLs are constructed from validated CIK/accession fields; original source URLs/documents are not retained or authenticated by this adapter. Real issuer identity, taxonomy/context completeness, historical availability, split adjustments and source authenticity remain external facts to establish.

## Failures, bounds and authority

Source failures retain `not-configured`, `rate-limited`, `timeout`, `transport-error`, `no-data` or `unavailable` distinctly. A failure needs no invented retrieval timestamp; its normalized retrieval is null. Loaded data requires a supplied valid retrieval. Loaded data with no supported observations is unavailable, not proof of an empty financial history. Missing concepts, units or requested periods remain absent and explicitly reported.

The adapter checks at most 500 rows per recognized concept across all its units, 2,000 recognized rows overall, eight unit keys per concept and 80 bounded findings. Unsupported units/periods still count toward source limits. No raw provider error, entity description, private extra field or unrecognized source text is echoed into the result. Explicit simulation withholds all observations; missing/false simulation metadata does not authenticate a source.

All successful snapshots are partial. Source/issuer verification, decision eligibility, valuation eligibility and aggregation eligibility remain false. Projection-only usage is zero provider/model/database calls; acquisition usage is unknown. The module uses no ambient clock, configuration, persistence, credentials, model factory or sender. Existing v1 contracts, UI, API queries, schema and runtime behavior are unchanged.

## Evidence and next integration boundary

60 new deterministic cases use invented companyfacts records. They cover all ten concepts, distinct dates/units/share bases, comparative filing focus, quarterly point versus annual duration semantics, loss/zero/tiny EPS, malformed/unsafe numeric inputs, source failures, exact-date windows, future retrieval, newest-vintage withholding, duplicates/conflicts, amendments, metadata consistency, bounds, input isolation and forbidden network/ambient-clock access. Existing full Node/financial regressions, TypeScript, build, source security, workflow/whitespace and local migration-file checks accompany PR #168. No browser test is added for this contract-only stage; the existing dossier remains unconnected and its previous tests are retained.

Next: define the consumer boundary for these new units/bases, independently validate the normalized receipt against retained original inputs, and connect a clearly fictional versioned dossier view before admitting actual source data. Native source references, compatible price/share/EPS adjustment evidence, complete debt/cash scope and reported EBITDA definitions are still required before valuation. Broader statement/taxonomy coverage, authorized acquisition/budgets, actual holding integration, model usefulness and hosted acceptance remain pending. No production changes, live polling, merge/deployment or Telegram activity is included.
