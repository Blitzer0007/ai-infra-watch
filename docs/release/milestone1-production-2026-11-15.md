# AI Infra Watch — Milestone 1 production evidence

**Milestone 1 production release completed — 2026-11-15 10:22:14 UTC.** PRs #170 and #171 are merged; final main commit `d678cbe0ada0a329f541273181fb0b7f52ad0f90` is live as `dpl_27Ae6E5jH5f8vxBWFTAFcRZYh2Vc` at https://ai-infra-watch-theta.vercel.app. Both canonical production aliases point to that same tested build.

Exact-main CI passed: [Frontend / 758 Node cases](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43702764529), [UI/API/disposable DB validation](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43702764526), [Security](https://github.com/Blitzer0007/ai-infra-watch/actions/runs/43702764531). The isolated candidate also passed 89 offline browser/workflow cases.

Staged homepage, JavaScript and CSS returned 200; compiled safeguards were present. The data-free access check returned the expected 401 and ordinary auth GET returned 405. The fetch proxy withholds the 401 body; no claim is made to have retrieved that body. After promotion, production homepage bytes matched the staged homepage, both aliases mapped to the tested deployment and the production data-free check still returned 401. The scoped `/api/auth` five-minute runtime-error aggregate reported no errors.

Production remained on the previous deployment during staging; that deployment `dpl_A9SyRmrvss5zgio2i2hCWAcr4JP7` remains the known-good rollback target. The earlier stage `dpl_B4ZQ9J91bpSKcG1U8hNmG4st8fTC` was not promoted.

Main protection and production-environment reviewer/branch setup were deferred under the owner's explicit Milestone 1 exception. The regular workflow retains its protected-main requirement; this release used connected Vercel build/promote tools. Vercel accepted the temporary domain-assignment hold, and the tested build was explicitly promoted.

No migration or production database modification, new polling/schedule activation, private financial-row retrieval, production environment-variable/API-key endpoint query or Telegram send was performed by this release work. Unsupported financial-return notifications remain unavailable pending an authoritative receipt. **Milestone production releases completed: 1/5.**

Build URL: https://ai-infra-watch-b6z6038tf-green-2888.vercel.app

Implementation: https://github.com/Blitzer0007/ai-infra-watch/pull/170

Data-free access verification: https://github.com/Blitzer0007/ai-infra-watch/pull/171
