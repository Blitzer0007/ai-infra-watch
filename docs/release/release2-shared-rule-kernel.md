# Shared existing-rule evaluation kernel

Implemented 14 November 2026 in Codex Cloud on the Release 2 draft branch. This
extracts the existing rule calculations from the request handler; it adds no
alternative position-scoring engine, application panel or delivery policy.

## Boundaries

- `shared/portfolioRuleEvaluation.js:evaluateExistingRules(holding, quote,
  history, nowMs)` owns legacy loss, broker stop/target, trailing, calendar-time
  and staged-rule calculations. Its clock is mandatory. Unsupported clocks or
  unavailable prices return null; no host-clock fallback exists in the kernel.
- `shared/portfolioRuleMath.js` owns the five existing pure numerical helpers.
  `server/utils/portfolioRuleMath.js` re-exports the same function objects for
  compatibility. The server handler imports the shared kernel/history helper.
- `server/api/decision-center.js:ruleDistance` retains its exported signature,
  optional server-clock default and valid Date/ISO/timestamp forms. The request
  handler captures one assessment time for all holdings in that response.
- `src/utils/portfolioRuleEvaluation.ts:evaluateStoredHoldingRules` maps only
  camel-case rule fields into the same kernel. The portfolio API import is
  type-only. Its standalone browser bundle has no request handler, environment
  credentials, storage access, Node modules or API transport.

These are mathematical evaluations over supplied inputs. They do not establish
quote quality, accounting reconciliation, complete historical coverage or
decision eligibility. The existing four position states and their quality gates
remain separate and unchanged. A raw `clear` or `no-rule` result must not be used
as proof that a holding is safe or eligible for an investment classification.

## Preserved calculations and focused fixes

Before extraction, fourteen fictional outputs were retained directly from handler
commit `6221a7ad967c4ea9f185a763a59e410395baaf87` at an explicit clock. The fixture
covers clear/near/breached/target-reached/no-rule/invalid-price outcomes, loss
boundary, trailing/time rules, staged activation, time precedence, invalid staged
stop fallback and future-history exclusion. All fourteen outputs still match
exactly through the kernel, legacy wrapper and client adapter.

Stop/target percentages, three-percent near distance, three-calendar-day time
proximity, precedence, stage activation and existing distance units are retained.
Time rules continue to count UTC calendar dates, not trading sessions or a newly
inferred exchange calendar. Stored-field coercion and legacy rule configuration
semantics are otherwise preserved; comprehensive configuration validation remains
separate work.

Two focused correctness changes accompany the extraction:

1. No-stages results now clone stored state before returning it. Mutating a
   prospective result cannot mutate the caller's stored state. Stage-state
   contents and dirty-state/persistence conditions are unchanged for valid inputs.
2. The old ratio-subtraction comparison could classify an exact three-percent
   price gap as clear because its double value was `3.0000000000000027`. Near
   classification now compares price directly with the same 1.03 multiple of
   the applicable denominator. Integer and decimal boundaries are near; adjacent representable
   outside values remain clear. There is no added epsilon or widened threshold.
   Legacy returned distance fields are retained for compatibility.

Invalid/missing/noninteger or unsupported extended-year clocks fail unavailable
instead of generating an accidental no-rule result or an invalid-date exception.
Valid legacy clocks retain their existing result. Inputs are not mutated; outputs
contain prospective stage state only.

## Persistence, privacy and verification

The shared module and client adapter perform no HTTP/database/model calls,
configuration synchronization or storage writes. They cannot persist stage state.
The existing authenticated handler still owns its previously authorized stage
PATCH path. **A production GET of decision-center is still not a read-only audit
operation**, because that pre-existing handler can persist stage changes. No such
request is used during development or verification.

Frozen-object tests check holding/quote/history/stage-state immutability and
output isolation. Retained goldens compare the old outputs, legacy wrapper and
client adapter. Additional cases check explicit clocks, DST/calendar boundaries,
future/malformed history, stage resume, math export identity and exact/adjacent
three-percent classification. These are legacy compatibility and boundary checks,
not comprehensive financial sign-off.

Actual headless Chromium executes the bundled client adapter on all fourteen
goldens plus four corrected integer/decimal three-percent boundaries, with no app/backend request.
It blocks ambient clock/network use and checks input immutability and zero errors.
The full existing offline suite and exact-head GitHub checks remain required.
CI includes the retained fixture and browser check; live/deployment controls are
unchanged.

Local Cloud verification passes 1,007 Node tests (including 24 new kernel/parity
cases), the actual-browser adapter check, TypeScript, production build, source
security, workflow syntax and 25 CI-safety cases. The existing large-bundle warning
remains. No hosted query is used as a substitute for these pure-function checks.

## Remaining work

Build the consolidated risk-review UI over this shared boundary with stable rule
IDs, per-rule explanations and source/accounting gates. Complete invalid versus
unconfigured/disabled handling, remaining configuration validation, allocation
coverage and local unsaved scenarios before claiming the Release 1 risk contract
is complete. Characterize incomplete/ambiguous histories and stored stage-state
provenance alongside authoritative accounting/source work.

No production secret, hosted Supabase query/modification, provider/model call,
real message, merge, deployment, migration, dependency or additional polling is
included. The Supabase guidance was used for preserving server-only credentials
and persistence isolation; there is no Supabase feature/schema change to validate
against a hosted database. Release 2 engineering remains approximately 60% under
the current weighted plan; broader production acceptance remains pending.
