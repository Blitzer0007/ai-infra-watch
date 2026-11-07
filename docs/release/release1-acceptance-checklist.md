# Release 1 acceptance evidence

Development-only candidate in draft PR #167. This checklist is not deployment approval.

## Implemented and tested offline

- [x] Existing holdings appear in a portfolio review queue with the original four state semantics.
- [x] State derivation uses the original engine; quality failures only suppress classifications.
- [x] Cards expose reasons, rule origins, missing inputs, source timestamps and supporting quote citations.
- [x] Invalid, stale, simulated, conflicting and mismatched observations withhold assessments.
- [x] Closed-session data needs explicit last-close provenance. Provider session boundaries handle ordinary and early closes without guessing a holiday calendar.
- [x] Incomplete/overflowing valuation coverage withholds aggregate value and concentration.
- [x] Existing accounting, leveraged thresholds, freshness and authentication tests remain in the unit suite.
- [x] 20 static financial definitions, search, related terms, simple/advanced explanations and safe unknown-term fallback.
- [x] Keyboard activation, modal focus containment, Escape and focus restoration.
- [x] Existing simple/detailed preference and portfolio tab/query navigation are retained.
- [x] Local timezone preference; source calendar dates are not converted to invented timestamps.
- [x] Separate loading, empty, error and filtered-no-match states.
- [x] 360px document/Command Center/dialog checks and Cloud screenshots.
- [x] Development config synchronization, scorecard submission and Telegram relay are disabled.
- [x] No added provider polling, schema, persistent service or core financial dependency.
- [x] Production deployment workflow unchanged; live QA requires separate manual opt-ins.

## Checks for each exact PR head

Run TypeScript, unit tests, security audit, migration-manifest verification and build.
Run the mocked browser/workflow safety suite in Cloud, then require all GitHub
checks on the exact pushed commit. A previous green commit is not evidence for a
new head. Existing CSS optimization and bundle-size warnings are documented.

## Remaining external evidence and approval boundaries

- [ ] Independently validate real provider session/currency/market-time metadata and comparable-source evidence. Fixtures demonstrate gate behavior, not vendor accuracy.
- [ ] Perform any authenticated production acceptance checks only under separate authorization with a secure session. No production credentials are needed for development.
- [ ] Review the complete PR and explicitly approve any merge.
- [ ] Separately approve any preview/production deployment, database work or notification activation.

No synthetic alert, production test message, guessed historical publication time,
or bypassed quality gate should be used to mark an external-evidence item complete.
REA installation, broker execution, new infrastructure, external membership archives
and unrelated research expansion remain outside this development batch.
