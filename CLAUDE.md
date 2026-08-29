<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->

## Project: Telegram AI Poster

Full plan: [docs/telegram-ai-poster-plan.md](docs/telegram-ai-poster-plan.md). Locked decisions live there — read it before making architectural choices.

**Stack as actually installed** (plan says Angular 20; latest stable at scaffold time was Angular 22, used instead — same standalone/signals paradigm):
- Nx monorepo, npm package manager
- `apps/api` — NestJS (webpack build), REST API. Registers/deregisters schedules in Redis but never executes them (docs §1).
- `apps/web` — Angular 22, standalone components, signals, Tailwind v4 (`@tailwindcss/postcss`)
- `apps/worker` — NestJS (webpack build), no HTTP server — `NestFactory.createApplicationContext`. Consumes the BullMQ `workflow-executions` queue and runs boot-time reconciliation. Stays alive because its BullMQ `Worker` holds an open Redis connection. `npm run start:worker` / `nx serve worker`.
- `libs/prisma` — `PrismaService`/`PrismaModule`, shared by api and worker. Prisma schema lives at repo-root `prisma/schema.prisma` (not inside an app) since both processes need it.
- `libs/execution` — shared between api and worker (a real Nx library, not just aspirational): `EncryptionService`, `TelegramService` + sanitizer, the three LLM provider adapters + `assemblePrompt`/`getRecentSuccessfulPosts`, `SchedulerService` (BullMQ wrapper), and `WorkflowRunnerService` — the docs §6 core execution loop, parameterized by `ExecutionTrigger` so both the api's manual "Run now" and the worker's scheduled runs share one implementation. api-only code (credential validation calls, ownership checks) stays in `apps/api`.
- `libs/shared-dto` — cross-app DTOs with `class-validator` decorators (backend only — the Angular app keeps its own plain-interface copies in `apps/web/src/app/core/models` to avoid bundling `class-validator`/`reflect-metadata` into the browser build)
- Prisma 6.x pinned deliberately — Prisma 7 changed the schema format (`prisma.config.ts`, no more `datasource.url`, no `@@check`) and isn't worth the churn yet
- Auth is **username + password**, not email — a deliberate correction from the plan's implicit email assumption
- **LLM providers: OpenAI + Anthropic + Gemini** — the plan's locked decision (§1) and explicitly-out-of-scope list (§12) said OpenAI + Anthropic only; Gemini was added on top by explicit request. Same pattern as the other two throughout: `LlmProvider.GEMINI` in `prisma/schema.prisma`, `generateWithGemini` in `libs/execution/src/lib/generation/providers/gemini.provider.ts`, `validateGeminiKey` in `apps/api`'s credentials validators (credential-validation calls stay api-only, unlike the generation providers which the worker also needs), wired into both `ADAPTERS` and the credential-validation switch, plus the frontend provider/model selects.
- **No 90-minute interval floor** — the plan's §5 floor ("enforced in three places... genuinely hard to bypass") was deliberately removed by request: dropped the DB `CHECK` constraint (migration `20260816070330_remove_interval_floor`), relaxed `@Min(90)` to `@Min(1)` in the shared DTOs (basic positive-integer sanity only, not a product floor), and removed the UI copy referencing it. Interval presets now start at 5 minutes.
- **Model selection is a curated dropdown**, not free text — docs §9 says "model selection filtered by the chosen credential's provider"; `MODEL_OPTIONS` in `apps/web/src/app/core/models/workflow.model.ts` holds per-provider curated ids with a "Custom" free-text escape hatch. Verify these ids periodically — LLM providers churn model names quickly (this list has already been corrected once after a real API rejection; e.g. Gemini deprecates old model generations within months).
- **"Run now" executes inline in the api process**, not via the worker queue — a disclosed deviation from docs §1's "[the worker is] the only place that decrypts secrets, calls LLM providers, and calls Telegram". Routing every manual run through the queue (enqueue + `waitUntilFinished`) would be more architecturally pure but adds real complexity for a feature whose whole point is fast iteration; `WorkflowsService.runManual` calls the shared `WorkflowRunnerService` directly instead. Scheduled runs go through the worker exactly as designed.

