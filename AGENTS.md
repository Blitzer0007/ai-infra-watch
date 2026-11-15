# Development continuity

Read `docs/release/CODEX-CONTINUATION.md` before continuing development.

- Keep that Markdown handoff current at meaningful checkpoints and before ending a development turn, switching tasks, or handing work to another chat. Do not wait for a usage-limit interruption: the agent cannot reliably detect one in advance.
- Commit and push coherent, tested checkpoints to the existing feature branch so ChatGPT with GitHub tools can continue from repository files. Record unfinished work and validation failures plainly; do not label uncommitted or previous-head checks as current-head CI evidence.
- Include the active branch/draft PR, production release identity, changed files, verification, known limitations, next concrete steps, and a pasteable resume prompt. Keep it free of keys, auth cookies, sharing credentials and private financial rows.
- Preserve existing work. Development stays in Codex Cloud or connected repository tools; do not require execution on the user's Windows PC. If a chat lacks a runtime, it must report checks as unrun and use repository CI rather than inventing results.
- Follow the user's current authorization for external actions. Development continuity does not itself authorize production deployment, database changes, live polling or messages. The Milestone 1 control exception recorded in the handoff is not an automatic exception for future releases.
- **Mandatory verification gate:** After a coherent checkpoint, wait for all required GitHub CI workflows on the **exact current head SHA** to finish successfully before taking the next feature step. Failed checks require investigation, a real fix, a new commit and full re-verification. Pending/cancelled/skipped/missing checks are not successes. Never weaken checks simply to make them green. If unavailable, report BLOCKED/NOT VERIFIED and stop that milestone. Keep the PR draft; merging/deploying still requires separate approval.
