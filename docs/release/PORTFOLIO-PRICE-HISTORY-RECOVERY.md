# Portfolio price-history recovery — 24 November 2026

The user should be able to open Portfolio → Performance → Holding price chart, load closing prices from the existing company-history route, and switch companies/ranges while account reconciliation is pending.

## Confirmed code issues and repair

Performance explained withheld account-return charts but did not render the existing individual holding-price chart. Opening that chart required a separate holdings-detail journey. The browser cache also reduced the history response to date/price arrays, discarding provider, currency, stale/cache declarations and the original browser load time. `Number(point.price)` could admit null/boolean/string inputs, and duplicate/conflicting or impossible dates were not checked.

The Performance workspace now exposes the existing closing-price chart and a holdings selector. It waits for the existing three-in-flight history batch and reuses its cached response. Range changes within the cache lifetime reuse the packet; MAX remains an explicit separate range request. Default Overview/holdings-list navigation still does not acquire optional detail history. Canceled views stop queued batch work as before.

`marketHistoryPacket.ts` retains the declared provider/currency/stale/cache metadata and original browser load time. Missing declarations stay unknown. It accepts positive finite numeric closes and real calendar dates through the load day, collapses identical duplicate dates, rejects conflicting dates/wrong declared symbols/oversized packets, and reports omitted invalid/repeated points. It makes no issuer-authenticity or historical-coverage claim. The declared response symbol is not independent upstream identity verification.

The chart displays provider, currency and latest returned close; stale cached history is explicitly marked. It labels values as returned closing prices and keeps adjusted-return/source coverage unverified. Browser-cache hits do not invent a newer retrieval time. Company/range changes do not render the previous packet under a new title. Small-price formatting uses the existing nonzero-preserving formatter. Provider error bodies are not shown. Animation is disabled for this price series so a partial transition does not resemble an actual historical move.

## Accounting and provider limits preserved

This is a market-price display repair. Account return, account pressure, same-cash-flow benchmark and P&L gates are unchanged. Missing full broker/cash-flow/corporate-action evidence cannot be repaired by drawing a price line. No quantities are rounded, no execution timezone is assumed and no reconciliation flag is enabled.

No new provider, provider credential, public-route capability or fallback chain was added. The existing Yahoo → Finnhub → Alpha Vantage history route is reused. Genuine provider outages can still leave the chart unavailable. Raw closing-price display does not establish adjusted historical returns, complete sessions, source rights or authentic issuer mapping. Other consumers of the point arrays retain their existing source-acceptance limitations.

## Verification evidence

| Boundary | Evidence |
| --- | --- |
| UI → request | Mocked browser tests open Performance, switch company/range and assert one shared 1Y request per holding; initial holdings list still defers optional history. |
| API → provider → response | Actual company-history controller unit test uses a fictional Yahoo response through a mocked transport; raw and adjusted closes remain distinct, and provider/currency/status are retained. No real provider call. |
| Response → cache | Unit cases cover retained/unknown metadata, null/boolean/string/zero/nonfinite prices, invalid/future/duplicate dates, mismatched symbols and packet limits. |
| Cache → chart | Browser cases render the actual chart, label stale/unknown packets, keep malformed/error states empty, preserve load timestamps on cache hits, and avoid previous-company metadata. |
| Accounting isolation | The same browser cases assert account-return charts remain withheld; all observed API operations are reads. |
| Layout/runtime | Targeted tests cover mobile width, no page errors or writes; fictional mobile screenshot inspected. Production-bundle no-passive-write and full exact-head CI are recorded in the PR/Cloud checkpoint after verification. |

Local checks:1,169 Node tests, TypeScript and17 targeted browser cases passed. The final static-chart rendering check and two production-bundle exclusion/no-passive-write checks also passed; staged-file security/whitespace checks passed. Full CI is required for the pushed source; previous be87e65 workflow results are historical. No deployment, production secret access, live provider certification, database change, polling or Telegram send is included.

Files: `src/components/PortfolioIntelligence.tsx`, `src/utils/marketHistoryPacket.ts` and its tests, `server/api/marketHistoryDisplay.test.js`, `qa/test_milestone1_portfolio.py`. Existing production controls and manual development-agent flags stay unchanged.

Next prerequisites: actual provider availability/source/adjustment verification, original broker precision/timezone and complete reconciled accounting evidence. Use the [remaining-work register](release2-remaining-work.md) and [continuation checkpoint](CODEX-CONTINUATION.md); do not represent all missing-data issues as resolved by this display repair.
