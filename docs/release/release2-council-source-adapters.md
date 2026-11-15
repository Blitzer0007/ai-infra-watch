# Council source receipts and manual inspection

Implemented in Codex Cloud, 9 November 2026, on the Release 2 feature branch. This extends the [development-only council](release2-portfolio-council.md) with auditable financial/risk calculations and reuse of the already-loaded catalyst calendar. All source/provider/model verification uses fictional inputs or intercepted transports; no live SEC, financial, NVIDIA or TypeSafe request was made.

Follow-up: [versioned conditional admission](release2-council-admission.md) now checks retained lineage independently in Python and handles date-only publications as uncertainty ranges. The v1 council gates described below remain unchanged; the new manual v2 path never rewrites original timestamps or authenticates a source.

## Resulting user flow

Open JEV Portfolio Lab's research council, choose a company and horizon, then **Inspect loaded sources**. Inspection makes no request. It captures a minimized numeric packet plus a local source receipt showing declared issuer CIK, actual retrieval field, filing accessions, original filing dates, periods, calculation methods and input values. **Analyze loaded evidence** uses that frozen packet. Feed updates cannot change it; another explicit inspection captures new inputs. Company/horizon changes discard the old inspection/results. The fictional demo clears the unrelated loaded receipt.

The model receives numeric observations only. Accession/filing-input details stay in the local receipt, outside the model request. Quantities, costs, theses, notes, credentials, arbitrary source prose and URLs are omitted. The existing model-call/attempt/concurrency/time limits remain in force. Inspection consumes no model attempt and adds no provider request.

An explicit stale/conflicting status or malformed stale/simulation marker cannot become reported quote evidence merely because timestamps look recent. The reproduced mapping gap is corrected by withholding its reporting basis; the existing quality gate therefore withholds usable coverage.

## SEC adapter and calculations

The pure `server/utils/councilSecAdapter.js` consumes already-loaded companyfacts data plus an explicit requested symbol, expected CIK and retrieval timestamp. It performs no I/O. The existing peer-fundamentals path attaches its receipt only when the council development guard is enabled; Vercel/production never adds that field. The same existing companyfacts fetch is reused, with no extra source lookup. The parent Lab preserves the new field separately from legacy peer metrics.

The `council-sec-v1` receipt is revalidated in the browser, including original input references, units, dates, metric mapping, periods and recomputed arithmetic. It has at most four derived observations, two inputs each, fixed issue codes and explicit false source-authenticity authority. A mismatched issuer, malformed source/unit block or more than 10,000 selected USD rows makes the receipt unavailable. This is a selected-row processing ceiling, not a new bound on the legacy HTTP response or an account-wide provider budget.

| Metric | Defined calculation | Required alignment |
| --- | --- | --- |
| Revenue growth | `(current revenue − prior revenue) / prior revenue × 100` | Same full-revenue tag, same accession/filing date, adjacent annual periods, positive prior revenue, nonnegative current revenue, annual durations within fourteen days |
| Operating margin | `operating income / revenue × 100` | Same annual period/accession/filing date; positive revenue |
| Free cash flow | `operating cash flow − capital expenditure` | Same annual period/accession/filing date; nonnegative reported capex |
| Liabilities / equity | `total liabilities / stockholders' equity` | Same point-in-time period end/accession/filing date; nonnegative liabilities and positive equity |

Free cash flow is this explicit non-GAAP definition. It is not silently treated as a directly reported standardized metric. Liabilities are not renamed debt; `liabilities_equity` is a distinct risk metric. Negative free cash flow and genuine zero margins/cash flow/ratios remain valid numbers. Nonfinite results, boolean/string values, future/invalid filing dates, missing accessions, mismatched periods/vintages and invalid denominators withhold the affected observation.

Selection admits only explicit USD `10-K`/`10-K/A`, FY rows and strict dates/accessions. Duration facts require 300–400 elapsed days. For a given tag/period the newest declared filing date is selected; conflicting values/accessions on that date withhold that tag, as do competing annual starts with the same end. Conflicting complete-revenue tags withhold revenue-dependent calculations. Later restatements retain their original references; comparative growth cannot mix filing vintages. Cross-tag accounting/taxonomy equivalence is not inferred.

## Original precision and authority

SEC companyfacts supplies filing **dates**, not exact publication/observation instants. The receipt preserves `filed_on` as date-only. It never turns that date into midnight, copies retrieval into observation, or borrows a publication instant. Derived observations carry `basis: unknown`, nullable observation/publication instants and their actual period bounds. Balance-sheet ratios keep a null period start; the council's risk-period check now accepts an explicit point-in-time end without inventing a duration start.

