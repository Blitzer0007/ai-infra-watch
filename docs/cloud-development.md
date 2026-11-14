# Development in Codex Cloud

Use a dedicated feature branch from the verified `main` commit. Keep unrelated
workspace changes intact. Run code and browsers in Cloud; Windows only hosts the
Codex client. Do not push, open a PR, deploy, migrate a linked database, install
REA, or send notifications without authorization for that action.

## Offline checks

Use Node 22 and Python 3.12 to match CI. Install from the committed npm lockfile
and `qa/requirements.txt` in an isolated Python environment, with no production
credentials or production `.env` files. The QA dependencies include PyYAML for
the workflow safety tests.

Run `npm run lint`, `npm run test:unit`, `npm run build`, and
`python -m pytest -q qa/test_ci_safety.py qa/test_deployment_workflow.py qa/test_jev_production_workflow.py`.
The GitHub QA workflow also replays migrations against disposable PostgreSQL 17.

For mocked browser tests, serve only the frontend:

```sh
VITE_QA_MODE=true npm exec vite -- --host 127.0.0.1 --port 3000
```

In another Cloud terminal, run:

```sh
QA_BASE_URL=http://127.0.0.1:3000 QA_UI_MOCKS=true python -m pytest -q qa/test_ui.py qa/test_ui_exploratory.py
```

If using Cloud's preinstalled Chromium instead of a Playwright-managed browser,
set `QA_CHROMIUM_EXECUTABLE=/usr/bin/chromium` for the test command.
Use a fresh browser context; do not import production authentication state.
Offline browser fixtures block external HTTP requests and WebSockets, and block
service workers. API requests are mocked by the UI suites. Serving Vite directly
avoids starting backend provider routes. These guards reduce accidental access;
Cloud's restricted network policy remains a separate boundary.

## Live checks and releases

QA API/UI/DB jobs require manual dispatch on `main` with `run_live_checks=true`.
They are excluded from pull requests, automatic pushes, and scheduled QA runs.
Linked Supabase dry-run inspection has a separate manual-main opt-in.
Local QA API/browser commands require an explicit `QA_BASE_URL`; there is no
production default. External QA targets also require `QA_ALLOW_LIVE=true`.
DB tests accept only `QA_SUPABASE_URL` and `QA_SUPABASE_SERVICE_ROLE_KEY`, with
the same external-target opt-in. Never point these at production for development.
An opt-in is authorization to contact the selected target, not a guarantee that
every endpoint is free of side effects. Existing API contract coverage includes
forecast verification, so live checks require separate review and authorization.

SEC refresh retains its production schedule and manual recovery path but no
longer runs from workflow-file pushes. Other existing production schedules are
unchanged, including alert/digest delivery and private archives. A `main` commit
containing `[send-digest]` can still trigger the existing digest workflow.

Vercel Git deployment remains disabled. Production deployment requires the
separate manual workflow on `main` with `confirm_production_deploy=YES`.
Before any authorized push or PR, review the full diff and workflow changes.
Before release, separately authorize production checks, database work, alert
activation, and deployment. Configure GitHub branch protection and protected
environments in a separately authorized administration task; code changes here
do not create those remote protections.
