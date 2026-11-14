# Glossary/help release

This release adds a searchable, static financial glossary to Help & Guide. Its 20
definitions include examples, common misunderstandings, advanced explanations,
and related terms. Native dialogs support keyboard navigation and restore focus
when closed. Searching or opening definitions makes no API requests.

The release starts from production commit
`8cb77d256b27c6983bf911db4c4ac32c667dca53`. Server handlers, database migrations,
financial calculations, agent code, dependency manifests, and `vercel.json` are
unchanged. Release 1 and Release 2 remain separate draft branches.

CI now runs ordinary PR, push, and scheduled QA against mocked APIs and disposable
databases. Live API/UI/database checks require an explicit manual main-branch
opt-in. SEC corpus ingestion no longer runs when workflow files are pushed.
The manual production workflow checks out its dispatch SHA and pins Vercel CLI
65.16.0. No deployment occurs on a normal branch push or PR.

## Verification

Run type checking, unit tests, production build, security audit, and migration
ledger verification. Run `qa/test_ci_safety.py`, `qa/test_deployment_workflow.py`,
`qa/test_jev_production_workflow.py`, and the UI tests with `QA_UI_MOCKS=true` and
a loopback `QA_BASE_URL`. The glossary acceptance tests cover search, empty results,
related terms, keyboard containment/focus restoration, no glossary API requests,
and mobile/tablet/desktop overflow. All sessions in these tests are fictional.

## Production procedure

Merge only this release PR after its checks pass. Deploy its exact main commit
manually through the existing Vercel project `ai-infra-watch` in team `Green`.
Use the connected deployment API if workflow dispatch is unavailable; credentials
stay server-side. Confirm READY status, the deployment Git SHA, the production
alias, glossary behavior with browser API interception, and anonymous auth gates.
Do not run authenticated model/Telegram/database smoke checks for this UI release.

The last known healthy production deployment before this release is
`dpl_Es2kpTHyL3J1sgfPHLQpqWoFV77C`. If the new release is unhealthy, restore
production traffic to that deployment. Existing production schedules continue
with their existing code and configuration.