**Environment**: Postgres is a **hosted Neon instance**, Redis is a **hosted Upstash instance** (both free tier — Neon's compute and, less predictably, Upstash can go idle/cold; a slow or failed first request after idle is normal, a retry after a few seconds resolves it, no action needed). `.env` is filled in locally (gitignored, not committed) with `DATABASE_URL`, `REDIS_URL` (a `rediss://` TLS URL, not the REST API endpoint some providers also show), a generated `JWT_SECRET`/`CREDENTIALS_ENCRYPTION_KEY`, and `INVITE_CODE=dev-invite`. `docker-compose.yml` still exists as an alternative local Postgres+Redis path but isn't what's actually in use.

**BullMQ note**: this project uses BullMQ 6.x, which replaced the old "repeatable jobs" API (`queue.add(name, data, {repeat})`, `getRepeatableJobs()`, `removeRepeatableByKey()`) with the "Job Scheduler" API (`upsertJobScheduler`, `getJobSchedulers`, `removeJobScheduler`). `SchedulerService` in `libs/execution` uses the workflow id directly as the scheduler id — simpler than the old auto-generated-key model and means `Workflow.scheduleKey` is just the workflow's own id when scheduled, `null` when not. If you're used to older BullMQ docs/tutorials, they're describing an API this codebase doesn't use.

**Prisma workflow**: Postgres is reachable now, so use normal `npm run prisma:migrate` (or `npx prisma migrate dev --schema=prisma/schema.prisma --name <name>` to avoid the interactive name prompt in a non-interactive shell) for schema changes. Two migrations after the hand-rolled init one were created this way: `20260816063946_add_gemini_provider` (enum value) and `20260816070330_remove_interval_floor` (hand-written `DROP CONSTRAINT`, since the floor was a raw `CHECK` never modeled in `schema.prisma` — schema diffing can't detect changes to it, so any future change to it needs another hand-written migration, same as how it was originally added).

**Root scripts**: `npm run prisma:generate|migrate|deploy|studio`.

**Running locally**: `npx nx serve api` and `npx nx serve worker` (background both — worker does nothing useful alone, and api's enable/disable/run endpoints need Redis reachable). Both watch and rebuild on save. Known footgun in this environment: editing files while a request is in flight can let `nx serve`'s watch-mode restart kill the process mid-request, orphaning state (e.g. a Redis schedule registered but the matching Postgres `enabled` write never committed) — the worker's boot-time reconciliation (Rule 2) cleans this up on its next restart, but a `WorkflowRunnerService.run()` mid-flight when the process dies is simply lost (no execution record beyond whatever committed before the kill). Separately: if a previous server process is killed uncleanly it can leave an orphaned `node` process still bound to port 3000, making a *new* `nx serve api` fail to bind while looking like it started fine. If port 3000 seems unresponsive or stale, check `Get-NetTCPConnection -LocalPort 3000 -State Listen` (PowerShell, not the Bash tool — `$variables` get mangled going through Git Bash) and kill any owning process before restarting.

**Build sequence** (docs §10) — Phases 1–5 are done: auth, credentials (+ validation), destinations (+ guided detection, Telegram send/sanitize/split), generation (provider adapters, prompt assembly with anti-repetition, Preview endpoint, full Workflow CRUD, "Run now" manual trigger), and scheduling (BullMQ queue, `apps/worker`, schedule registration on enable, deregistration on disable/delete, remove-then-add on interval change, boot reconciliation, `nextRunAt` tracking, failure-streak/auto-disable at 5 consecutive scheduled failures). Verified end-to-end against real hosted Postgres+Redis: enable → worker fires on schedule → execution recorded with correct status/errorStage → failure streak accumulates → disable removes the schedule cleanly. Not built yet: Phase 6's execution-history UI and failure banners (the data is all there — `Execution` rows, `consecutiveFailures`, `nextRunAt` — just no dedicated screen for it), and Phase 7 hardening (per-user workflow caps, worker concurrency limits, token budgets, log retention).

**No test suite by project choice.** All spec files, the `api-e2e`/`web-e2e` apps, and their jest/tsconfig/project.json wiring were removed; `nx.json` generator defaults now scaffold new apps with `unitTestRunner`/`e2eTestRunner: none`. Verify changes with `nx build`/`nx lint` instead of `nx test`.