Consequently these inputs still fail the v1 council's time/basis admission gates. This is intentional: the adapters improve traceability without pretending to establish source truth or complete directional eligibility. Legacy peer-metric producers/consumers retain their existing timestamp and scoring contracts in this increment. The council no longer trusts their synthesized observation time; broader legacy correction remains separate compatibility work. A `verified` legacy label cannot replace or override an unavailable/invalid source receipt.

The requested symbol/CIK and companyfacts CIK must match, but this checks supplied identifiers rather than independently authenticating issuer identity. Input hashes, public endpoint names and accessions are not publisher/availability certification. Source authenticity, forecast validity, decision eligibility and allocation/delivery authority remain false.

## Already-loaded catalyst adapter

App passes its existing in-memory calendar snapshot to the Lab. Opening the Lab or inspecting it does not load/refetch earnings. Unavailable and successfully empty calendars stay distinct; source coverage remains unknown.

The adapter resolves the existing correction lineage, withholds unresolved revisions, ignores superseded/cancelled/past entries and selects the nearest eligible exact-time event for the selected symbol. Its countdown is **elapsed UTC days** at the frozen assessment instant, including fractions, not exchange sessions. A date-only event cannot produce a precise numeric countdown; its missing-time issue is shown instead. Estimated schedules remain estimates. Even a source-labelled confirmation yields an unadmitted derived basis, not a reported numeric fact. Observation time stays unknown; publication and retrieval are kept separately. No raw event title, source prose or URL enters the model packet.

Two quote observations, four SEC-derived observations and one exact catalyst fit the existing eight-record cap without truncation. Known metrics can now cover all four families descriptively, while unknown source/time/basis facts still require abstention.

## Validation

- 27 new Node cases: source arithmetic/units/zeroes, denominator and negative-capex gates, annual/filing alignment, restatement ambiguity, original date precision, issuer/bounds/privacy checks, exact receipt reproduction, actual existing peer-path reuse/production omission, immutable DTOs, explicit quote flags and catalyst certainty/revision/date-only behavior. All **917 Node tests pass**.
- Three new Python protocol cases bring council/API coverage to **49 cases**: the actual SEC wire projection remains unadmitted, point-in-time risk needs no duration start, and the retained demo receipt matches the current Python protocol. Broader offline agent/API/evaluation/safety checks pass **429 cases**, with eight live cases excluded. The existing fully mocked LLM transport case passes separately without its global stub override.
- Six council browser scenarios, including two new receipt/calendar stories, run through the actual private JS relay and Python core with fake model/TypeSafe drivers. Combined with existing calendar regression coverage, **15 browser cases pass**. They prove explicit zero-request inspection, formula/filing display, frozen packets across feed refresh, no filing metadata/private text in model payloads, date-only countdown withholding, preserved calendar state, attempts/auth boundaries and absent normal-production UI. Fictional source receipts are captured at 360/768/1440 pixels with no horizontal overflow/page errors.
- TypeScript, production build, security scan, local migration-manifest integrity and whitespace checks pass. The existing large-JavaScript-bundle warning remains open. CI path filters now include exact council fixtures and Python task dependencies, so isolated contract/fixture edits trigger their consumer checks. No live/deployment trigger, secret binding, schedule or activation control is changed.

Fictional fixtures are in `qa/fixtures/council-{sec,source-receipt}.fictional.json`; screenshots remain outside Git under `/tmp/aiw-council/portfolio-council-sources-fictional-{360,768,1440}.png`. They are test data, not company or model-performance results. The prior scoped REA investigation remains the reference-mirroring basis; this source-contract increment makes no additional REA runtime/performance claim.

## Remaining work

Next define versioned family-specific admission for duration facts, point-in-time balances, derived-input lineage and date precision; connect suitable original filing/acceptance evidence by accession without inventing observation timestamps. Add labelled grounding/adversarial evaluation cases before a separately approved small live NVIDIA/TypeSafe development test. Authentic source/issuer/availability evidence, complete catalyst coverage, additional financial currencies/periods/taxonomies, company dossier, Node/account-wide budgets and predictive/outcome validation remain pending.

Core Release 2 engineering remains approximately 55% complete; no production rollout is included. No production secret, hosted database, Telegram delivery, merge, deployment, new dependency or new Vercel function is involved.
