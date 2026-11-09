# Offline retained calendar and price archive binding

Implemented in Codex Cloud on 9 November 2026, following the [session/history preflight](release2-forecast-session-preflight.md). This increment binds that evaluator to retained export bytes. It checks integrity against a separately selected manifest digest and derives input fields from parsed archive records. It does not authenticate a publisher, prove historical publication, retrieve vendor data or connect to production tracking.

## Interface and trust boundary

`server/utils/forecastArchiveAdapter.js` exports `evaluateArchivedForecastWindow({ request, manifestBytes, expectedManifestSha256, artifacts })`.

- `request` contains only protocol version, symbol, venue, currency, 5/20-session horizon, decision instant and assessment instant. Caller-supplied calendars, prices, histories, eligibility flags and other fields are rejected.
- `expectedManifestSha256` is mandatory and must be selected outside the supplied bundle. A bundle cannot authorize its own replacement digest. In the demo, the pin is a separately committed literal in the reader, not a value loaded from the manifest. Pins selected by an untrusted caller cannot establish trust.
- `manifestBytes` and artifact values are already-loaded `Uint8Array`/Buffer data. The adapter has no filesystem, path resolution, loader callback, network, credentials, clock, model or writer capability. Artifact IDs are opaque bounded labels, never paths/URLs. It does not invoke an overridden Map retrieval method.
- `artifacts` is a Map containing at most three listed IDs. The adapter copies selected bytes before hashing/parsing. Shared mutable byte storage, extra IDs, absent selected bytes and oversized records are withheld. There is no arbitrary file-reading interface.

**Every result retains `sourceVerified:false`, `productionEligible:false` and `predictiveValidityEstablished:false`.** A reviewed hash establishes that bytes match a selected artifact, not that a vendor produced it, a claimed publication happened then, the archive is complete or a model predicts well. This is a retained-export adapter, not a native Yahoo/SEC/exchange-calendar downloader or a completed source-authentication system.

The previous Python historical-evidence validator remains unchanged. Its hash checks are useful for file integrity, but a matching hash alone does not bind a separate claimed bar to that file's contents. This new path avoids parallel numerical/time claims: it parses and projects the actual pinned calendar/history payload into the evaluator. It neither grants nor widens that older validator's PASS semantics.

## Manifest and export format

The `forecast-evidence-manifest-v1` record contains a bundle ID and calendar/features/outcomes references. Each reference binds an opaque artifact ID, source record ID, source ID, calendar revision/history vintage ID, exact byte length and lowercase SHA-256. IDs, digests and source/record/version tuples cannot be aliased across roles. Outcomes may be absent; they remain required once the target closes.

The manifest is limited to 32 KiB, each of three artifacts to 2 MiB, and each calendar/history to the existing 4,000-row limit. No directory traversal, URL resolution, redirects, archive extraction or external lookup occurs. The caller is responsible for any separately approved loading layer; the adapter itself does not accept filesystem paths.

Exports use a deliberately narrow encoding: UTF-8 bytes equal to `JSON.stringify(parsedObject) + '\n'`. Invalid UTF-8, BOMs, duplicate object keys, nonfinite numeric literals and non-round-tripping forms are rejected even if their hashes match. This is a versioned compact retained-export format, not a claim of RFC 8785 canonicalization or support for arbitrary raw vendor JSON/CSV. A new exporter/format needs separate source and normalization review.

| Pinned archive | Fields checked and projected |
| --- | --- |
| `forecast-calendar-archive-v1` | Exact source/record/revision tuple, publication instant, venue/timezone, inclusive coverage and every declared open/closed day → preflight calendar and availability cutoff |
| `forecast-price-archive-v1` | Exact source/snapshot-record/vintage tuple, publication instant, identity/currency/basis/stale state and coverage → preflight history envelope |
| Every price record | Retained record ID, session date, raw/adjusted close and publication instant → the corresponding preflight bar; no caller price or timestamp is substituted |

The existing preflight then checks session chronology, actual requested identity, basis, numeric validity, availability, exact window coverage, missing/duplicate/future bars and same-vintage endpoints. Correct hashes and header bindings do not bypass those checks. Microsecond comparison is now shared through `forecastInstantMicros`; existing preflight results/conventions are preserved.

## Phase behavior and receipts

A valid pinned calendar is planned first. Features are loaded next. Before target close, outcome bytes are not retrieved from the supplied Map, hashed or decoded; their receipt is `not-required-yet`. Missing or malformed future outcome bytes cannot turn a pending assessment into an outcome. This does not imply the caller has never loaded those bytes elsewhere.

After maturity, the exact outcome archive must exist and pass integrity/content/preflight checks. Missing target rows remain unavailable; a later bar is not substituted. Separate feature/outcome vintage and cutoff rules remain authoritative.

`receipt` reports manifest pin match, inspected artifact count/bytes, per-role header bindings and whether all **currently required** artifacts matched. `allRequiredArtifactsMatched:true` is an integrity/binding statement, not data eligibility or source verification. It can coexist with a preflight missing-data result for invalid prices/coverage. A pending receipt describes only calendar/features; it does not certify a future label archive. Errors are fixed codes, without input bodies, exception text, credentials or paths. Failed binding never returns a numerical outcome.

## Cloud demo and verification

From the repository in Codex Cloud:

```bash
node scripts/forecast-archive-demo.mjs
```

The reader opens only four explicitly named committed fictional files and accepts no external path/input argument. It uses a separately committed manifest pin and the actual adapter/hash/parser/preflight path. Its four cases are a conditional complete retained window, pending without outcome bytes, tampered artifact bytes and an unselected manifest. All source/production/predictive authority remains false. Retained fictional receipt: `/workspace/artifacts/forecast-archive-binding.json`.

**56 new cases** cover the complete composition; separate pins; changed bytes; valid-hash wrong source/record/version/identity/basis/time; duplicate/ambiguous JSON; missing/stale/future/duplicate bars; exact microsecond maturity; phase-specific inspection; malformed/oversized/shared byte storage; unlisted/path-like IDs; privacy/redaction; input/receipt isolation; no ambient clock/network; and the credential-free fixed CLI. They run in the standard unit suite. Exact runner/fixture paths are included in existing frontend/QA CI filters, without changing live/deploy/scheduled-job controls.

Local checks: **832 Node tests**, typecheck, build, source security, migration-manifest integrity and **25 offline workflow-safety cases** pass. Existing bundle-size warnings remain. No UI path or browser interaction is added; combined mocked-browser CI remains a regression check. Exact-head CI and any external installer failure are recorded in draft PR #168.

## Remaining integration

Authoritative real calendar/archive acquisition, publisher authentication, independently supported availability, raw-vendor-to-retained-export provenance and actual account licensing/coverage remain open. A digest and a publication field cannot establish those facts alone. No production data is used to fill the fictional bundle.

Next freeze chronological rolling-origin/model-lookback and purged train/validation/holdout rules, matched baselines and proper point/quantile/interval metrics with pending/missing coverage. Actual matured observations and time/market-cluster uncertainty remain necessary before performance claims. Existing legacy writers, horizon identities, outcome records, schema, model selection, schedules and delivery controls remain untouched. No new dependency, endpoint or Vercel function is added.

There is no live financial-data/SEC/NVIDIA/JEV call, production secret access, hosted database operation, real message, merge or deployment. Rollback removes the isolated adapter/demo/fixtures/tests and the added CI path entries; no data repair is required.
