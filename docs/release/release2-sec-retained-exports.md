# Release 2 — retained SEC native-export review

Implemented offline in Codex Cloud on the existing feature branch, 14 November 2026. This adds a bounded reader over supplied SEC-shaped listing/companyfacts JSON exports and feeds the existing raw statement producer and independent validator. It closes an engineering gap between retained bytes and normalized observations. **It does not authenticate SEC content, a ticker/issuer mapping, historical availability or financial correctness.** No runtime UI/API/provider path is connected.

## Input and output

`server/services/secRetainedExports.js` exports `reviewRetainedSecExports({request, manifestBytes, expectedManifestSha256, artifacts})`.

- `request` has an exact `symbol`, ten-digit `expectedCik`, exact `expectedExchange`, explicit `assessedAt` and one to three explicit instant/annual `periods`. No symbol aliasing, latest-period selection, path, read callback, credentials or parallel normalized values are accepted.
- The `sec-export-manifest-v1` manifest names two opaque artifact IDs and declares their requested/final URLs, HTTP status, JSON content type, retrieval, byte lengths and SHA-256 values. Its separate expected SHA-256 binds metadata as well as artifact references. A caller able to change bytes and repin the manifest can create another consistent declaration: pin agreement is not an authenticity or external trust guarantee.
- `artifacts` is an already-loaded Map of byte arrays. The reviewer copies and checks exact bytes before parsing. It performs no file, network, storage, configuration or ambient-clock read. It returns normalized allowlisted statements and bounded references, not raw exports, unrecognized provider fields or error bodies.
- Output is `conditional` with independently reconstructed partial statement snapshots, or `needs-data` with **no statement snapshots** and a fixed reason code. Bindings record which bytes were inspected/matched; matching bytes alone cannot establish valid content. All source/issuer/historical/decision/valuation/aggregation authority stays false. Acquisition usage remains unknown; zero calls describe this offline review only.

The fixed demo reads only invented repository files:

```sh
env -i PATH="$PATH" node scripts/sec-retained-exports-demo.mjs
```

It accepts no arguments or external paths, uses a reviewed pin outside the manifest and marks the result fictional. This command runs in Codex Cloud. It is not an import, acquisition job, model run or application activation. The fiction declaration is retained at review level; child observation contracts retain their existing unverified simulation/source semantics and cannot certify authenticity independently of that review context.

## Native parsing and source scope

Unlike the existing forecast archive's deliberately canonical export encoding, this reader accepts ordinary native JSON whitespace/key ordering and retains hashes of the original byte encoding. Before JSON parsing, a bounded structural scan rejects duplicate decoded keys (including escaped spellings), malformed/trailing JSON, nonfinite JSON numbers, invalid UTF-8, BOMs and excessive nesting/node counts. Number tokens are limited to 128 characters; unsafe integers, nonzero underflow to zero and fractions that round into integers (including issuer IDs) are rejected. Ordinary decimal/exponent encodings of exact supported integers are accepted. It does not normalize and then hash a reconstructed object. Other fractional numeric declarations still use binary64; original lexical precision is not certified.

The supported listing shape is the native `company_tickers_exchange.json` `{fields,data}` table with exactly the four columns `cik`, `name`, `ticker`, `exchange`, in any order. Every row is checked; malformed unrelated rows cannot be silently filtered away. Exactly one row must match the requested ticker, and its CIK and exchange must match the explicit request. Duplicate ticker rows are ambiguous even when identical. Distinct share-class tickers for the same CIK remain separate; no punctuation/case, exchange/MIC, ADR or economic share-class conversion is inferred. A selected null exchange is unsupported. Empty/absent mapping does not prove delisting or an empty financial history.

Companyfacts must have the supported native `{cik,entityName,facts}` shape and the same CIK. The two supplied legal-name strings are retained with an exact/different-declarations comparison; different spelling is neither issuer verification nor proof of an identity mismatch. The listing snapshot is not evidence of the listing at a prior financial-period date, and this reader establishes no historical ticker mapping or security identifier.

Only the exact HTTPS SEC company-ticker endpoint and exact ten-digit CIK companyfacts endpoint are admitted as **declared metadata**. Requested and final URLs must both match; queries, credentials, aliases and declared redirect destinations are rejected. Status must be 200 and content type JSON (optional UTF-8 charset). No TLS session, actual redirect chain, request execution, publisher ownership or HTTP response is observed by this offline function. Declared URL/status agreement cannot certify that an export came from SEC. Both supplied retrieval instants must be no later than assessment at microsecond precision; no ambient clock, freshness certificate or independent capture attestation is introduced.

Each source can instead declare `not-configured`, `rate-limited`, `timeout`, `transport-error`, `no-data` or `unavailable`, without an invented retrieval. Those states remain distinct. Listing failures stop before companyfacts bytes are read. Missing, altered or unsupported bytes cannot restore earlier successful observations. Unknown artifact IDs and private extra metadata fail closed without echoing their values.

## Statement and resource boundaries

For each requested period, the existing producer receives only the parsed companyfacts and declared companyfacts retrieval. The independent original-row validator reconstructs its receipt. All requested periods are withheld on an invalid statement payload/receipt or shared-accession metadata conflict. Partial coverage stays partial, supported zero/loss EPS stays distinct from missing data, and unsupported/unclosed newer vintages cannot fall back to an older success. Borrowing components, dates and share bases remain separate; no debt sum, EBITDA, P/E, EV or EV/EBITDA is added.

Bounds: 16 KiB manifest, 4 MiB listings, 16 MiB companyfacts; 30,000 listing rows; JSON nesting 32 and 400,000 value nodes per document; at most three periods. Actual bytes are checked independently of declared lengths; shared-memory buffers are rejected and input copies prevent later caller mutation. Existing per-period recognized-statement limits remain 500 rows per concept and 2,000 total. These conservative limits may reject a legitimate large or differently shaped native export; that yields needs-data, never completeness or financial authority. These are local workload bounds, not vendor entitlements, measured live quotas or cross-worker admission.

## Evidence and remaining prerequisites

39 deterministic Node cases exercise pinned/native bytes → exact listing → original statement rows → independent admission, with ten invented observations across three periods. They cover failures, pins, request/metadata widening, malicious URLs, chronology, duplicates, malformed encodings/numbers, actual byte/node/row/depth limits, identity ambiguity, name differences, same-CIK distinct classes, cross-period filing conflicts, partial cash coverage, newest-vintage withholding, isolation, forbidden clock/network calls and the actual fixed-pin demo. The full 1,462-case Node suite, TypeScript, production build and 25 workflow-safety tests pass locally; all 25 workflow YAML files parse. The existing large-bundle warning remains. Exact-head CI evidence is recorded in draft PR #168. Fixture-only/demo changes trigger Frontend CI's complete Node suite. No new browser tests are needed because this stage adds no UI, endpoint or mounted consumer; existing dossier/browser regressions remain unchanged.

Before real holding integration: obtain suitably authorized development acquisition, publisher/transport and independent capture evidence; review retention/license/privacy terms and budgets; establish authentic issuer/listing/security-class/context coverage and historical mappings; retain original filings/acceptance evidence separately; and review the broader taxonomy, debt/lease/adjustment/EBITDA and compatible valuation contracts. File hashes and URLs cannot substitute for those facts. Live X monitoring separately requires authorized account/source verification, licensed acquisition, authentic historical evaluation, scheduling and delivery reviews.

No production credential, Supabase operation, live polling, provider/model call, Telegram message, merge or deployment is included. The rounded core engineering estimate remains approximately 60%; an additional offline integrity boundary does not establish production readiness.
