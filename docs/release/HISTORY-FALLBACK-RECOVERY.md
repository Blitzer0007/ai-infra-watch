# Historical-data fallback recovery — 25 November 2026

The existing router accepted a finite zero/negative close as usable primary history. A Yahoo response containing only such rows could stop the fallback chain, while the stricter browser chart rejected all points and showed no data. This is a reproduced code-path defect; it is not proof of the frequency or cause of production outages.

## Repair

The existing Yahoo → Finnhub → Alpha Vantage chain now validates adapter observations before recording provider success. If none are usable, the next configured provider is tried. Mixed packets retain valid positive numeric closes and real dates through the assessment day, with omission counts. Identical duplicate observations collapse; conflicting raw or adjusted closes reject that provider. Source values are never filled with zero or guessed USD currency.

`market-history-quality-v1` records counts of adapter observations, discarded rows, repeated rows and invalid adjusted values. These counts do not certify source identity, session completeness or rights. They describe only the received adapter packet.

Yahoo/Finnhub Unix timestamps must be positive finite numbers before conversion; missing/string/boolean timestamps cannot fabricate dates. Alpha Vantage's decimal strings are decoded explicitly. Missing/boolean closes cannot become zero/one. Other providers' numeric values stay strict. Raw-only fallback prices remain raw-only; no adjusted history is synthesized.

`requireAdjustedHistory` now rejects coerced values, impossible dates and normalized packets with omissions, duplicates or invalid adjustment metadata. This preserves the distinction between displayable raw history and compatible supplied adjusted observations. It does not establish complete market sessions, authentic accounting, forecast validity or decision eligibility.

Data Health uses the same numeric/calendar rules in its pure summary, and explains why remaining rows can show 100% adjusted values while adjusted use is withheld. Its redacted copied diagnostics retain only the new numeric omission counters. Storage retrieval, private authentication, schema, database access and sender/scheduler paths are unchanged.

Cache TTLs, stale-cache labeling, provider order, existing timeout/attempt policy and lack of retries are preserved. An expired cached partial packet retains its quality metadata if all providers subsequently fail. No new endpoint, provider, credential, polling or live monitoring was introduced. Existing fallback providers still need valid account configuration and supported plans; their real availability was not tested.

## Verification and evidence limits

- Eight new server tests cover all-invalid Yahoo → Finnhub fallback, explicit Alpha decimal decoding, partial packets, conflicts/duplicates, numeric/calendar validation, strict adjusted use, cache reuse/stale fallback and redacted failures. Mocked transports and fake credentials only.
- All 1,177 Node tests and TypeScript passed locally in a stripped environment with no production credentials. The eight-case targeted server group and earlier controller/health tests passed together (23 cases).
- Thirteen targeted browser cases passed, covering Data Health warnings/copied counters, mobile layout, existing chart behavior and no writes. The price-chart requests use fictional intercepted responses; the router fallback uses real adapter code with mocked upstream transports.
- Two local production-bundle exclusion/no-passive-write checks passed. Fresh exact-head CI is recorded in the PR/Cloud handoff after completion. Previous 6ffdb6f checks are historical after this increment.
- A read-only Vercel aggregate query was attempted for the existing project. The connector returned HTTP400/bad_request without usable request metrics. Schema lookup returned metric names without usable dimension details. No outage-rate, provider-health or entitlement conclusion was drawn; no runtime-log bodies, environment values, production secrets or private financial rows were retrieved.

The authenticated Data Health route is not called against production by these tests. Its Supabase-related storage path is unchanged. No Supabase modifications, deployments, live provider calls, polling, AI activation or Telegram sends occur in this increment.

Continue existing draft PR189. Production stays PR188; accounting reconciliation, broker precision/timezone/full records, compatible adjusted alternatives, independent forecast/model validation and Event Risk Radar live-source acceptance remain in the [remaining-work register](release2-remaining-work.md). Do not describe this repair as complete production data coverage.
