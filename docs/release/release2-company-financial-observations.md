# Release 2 — company financial observations, stage 1

Implemented offline in Codex Cloud on the existing Release 2 feature branch, 14 November 2026. This is a bounded contract/projection over already-loaded declarations, **not** a new acquisition path, complete financial adapter, dossier screen or production integration.

## Problem and contract

The existing SEC council adapter already validates annual revenue growth, operating margin, operating cash flow less property/plant/equipment payments and total liabilities/equity. Its receipts retain original calculation inputs and filing dates, but they are specific to the council. Building company research directly from loose peer/price fields would risk losing definitions, units, periods and availability distinctions.

`src/utils/companyFinancialObservations.ts` adds the pure `buildCompanyFinancialObservations` projection. It takes an explicit symbol, ten-digit CIK, assessment instant and a strict source envelope: a loaded `council-sec-v1` receipt or a declared `not-configured`, `rate-limited`, `timeout`, `transport-error`, `no-data` or `unavailable` result. These failures remain distinct and contain no raw provider error/credential text.

The function reuses `secCouncilReceipt` and the existing reviewed calculation adapter. It does not introduce a parallel formula or change peer/council calculations. The request scope must match the receipt's declared issuer. This is identity consistency, **not verification of the ticker/CIK mapping**.

Successful receipt inputs project declared revenue, operating income, operating cash flow, property/plant/equipment payments, liabilities and stockholders' equity. The four validated derived metrics retain their exact method, input facts, units and periods. Repeated identical facts are deduplicated; comparative revenue periods remain separate observations. A full fictional receipt yields seven distinct source-field declarations and four derived observations.

Only facts retained in successful existing receipts are supported in this stage. A raw concept with no supported validated calculation may remain absent even if a provider payload contains it. Dedicated statement adapters and complete concept coverage are still required.

Each observation preserves:

- Source-field declaration versus derived value; the original derivation inputs/method and precise metric label. Total liabilities/equity is never called interest-bearing debt/equity. Negative operating/free cash flow and genuine zero remain observed values.
- USD inputs; USD money outputs versus percent/dimensionless ratio outputs. No FX, share-count, earnings or price substitution is performed.
- Duration start/end versus an instant balance-sheet date. Fiscal year/period remain null because the input receipt did not retain those fields; a calendar end date cannot establish them.
- Original accession, form, filed calendar day and retrieval instant. Exact publication and observation times remain null; adjustment basis remains unknown.
- Explicit `sec-edgar-companyfacts` source identity. The zero-call usage receipt is scoped to this projection; acquisition usage/quotas are not measured or inferred from it.
- `10-K/A` as a declared amendment. A `10-K` does not prove an absence of restatements, so its restatement status is `not-established`.
- A **constructed accession-index reference**, explicitly labelled as reconstructed from supplied CIK/accession metadata. It is not a retained original source URL, fetched document, ownership check or authenticated filing.

## Availability and authority

The projection reuses the council's conservative date-only filing window under its documented UTC−12 to UTC+14 civil-offset policy: filing day minus 14 hours through filing day plus 36 hours, exclusive at the end. The whole window must close by retrieval, and retrieval must not follow assessment. Comparisons retain microsecond precision; no midnight publication timestamp is invented. Unsupported policy years and unclosed windows withhold the affected observations.

This window checks supplied chronology. It does not prove when the source was actually public, retrieved or historically available. Retained pre-event acquisition and publisher authentication are separate work.

The existing strict receipt validator binds formulas, source fields/units, periods, filings and duplicate values. Contradictory fatal issuer/source/limit issues with surviving observations fail closed. Original denominator, capex and period/vintage gates remain. A loaded receipt with no supported observations is unavailable, not complete empty source coverage. All successful snapshots are partial.

Cash, interest-bearing debt, shares, EPS, EBITDA, P/E and EV/EBITDA are explicitly unsupported. No stale share count, negative denominator, liabilities-as-debt substitution, scoring, valuation multiple or trading eligibility is added. Each observation and snapshot keeps source-authenticity, issuer-mapping verification and decision eligibility false; source coverage remains unverified. The projection makes zero provider/model/database calls and copies only allowlisted fields.

## Evidence and boundaries

42 new deterministic tests exercise the actual existing SEC adapter and shared receipt validator using the frozen invented companyfacts fixture. They cover eleven-observation projection/deduplication, periods, currencies/definitions, negative and zero values, amendments, date-only-window boundaries, microsecond future retrieval, all six failure states, issuer mismatch, invalid/enlarged receipts, changed calculations/units/private fields, duplicate methods, denominator/capex gates, mismatched period/filing vintages and input isolation.

The full Node regression suite, TypeScript, build, source security and workflow/whitespace checks accompany the draft PR update. These fixtures are not real filings, independently labelled financial research or hosted/provider acceptance. No UI/endpoint/schema/query/schedule/dependency or model runtime is changed, so no new browser scenario or live call is needed for this contract-only stage.

## Next stages

1. Extend dedicated original statement adapters for cash, interest-bearing debt, shares, earnings and required valuation denominators. Preserve actual taxonomy, fiscal year/period, source-original references, revisions/restatements and reporting/adjustment definitions. Establish supported acquisition/issuer evidence and budgets before connecting live data.
2. Build the sectioned read-only company dossier over this contract with explicit source/coverage gaps, definitions and details. Begin with fictional fixtures and preserve task-based Portfolio navigation.
3. Wire supported facts into Opportunities only after the remaining financial/source eligibility contract is reviewed. This conditional projection must not promote existing needs-data candidates to eligible.

Authoritative accounting, server-alert admission, authenticated history/model effectiveness, integrated acceptance and any production activation remain separate pending tracks. This small adapter stage does not change the rounded ~60% engineering estimate.
