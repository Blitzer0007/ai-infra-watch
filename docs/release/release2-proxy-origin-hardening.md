# Proxy destination hardening — offline safety follow-up

14 November 2026 · Codex Cloud · existing Release 2 feature branch / draft #168.

## Problem and resulting behavior

The [Radar safety baseline](release2-event-risk-radar-review.md) found two destinations derived from incoming Host / forwarded-proto headers. The generic agent route attached a selected backend bearer token and used fetch's default redirect behavior. The Congress aggregate-feed proxy also used an incoming header origin. A malformed/untrusted destination or a redirect must not select where internal credentials or user research requests go.

This increment removes those header-derived origins. It preserves authentication and the selected backend-token precedence, locks requests to fixed endpoint paths, rejects redirects and sanitizes transport exceptions. It is feature-branch work only: no deployed configuration, credential, database, schedule, sender or live acquisition was changed.

## Destination policy

| Path | Admitted destination | Missing/invalid configuration |
| --- | --- | --- |
| Generic agent GET/POST | Explicit validated `AI_INFRA_AGENT_URL`, otherwise current hosted `VERCEL_URL` | HTTP 503, zero upstream requests |
| Congress aggregate feed | Current hosted `VERCEL_URL` only; separate agent backend is irrelevant | Empty observations with stale/error failure flags; zero upstream requests |
| Source Quality / council | Existing explicit HTTP loopback development paths and production guards | Existing development-only rejection behavior retained |

The current deployment resolver requires `VERCEL=1`, `VERCEL_ENV=preview|production` and a valid protocol-free `*.vercel.app` DNS hostname in `VERCEL_URL`. It never uses the production-project alias, incoming Host / Forwarded / forwarded-host/proto headers, a browser origin, or a localhost fallback. Preview native requests remain scoped to the supplied preview deployment. An invalid explicit backend blocks fallback.

Explicit remote origins require HTTPS, default port, a valid DNS hostname and root path only. Userinfo, query/fragment markers, encoded/ambiguous host syntax, backslashes, non-ASCII/control characters, non-root paths, IP literals and local/internal/localhost suffixes are rejected. A root trailing slash and surrounding configuration padding are normalized. Explicit HTTP loopback is permitted only outside production and outside Vercel; this enables fictional local tests and existing permitted Cloud development without admitting public HTTP backends.

Server-side configuration and platform metadata are the trust boundary. This is **not** DNS/IP pinning or a universal outbound-network firewall. Operators must independently verify configured domain ownership, DNS/TLS trust and correct backend identity. No DNS lookup, hosted metadata verification, protection bypass or production credential inspection was performed here. Native deployment protection/authentication and availability must pass separately authorized hosted acceptance; failure must not fall back to a production alias or request header.

## Files and preserved boundaries

- `server/services/trustedBackendOrigin.js`: bounded origin parsing and current-deployment selection. Accepts environment declarations, never a request object; no network activity. Uses only Node's built-in IP parser, with no dependency/install.
- `api/agent-ask.js`: authenticated generic GET/POST resolves the trusted origin before constructing backend headers. Fixed `/api/agent-python` path; encoded probe query cannot change it. Fetch uses `redirect: 'error'`; redirect/redirected responses also fail closed. Invalid methods/auth never contact an upstream. All responses are no-store; raw caught exception details/URLs are withheld. Existing timeouts, rate policy, token precedence and separate development roles are retained.
- `api/live-data.js`: the caller invokes the Congress reader without passing the inbound request. Its self-request uses only current-deployment metadata, `Accept: application/json`, the existing timeout and redirect rejection. Failures retain stale/error distinctions and omit raw exceptions. Other feed acquisition and caching paths are unchanged and were not invoked by these tests.
- `API_KEYS.md`: documents the new trust/compatibility contract; no environment values or credentials are provisioned.

This fixes destination selection and redirect handling in these two paths. It does not certify arbitrary backend JSON, authenticate financial sources, implement generic response/body budgets, fix all feed failure presentation, or complete account-wide rate coordination. The configured backend's successful/error JSON contract remains a separate review surface. Incoming IP-based rate keys are unchanged and are not treated as destination authority.

## Offline evidence

Tests exercise origin parsing, current-preview isolation, invalid explicit/no fallback, hostile incoming headers, token/header minimization, probe encoding, authentication/method ordering, redirect/transport failures and exception redaction. Existing token-precedence assertions are retained. The old test expecting header-derived native forwarding is replaced with a test requiring trusted current-deployment metadata.

Child processes receive a minimal explicit environment with **fictional** session/backend tokens rather than reading/copying service credentials from the parent. Fetch mocks make no external request. Eight native Node-fetch controls use temporary loopback-only HTTP servers: successful GET/POST plus 302/307/308 redirects for both methods. Approved upstreams receive the fictional internal token; same-origin unexpected-path and cross-origin trap counters remain zero. No model, vendor API, Telegram, production URL or hosted Supabase connection is used. Temporary servers close after each test.

The Congress reader is tested directly with an in-memory fetch adapter: current preview only, no request/backend credentials, redirect/error failure flags and zero calls without a trusted origin. Importing the reader does not invoke the full market/news/SEC feed.

Local verification passed **1,161 Node tests** (including 71 proxy-related cases), **25 CI-safety cases**, TypeScript, production build, security audit, local migration-manifest integrity (32 files), workflow YAML and whitespace checks. Exact-head GitHub CI is a separate check. Existing large frontend-bundle work remains pending. There is no new endpoint/function, dependency, schema, schedule or provider call.

## Remaining safe sequence

1. Correct unavailable P&L and invested-cost/current-valuation/weight distinctions, then complete remaining valuation consumer parity and authoritative accounting coverage.
2. Extend reviewed quote admission to independent server alert scanners/relays and expose scoped read-only admission/coverage explanations. The [browser gate](release2-browser-quote-alert-admission.md) does not prove server sender safety.
3. Resolve remaining response/resource/source contracts and perform separately authorized hosted auth/configuration/provider acceptance.
4. Only then propose licensed Radar development acquisition with verified account/issuer mapping and independently retained historical evidence. Live polling, schedules and Telegram activation remain separate approval decisions.

Existing Codex work is preserved. No merge, deployment, production Supabase modification, real credential retrieval or message was performed. The older ~60% core estimate is unchanged; this scoped safety follow-up is not production readiness.
