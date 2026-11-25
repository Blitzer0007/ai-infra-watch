# Shared in-flight market reads — 25 November 2026

The shared server market-data router cached completed quotes/history but did not share pending loads. Simultaneous cache misses for the same symbol/range could each start an identical provider chain, increasing avoidable request pressure. No production rate-limit incidence or quota balance has been measured here.

The router now shares a pending read within the same warm Node process. Keys retain the existing request kind, normalized symbol and history range. Quote/history, different symbols and different ranges remain separate. Completed cache lookup happens before sharing: an explicit quote refresh still bypasses cached data, while concurrent refreshes can share an actual pending load. A normal cached quote remains available during refresh.

Pending entries are removed after success or failure. A later request can recover after all providers failed; no rejected promise becomes a permanent result. Existing provider order, attempts/timeouts, cache TTLs, normalization, stale labeling and quality metadata are unchanged. Raw fallback cannot gain adjusted-history eligibility through sharing.

This is **per-process identical-read deduplication**, not a global rate limiter, distributed cache, provider budget or account-wide quota. Separate serverless instances can still perform duplicate requests. It does not change the separate public quote controller, introduce retries/background refresh/polling, or guarantee provider availability or plan support. No account/portfolio rows are stored in the pending map; it shares the existing market-data result only.

Six new deterministic mocked-transport tests cover concurrent history/quote sharing, normalized keys, symbol/range/kind separation, forced refresh versus cached reads, failure cleanup/recovery and expired-cache stale metadata. They exercise observable upstream request counts rather than private map internals. Together with normalization tests,14 targeted cases passed. Node tests run with stripped environment and fake credentials; no provider call is live.

The application UI and response fields are unchanged in this increment. Local full regression/TypeScript/security results and current-head CI links are recorded in the PR/Cloud handoff. Previous358f7ed evidence is historical after this change. No deployment, production-secret access, database modification, live polling, AI activation or Telegram send is included.

Continue draft PR189. Original broker evidence, authentic source/adjustment/session coverage, actual provider access/entitlements and independent financial/model/forecast validation remain prerequisites. See the [remaining-work register](release2-remaining-work.md) and [continuation checkpoint](CODEX-CONTINUATION.md).
