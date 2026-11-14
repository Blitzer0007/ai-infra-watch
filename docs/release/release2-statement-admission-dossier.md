# Release 2 — independent statement admission and dossier v2

Implemented offline in Codex Cloud on the existing feature branch, 14 November 2026. This increment independently binds the [raw statement adapter](release2-sec-statement-adapters.md) output to supplied original companyfacts rows and adds an optional, versioned **fictional-only** dossier consumer. Actual holdings, live acquisition, accounting/valuation eligibility, model context and production remain unchanged.

## Independent receipt validation

`shared/secStatementAdmission.js` exports `validateSecStatementReceipt(request, receipt)`. It shares the declared concept registry, resource limits and date primitives with the producer, but **does not call the producing adapter**. Its own input walk, vintage ordering, field checks and reconstruction independently check:

- Exact displayed scope, requested period, issuer declaration, assessment/retrieval instants and source failure envelope.
- Recognized-unit/row bounds, missing fields, units, source-row locations, values, fiscal filing focus, measurement basis and requested coverage.
- Newest declared filing day, malformed/ambiguous duplicates, unsupported/unclosed newer data, accession metadata consistency, source failures and diagnostic receipts.
- Date-only uncertainty bounds and exact chronology, amendments/prior-vintage declarations, constructed references and unretained original-document status.
- Every normalized receipt field, closed output shape and false authority/aggregation/valuation flags. Unknown/private fields, invented records, omitted coverage and changed metadata cannot be promoted to displayable statements.

A matching receipt yields a newly reconstructed allowlisted snapshot, not a caller-owned object. Valid failed/empty projections remain needs-data with no monetary observations. Invalid/unbound receipts return a fixed, sanitized reason and no snapshot. No raw error, private extra field or free-form provider text is echoed.

This is implementation and input-binding independence, **not** an independent publisher, taxonomy verification or financial-correctness certificate. Shared policy/definitions still need review and real source evidence. Content agreement cannot authenticate companyfacts, issuer mappings, supplied clocks or historical availability. Exact publication/observation times, source ownership and original document retention remain unsupported. All source/issuer/decision/valuation/aggregation authority stays false.

## Versioned dossier package

`company-dossier-statements-v2` contains one supplied raw source, explicit symbol/CIK/clocks and at most three `{period, receipt}` entries. `dossierStatements.ts` binds the displayed ticker and existing dossier identity/assessment, independently validates each receipt and checks filing metadata across the requested periods. Duplicate periods (including reordered JSON keys), extra fields, malformed period identifiers, excessive scope and inconsistent shared accessions fail closed.

Admission is atomic: one unbound receipt withholds **all new statement figures**. Existing separately validated v1 financial observations are neither overwritten nor promoted. The package does not merge units, infer full source coverage, sum borrowing components or calculate valuation multiples. Partial cash-only coverage does not become share/EPS coverage, and a failed source cannot leave earlier statement values on screen.

The consumer accepts only newly reconstructed snapshots and displays:

- Financial health: date-labelled cash and separate borrowing components. Total debt, lease scope and overlap remain unverified; components are not summed.
- Valuation: point/cover-page shares, weighted basic/diluted shares and basic/diluted EPS with `shares` versus `USD per share` units and each original period/date. Multiples remain unavailable, including when zero/loss EPS is present.
- Expandable original inputs: exact supplied numeric value, source location, accession/form/filing day, filing-focus FY/FP versus unknown fact fiscal labels, retrieval, publication uncertainty and constructed-reference limitations.
- Sources: scoped admission status, missing requested fields and zero validation calls with acquisition usage unknown. Source/issuer authenticity and financial completeness remain unverified.

## Explicit fictional interaction and runtime limits

The development-only FICT preview adds **Add fictional statement inputs** after the existing manual dossier opening. It constructs three producer receipts over a fresh copy of the bundled invented raw source: balance-date instant, annual duration and a separate cover-page date. The independent consumer then revalidates those receipts. Closing/reopening clears the new package; modifying one inspection cannot modify the bundled fixture or later inspections.

Every populated figure remains labelled fictional. Actual holding disclosures supply no statement package and perform no financial request. Existing v1 defaults, council/peer formulas, quote/accounting gates, APIs, schema, live models and scanner eligibility are unchanged. No storage, polling, sender, new endpoint or model call is added. Raw inputs stay local; they are not sent to NVIDIA/JEV or retained in a journal/export.

Each request retains the existing 500-row-per-concept / 2,000-recognized-row bound; a package has at most three requests. The dossier remains a deferred code chunk. In the captured build it is about 38 kB / 11.9 kB gzip; the entry bundle is about 1,762 kB / 489.7 kB gzip and its existing size warning remains. Production assets exclude both fictional actions and raw fixture payloads. Actual source acquisition usage/quotas are not measured by zero validation/projection counts.

## Evidence and next steps

36 new Node cases cover independent original-row binding, tampered values/units/periods/locators, source/clock/reference/authority changes, omissions, newer-vintage conflicts, original-input changes, scoped failures, cross-period metadata, duplicates, malformed/cyclic identifiers, source-copy isolation and zero/loss/tiny EPS formatting. The full Node suite passes 1,423 tests.

17 new browser/build cases exercise the actual producer → validator → dossier path using fictional data, including atomic withholding, preserved v1 observations, source timeouts, cash-only coverage, manual loading/reset, 360/768/1440px keyboard/layout and production exclusion. Isolated React forbids fetch, sockets, storage, polling and notifications with zero requests/errors. Existing dossier/holding/navigation regressions, TypeScript, build, security, workflow syntax, local migration-file and safety checks accompany draft PR #168; exact-head CI is recorded there. Screenshots are named `dossier-statements-{360,768,1440}.png`.

The [retained SEC native-export review](release2-sec-retained-exports.md) now supplies a separate offline original-byte/listing-consistency boundary and fixed fictional demo. Authentic acquisition/issuer/context evidence and a suitably authorized data path remain prerequisites before populating real holdings. Review broader taxonomy/statement/debt scope, compatible prices/share counts/EPS adjustments, reported EBITDA and valuation contracts, provider budgets, held-out model usefulness and hosted acceptance separately. These offline checks do not establish those facts or increase the rounded ~60% core estimate. No merge/deployment, production Supabase operation, live polling or Telegram message is included.
