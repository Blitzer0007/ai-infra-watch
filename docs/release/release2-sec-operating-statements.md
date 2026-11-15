# Release 2 — annual operating statement declarations

Implemented offline in Codex Cloud on the existing feature branch, 15 November 2026. This extends the financial adapter with a separate annual income/cash-flow profile, independent original-row admission and a fixed retained-export demo. **It does not widen the existing core-v1 receipt or connect new financial data to holdings, the dossier, council, scanner or valuation calculations.**

## Separate annual profile

`buildSecOperatingObservations(request)` in `shared/secStatementObservations.js` returns `sec-operating-observations-v1`. Its closed request shape matches the core adapter: explicit symbol, expected CIK, assessment/retrieval clocks, one requested period and a loaded original companyfacts source or explicit source failure. The new entry point requires a non-null annual start; no instant, quarterly/YTD, latest-period or fiscal-year inference is added.

| Metric | Original us-gaap tag | Declaration policy |
| --- | --- | --- |
| Contract revenue excluding assessed tax | `RevenueFromContractWithCustomerExcludingAssessedTax` | Signed USD; distinct revenue definition |
| Revenues | `Revenues` | Signed USD; separate declaration |
| Net sales | `SalesRevenueNet` | Signed USD; separate declaration |
| Operating income (loss) | `OperatingIncomeLoss` | Signed USD |
| Net income (loss), declared scope | `NetIncomeLoss` | Signed USD; no substitute profit/taxonomy or ownership-scope inference |
| Operating cash flow | `NetCashProvidedByUsedInOperatingActivities` | Signed USD |
| PP&E cash payments | `PaymentsToAcquirePropertyPlantAndEquipment` | Nonnegative USD; observed zero retained |
| Depreciation, depletion and amortization | `DepreciationDepletionAndAmortization` | Signed USD; statement/expense/adjustment context unverified |
| Share-based compensation | `ShareBasedCompensation` | Signed USD; statement/expense/adjustment context unverified |

Revenue alternatives are **not** selected, combined, reconciled or substituted. Different declarations may coexist with their exact tags and values; this does not authorize an aggregate revenue measure. Negative income, cash flow or a signed declaration is not replaced with zero. The signed policy retains supplied values without certifying economic interpretation; a negative PP&E-payment value is withheld under this particular payment definition.

All facts retain exact requested dates, USD unit, original row index/tag, accession/form/filing day, filing-focus FY/FP, calendar frame, retrieval and conservative publication bounds. Filing FY/FP do not become fact fiscal labels. Annual facts support 10-K/10-K/A with FY filing focus and 300–400 elapsed-day periods. If supplied, an operating calendar frame must have the annual `CYyyyy` form, with no quarterly/instant suffix; its calendar year is still not proof of the issuer's fiscal year. Other taxonomy, currency, periods and forms remain unsupported.

The supported tags do not establish dimensional/consolidation/security context, reported-versus-adjusted definitions, original source precision, publisher truth or historical availability. A DDA tag can include depletion and may occur in different statement contexts. Neither it nor share-based compensation can be treated as a verified EBITDA add-back or an income-statement D&A expense. No EBITDA, growth, margin, free cash flow, debt sum or valuation formula is calculated by this profile. Existing council formulas remain separate and unchanged.

## Independent checks and compatibility

The producer reuses the bounded projection machinery under a distinct frozen concept registry and version. The validator's separate original-row walk and reconstruction now expose `validateSecOperatingReceipt(request, receipt)` → `sec-operating-admission-v1`. It does not call the producing adapter. Both continue sharing policy definitions, limits and calendar primitives; this is implementation/input-binding independence, not independent accounting-policy review or publisher authentication.

Checks retain newest-vintage selection before value admission, withholding of malformed/unsupported/unclosed newer records, duplicate conflicts, amendments without a restatement certificate, shared-accession metadata consistency, exact microsecond chronology, explicit source failures, sanitized output and fresh reconstructed objects. Every requested operating metric remains in missing coverage when unavailable; full statements or an empty financial history cannot be inferred. Simulation declarations withhold observations. All successful observations remain partial and unverified, with source/issuer/decision/valuation/aggregation authority false.

