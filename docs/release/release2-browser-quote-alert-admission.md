# Browser quote-alert admission — offline safety follow-up

14 November 2026 · Codex Cloud · existing Release 2 feature branch / draft #168.

## Problem and scope

The [Radar safety baseline](release2-event-risk-radar-review.md) found that `alertEngine.ts:evaluateQuoteAlerts` accepted finite numbers without checking identity, freshness, simulation, units or session. An invalid sample could trigger a threshold, reset its deduplication flag, or consume the app's global bootstrap before a first valid sample arrived.

This increment fixes the **browser quote-detection path**. It does not activate Radar collection, modify server alert scanners/receipts, change recipients/schedules, or authenticate real publishers. Other valuation/accounting and backend-proxy concerns remain open. No hosted API, production URL, credential or real sender was used for implementation/testing.

## Behavior and compatibility

- Reuse `normalizeDecisionQuote` / `evaluateQuoteQuality`; add the requirements specific to automatic browser price alerts: matching explicit provider-returned symbol, declared live mode, raw USD units, exact valid market/retrieval instants, an explicitly open regular session, and market/retrieval age at most **15 minutes**. The shared two-minute future/ordering clock tolerance is unchanged. Date-only times, malformed quality flags, stale/simulated status, unknown provenance and comparable provider conflicts withhold detection. Provider labels/declared metadata do not prove source authenticity.
- Closed-session/last-close quotes remain usable where the existing decision/display contract permits them, but cannot create automatic browser price/move detections. The 15-minute alert freshness limit is deliberately stricter than the existing two-hour decision-review age policy. No price target, 0.1% minimum valid move threshold, two-times critical-severity rule or directional daily deduplication threshold is changed. Invalid move settings are withheld instead of silently falling back to 5%.
- Preserve missing daily change as missing; it cannot create a move alert. A fully admitted price can still evaluate an absolute price rule. This does not independently authenticate the provider's daily-return denominator, corporate actions or accuracy.
- The first eligible sample for each symbol/rule is a baseline. After invalid startup, a recovery quote already beyond the target does not become an invented crossing. A new or re-enabled rule similarly needs a baseline. A subsequent valid reset and crossing can emit. Bootstrap suppresses emissions while still recording eligible baselines.
- Invalid samples leave admission/threshold state untouched. Repeated market timestamps do not rearm or emit. Older or revised same-time price/change observations are withheld until a newer supported observation arrives. Each new UTC day establishes the move baseline; move setting changes/enabling also rebaseline. Each direction emits at most once per day, preserving the old daily direction policy.
- Separate versioned `aiw_quote_alert_admission_v1` local receipts retain only market time, price/change, active threshold conditions and daily move flags/threshold. Legacy `aiw_alert_state_v1` feed/catalyst flags and existing `aiw_alert_events_v1` history are preserved. Corrupt/old receipts rebaseline. Storage-read/write failure returns no detections to either sender. This is browser-local detection state, not proof of delivery, source authenticity or an authoritative trading ledger.

Supported providers missing returned identity, raw basis, explicit source mode or session provenance will now be withheld. In particular, the existing direct Finnhub quote path does not establish those missing facts; no requested ticker/currency/session is invented to make it pass. A valid fallback packet may qualify independently. Reduced detection coverage is intentional and must remain distinct from an all-clear or a live-data acceptance claim.

## Files and boundaries

- `src/utils/quoteAlertEvaluation.ts`: pure gate, bounded immutable receipt parsing and deterministic transitions with explicit clock. At most 500 quote/receipt symbols and 200 configured rules; each persisted symbol has at most 200 condition flags. No request, storage, provider/model, notification or environment access.
- `src/utils/alertEngine.ts`: retain public `evaluateQuoteAlerts`, with an optional explicit clock for tests; adapt local receipts/history and return admitted events. Existing browser/Telegram transport functions and their development/QA guards remain unchanged. Catalyst/feed evaluation uses its existing separate state.
- `src/App.tsx`: pass complete quote packets into the gate instead of filtering only finite scalars; preserve independent observations through both quote-refresh mappings. Existing requests/timers are unchanged; no new polling is added.
- `src/utils/quoteSourceMetadata.ts` / `src/utils.ts`: retain independent-observation declarations and raw stale markers through the existing fetch adapter. The adapter no longer turns malformed stale values into false before admission can inspect them. No provider call is added; the actual fetch adapter is exercised only with an in-memory fake response in tests.
- `src/utils/quoteAlertEvaluation.test.ts` / `qa/test_quote_alert_admission.py`: fictional regression vectors and actual Chromium execution of the public wrapper, pure gate and source adapter. The browser test fulfills one loopback document, then observes zero network requests/notifications. Its fake fetch response never contacts a provider. The offline QA job includes this check.

## Verification and remaining work

Local verification passed **1,092 Node tests**, including 55 new cases; **one actual Chromium admission/transport check**; **25 CI-safety checks**; TypeScript, production build, security audit, local migration-manifest integrity (32 files), workflow YAML and whitespace checks. Coverage includes stale/simulated/conflicting/malformed/identity/unit/session/time failures; initialization/recovery; invalid-sample non-reset; same-time/out-of-order observations; rule/day/settings baselines; valid crossing and daily severity/deduplication; unknown versus zero change; malformed/corrupt receipts; storage denial; immutable inputs; browser-bundle isolation; and real adapter preservation. Exact-head GitHub CI is a separate check. The existing large-bundle warning remains.

Pending before broader live acceptance:

1. Extend reviewed admission to independent server price-alert scanners and validate every sender/relay's authentication, input/correlation, deduplication and uncertain-delivery semantics. Do not infer server safety from the browser patch.
2. The subsequent [proxy hardening increment](release2-proxy-origin-hardening.md) removes header-derived destinations and tests redirect rejection. Hosted backend identity/configuration/protection acceptance and remaining transport/resource contracts are still pending.
3. Preserve unavailable P&L, separate invested cost from current valuation/weight, and complete remaining consumer/valuation parity and authoritative accounting coverage.
4. Present admitted/suppressed quote coverage in an appropriately scoped read-only UI. Existing source/decision disclosures are not a new browser-alert coverage dashboard.
5. Separately authorize licensed Radar development acquisition, authentic account/issuer mapping and independently retained historical captures; live monitoring and any scheduling/Telegram activation remain disabled.

No merge, deployment, production Supabase modification, secret retrieval, live acquisition/polling or real message was performed. No new dependency, endpoint, function, schema or schedule. The older ~60% core estimate is retained; this is a scoped safety increment, not production readiness.
