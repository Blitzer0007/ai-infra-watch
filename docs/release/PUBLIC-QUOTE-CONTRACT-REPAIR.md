# Public quote contract repair and Telegram verification

22 November 2026 · existing draft [PR #187](https://github.com/Blitzer0007/ai-infra-watch/pull/187) · `feature/data-health-evidence-states`

## Confirmed broken boundary

The public `/api/quote` rewrite dispatches to `server/api/quote.js`. That handler used a separate Yahoo parser, while Decision Center, the digest and provider diagnostics used `api/_market-data.js` with the shared `normalizeYahooQuote`. The HTTP handler dropped returned identity, currency, source mode, raw adjustment basis, time precision and declared session state. A genuine quote reaching the browser therefore lost fields required by the existing shared admission gate. Its one-day chart parser also fabricated a flat daily move, low/high and prior close when reference fields were missing, and silently rewrote CERE to CBRS.

## Repair

The HTTP handler now uses the existing shared Yahoo normalizer, symbol mapping and bounded error vocabulary. It requests the same five-day daily chart used by the internal adapter, allowing a properly aligned prior exchange-session close. It keeps provider-returned identity distinct from the requested ticker; missing metadata stays null and symbol mismatches are rejected. The public path remains **Yahoo-only** with one eight-second-bounded request; it does not gain access to configured Finnhub/Alpha Vantage providers or enable a polling job.

The in-memory 60-second cache preserves original observation/retrieval timestamps. Forced or expired failed reads do not relabel cached observations as fresh. HTTP responses are `no-store` rather than allowing five minutes of stale CDN revalidation. Unsupported methods and malformed symbols fail before upstream access. Provider errors return bounded reasons and attempts without raw messages or response bodies. Existing quote, accounting and alert admission policies are unchanged. After release, already-configured browser alert rules may receive genuinely eligible metadata where the old controller supplied an incomplete packet; no alert setting or sender is enabled by this patch.

No change percentage or source metadata is invented to make a value appear. The existing browser parser still withholds a display quote when a daily-move reference is unavailable. This patch repairs a confirmed HTTP contract defect, not missing vendor evidence or complete financial history.

## Verification

- 1,115 Node tests passed, including 19 additional cases across the HTTP handler, the actual frontend `fetchLiveQuote` helper and the existing Telegram Settings-test handler.
- Tests cover full metadata reaching the admission gate; missing, stale and simulated data staying blocked; prior-session daily-change calculation; no silent CERE rewrite; declared alias identity; cache expiry/force/time preservation; bounded errors/timeouts; one public upstream request; and invalid input/method rejection.
- Telegram tests use fictional credentials and fully intercepted transport. A labeled Settings test sends once without database/digest activity; unconfirmed Bot API 2xx results fail; unauthenticated requests never contact a sender.
- 28 mocked browser checks passed across evidence/quote diagnostics, Settings and the forecast/Telegram presentation contract. TypeScript and QA build passed. Production build, security scan and staged whitespace check passed. Fresh exact-head GitHub checks are recorded in the PR before handoff.

The actual client → controller → provider normalizer → shared admission flow is exercised with fictional transport. No live financial availability is inferred from those fixtures.

## Production Telegram result

The owner explicitly authorized a labeled production test. The Cloud browser failed to open Settings (`Browser Use could not read requirements`), and the runtime had no production access-token or Telegram credential binding. No environment-variable values were retrieved and no production test was sent by the agent.

The owner subsequently supplied a screenshot showing the existing **AIW · Telegram connection test** visible at **08:55** in the screenshot supplied on **22 November 2026** (client timezone: Asia/Kolkata). That is direct user-provided delivery evidence. Do not send a duplicate test under this authorization. No scheduled digest slot was replayed, and no production database operation was performed by the agent.

The Telegram brief improvements already shipped in merged PR #180 at main `529e956254bc73c12ed8d7f4ffa6510f9b3d4442`. The screenshot also shows a daily brief at 06:03, with 65 independent verified outcomes, split 52 for five-day and 13 for twenty-day horizons. The twenty-day minimum shown is 25; transport success does not remove that evidence prerequisite or establish complete accounting.

## Live evidence limitations and next steps

Recent production log aggregates for quote and Telegram messages returned no matching entries in the available 30-minute window. A one-hour query exceeded the project's retention boundary. An unauthenticated public Yahoo probe from Cloud failed at the connection layer; it returned no vendor response. These observations do not prove a production provider outage, a missing API key, or provider health.

After separately approved release, verify this repaired HTTP payload and the protected redacted provider diagnostics in an authenticated session. Choose any further vendor/configuration repair from actual observed failure codes. Keep currency, issuer/security identity, session and timestamp requirements strict. Complete broker history/corporate-action/currency evidence remains necessary for authoritative returns.

PR #187 remains stacked on #186; #185/#186 and the frozen #180 branch are preserved. This repair does not authorize a merge, deployment, production secret retrieval, new live polling, database changes or another Telegram send.