Core-v1 requests, concept coverage, sign/frame rules, output version, normalized fields and resource scope remain unchanged. A hash captured **before** this extension binds the three existing fictional core normalized snapshots. Tests enforce that exact baseline and reject cross-profile receipt substitution/relabeling. The old retained-export demo still yields its ten original observations; adding large unrelated operating concepts does not change core-v1 recognition or budgets.

## Retained-export demo and limits

`reviewRetainedSecOperatingExports(args)` in `server/services/secRetainedExports.js` reuses the existing bounded native-byte parser, separate manifest/artifact pins, exact listing/ticker/exchange/CIK checks and declared URL/clock/failure review. It accepts at most three explicit annual periods and returns `sec-retained-operating-review-v1`. Invalid source/receipt payloads and cross-period filing conflicts withhold all snapshots; supported partial coverage stays partial. The existing core reader does not silently activate this profile.

```sh
env -i PATH="$PATH" node scripts/sec-operating-exports-demo.mjs
```

The Codex Cloud demo accepts no arguments or external paths. It uses a fixed pin outside a fictional manifest, native invented companyfacts and the existing fictional listing bytes. Fourteen declarations cover two explicit annual periods, including a declared net loss; the two absent revenue alternatives remain missing in each period. This is not real company data, model evidence or a retained filing document. Raw exports and unrecognized source text are not copied into the normalized output. Acquisition usage is unknown; zero provider/model/database calls refer only to the projection/review.

Existing limits remain: 500 rows per recognized concept across units, 2,000 recognized rows per period, eight units per concept and 80 findings. Operating and core registries each have their own recognition scope; they do not bypass each other's reviewed limits or certify a combined source workload. Retained native bytes remain bounded at 16 KiB manifest, 4 MiB listings and 16 MiB companyfacts, 30,000 listing rows, 32 JSON nesting levels and 400,000 value nodes per document. The reader copies inputs, rejects shared-memory bytes and keeps source-unavailable bodies uninspected. No filesystem, network, configuration or ambient-clock call occurs inside the adapters.

## Evidence and remaining work

48 new Node cases cover annual projection and independent admission, signed/zero/loss/tiny values, PP&E sign gates, revenue alternatives, unknown statement context, annual frame/form/period scope, currency/taxonomy gaps, all source failures, identity/simulation, vintage/clock/filing conflicts, receipt tampering, resource limits, old core compatibility and both actual fixed-pin demos. The full 1,532-case Node suite, TypeScript, production build, 25 workflow-safety checks and all 25 workflow YAML parses pass locally. The new operating registry, retained reviewer and fictional bundle are excluded from browser assets. The entry remains about 1,764 kB / 490.4 kB gzip, with the dossier about 43.4 kB / 13.5 kB gzip; the existing large-bundle warning remains open.

The new operating fixture/demo paths trigger Frontend CI's full Node suite even on fixture-only changes. This stage adds no browser UI or mounted consumer; existing dossier, valuation/glossary, holding/navigation and other mocked-browser regressions remain in CI. Exact-head results are recorded in draft PR #168.

The [versioned annual dossier consumer](release2-operating-dossier-ui.md) now adds explicit fictional inspection with matching/duplicate-definition handling and cross-source conflict/dependency withdrawal. That follow-up intentionally brings the optional operating registry into the deferred browser view while keeping raw fictional inputs development-only. Authentic acquisition/issuer/context evidence, broader statement/taxonomy/debt/lease/EBITDA coverage, compatible price/share/earnings bases, real holding data, financial-policy review and actual valuation calculations remain pending. The approximate 60% core engineering estimate is unchanged. Event Risk Radar live acquisition, authenticated account/source evidence, real-history evaluation, scheduling and delivery prerequisites remain separate.

No production credentials, Supabase operations, provider/model calls, live polling, Telegram sends, merge or deployment are included. No dependency, endpoint, schedule or sender is added.
