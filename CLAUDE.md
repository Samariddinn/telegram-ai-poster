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
- `apps/api` — NestJS (webpack build), REST API
- `apps/web` — Angular 22, standalone components, signals, Tailwind v4 (`@tailwindcss/postcss`)
- `libs/prisma` — `PrismaService`/`PrismaModule`, shared by api and the future worker app. Prisma schema lives at repo-root `prisma/schema.prisma` (not inside an app) since both processes need it.
- `libs/shared-dto` — cross-app DTOs with `class-validator` decorators (backend only — the Angular app keeps its own plain-interface copies in `apps/web/src/app/core/models` to avoid bundling `class-validator`/`reflect-metadata` into the browser build)
- Prisma 6.x pinned deliberately — Prisma 7 changed the schema format (`prisma.config.ts`, no more `datasource.url`, no `@@check`) and isn't worth the churn yet
- Auth is **username + password**, not email — a deliberate correction from the plan's implicit email assumption

**Environment**: No Docker and no local Postgres/Redis are installed on this machine. `docker-compose.yml` is written and correct but untested end-to-end here — the API's `PrismaService` connects eagerly on boot and will fail to start until Postgres is reachable. Verify with a live `docker compose up -d` + `npm run prisma:deploy` before trusting DB-touching changes.

**Prisma workflow**: schema and migrations are hand-driven right now (no live DB to run `prisma migrate dev` against in this environment). `prisma/migrations/20260815000000_init/migration.sql` was generated via `prisma migrate diff --from-empty --to-schema-datamodel` (works offline, no DB needed) plus a hand-appended `CHECK (intervalMinutes >= 90)` constraint and an index. Once Postgres is reachable, switch back to normal `npm run prisma:migrate` for subsequent schema changes — don't keep hand-editing migration SQL.

**Root scripts**: `npm run prisma:generate|migrate|deploy|studio`. Copy `.env.example` to `.env` before running anything that touches Postgres/Redis/JWT.

**Build sequence** (docs §10) — currently at the end of **Phase 1** (foundation: workspace, Docker Compose, Prisma schema + migration, JWT auth with invite gate, Angular shell with login + guarded layout). Domain model in `prisma/schema.prisma` already covers the full schema from docs §2 (Credential, Destination, Workflow, Execution) since Prisma migrations are easiest to get right up front — but no functionality beyond auth is implemented yet. Next up is Phase 2 (credentials CRUD + validation).