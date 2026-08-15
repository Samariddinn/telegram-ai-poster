# Telegram AI Poster — Architecture & Business Logic Plan

An application where a user configures an AI prompt, a Telegram destination, and a time interval. The system then generates and publishes a post on that schedule, indefinitely, without further input.

**Locked decisions**

| Decision | Choice |
|---|---|
| Users | Small trusted group (self + friends), JWT auth, invite-gated registration |
| Scheduling | Fixed intervals only, minimum 90 minutes. No cron, no timezones |
| LLM providers | OpenAI + Anthropic |
| Frontend | Angular 20 — standalone components, signals, Tailwind |
| Backend | NestJS + Prisma + PostgreSQL |
| Queue | BullMQ + Redis |
| Repo | Nx monorepo, shared DTO library |

---

## 1. System shape

Three runtime processes plus two datastores.

**API process** — Serves the REST API to the Angular app. Owns all validation and all writes to Postgres. Registers and deregisters schedules in Redis but never executes them.

**Worker process** — Consumes jobs from the queue. This is the only place that decrypts secrets, calls LLM providers, and calls Telegram. Runs from the same codebase as the API but a separate entrypoint, so it can be scaled or restarted independently.

**Angular app** — Static build, served separately. Talks only to the API.

**PostgreSQL** — Source of truth for users, credentials, destinations, workflows, execution history.

**Redis** — Holds the schedule state and the job queue. Deliberately treated as *derived* data: if Redis is wiped, the system rebuilds every schedule from Postgres on next worker boot. Nothing is lost except in-flight jobs.

The separation matters because generation is slow and unreliable. An LLM call can take 30 seconds, Telegram can be down, a key can be revoked. None of that should be able to make the UI hang or the API unresponsive.

---

## 2. Domain model

### User
Identity and ownership boundary. Every other entity hangs off a user, and every query is scoped by user id. Registration requires an invite code held in an environment variable — cheap gate, no admin UI needed.

### Credential
A single stored secret. Two kinds:

- **Telegram bot token** — obtained from BotFather
- **LLM API key** — with a provider tag (OpenAI or Anthropic)

Stored encrypted at rest with AES-256-GCM. Each record carries its own initialization vector and authentication tag, plus a key-version number so keys can be rotated later without a painful migration. A short display hint (last four characters) is stored in plaintext purely so the UI can show which key is which.

The plaintext secret is never returned by the API under any circumstance, including to the user who created it. Once saved, it is write-only from the outside.

Each credential also carries a `lastValidatedAt` timestamp, set whenever a validation check succeeds.

### Destination
A Telegram group or channel, paired with the specific bot that posts to it. Holds the chat id, a human-readable title, and a verification timestamp.

The bot–chat pairing is what actually matters: a chat id is meaningless without a bot that has permission to post there. The same group can appear twice under two different bots, but the same bot–chat pair cannot be registered twice.

### Workflow
The central entity — one recurring publishing job. It composes:

- **What to say** — a system prompt (optional, sets persona and rules) and a user prompt (the actual instruction)
- **Who says it** — an LLM credential, a model name, temperature, max tokens
- **Where it goes** — a destination, and a parse mode
- **How often** — an interval in minutes
- **How much memory** — how many recent posts to feed back as anti-repetition context

Plus operational state: an enabled flag, the key identifying its schedule in Redis, last and next run timestamps, and a consecutive-failure counter.

A workflow is created disabled. Enabling is an explicit, separate action, so a half-configured workflow can't start posting to a real group by accident.

### Execution
One record per attempt, successful or not. This is the audit log and the debugging surface.

Beyond status and timestamps, two fields carry disproportionate weight:

- **Trigger** — distinguishes a scheduled run from a manual "Run now". Manual runs shouldn't distort the failure streak or the next-run calculation.
- **Error stage** — which layer failed: the LLM call, the Telegram call, or internal logic. "The model returned an error" and "your bot was removed from the group" need completely different messages and completely different user actions. Collapsing them into one error string makes the history log nearly useless.

Successful executions also store the generated text, which is what the anti-repetition context reads back.

---

## 3. Credential lifecycle and validation

Every credential type has a cheap validation call, and the system uses it aggressively:

- **Telegram bot token** — call the bot-info endpoint. Confirms the token is live and returns the bot's username, which is useful to display.
- **LLM key** — issue a minimal completion request capped at one token. Costs effectively nothing and catches a typo'd or revoked key immediately.

Validation runs at three moments: when the credential is first saved, on demand from a button in the UI, and implicitly on every workflow execution (a failure there marks the credential as suspect).

The reasoning: the worst failure mode in a scheduled system is silent. A bad key discovered at creation time is a two-second fix. The same bad key discovered three days later means three days of missing posts that nobody noticed.

**Deletion** is blocked while a credential is referenced by an active destination or workflow. Return the list of blockers so the UI can say exactly what to detach first.

---

## 4. Destination setup

Getting a Telegram chat id is the single most confusing step for users, and it deserves real product effort rather than a bare text input.

**The friction:** supergroup ids are negative and prefixed with `-100`. Users find a positive number somewhere, paste it, and get an opaque failure. Separately, the bot must be added to the group *and* granted permission to post; being a member is not sufficient in many group configurations.

**The flow that works:**

1. User selects which bot this destination uses
2. UI instructs: add the bot to the group as an administrator, then send any message in that group
3. User clicks "Detect" — backend polls Telegram's update feed for that bot and returns the chats it has recently seen
4. User picks from that list; title and id are filled automatically
5. Backend immediately sends a test message to confirm posting actually works, then stamps `verifiedAt`

Manual chat-id entry stays available as an escape hatch, but it is not the primary path. If entered manually, normalize obvious mistakes (a positive supergroup id) and warn rather than silently failing later.

---

## 5. Scheduling model

Intervals only. No cron expressions, no timezone field, no daylight-saving handling. A 90-minute job fires every 90 minutes regardless of the calendar. This eliminates an entire class of bugs at the cost of a feature nobody in the target audience asked for.

**The 90-minute floor** is enforced in three places: the UI control, the request validation layer, and a database constraint. Frequent posting to a Telegram group is spam, and it burns API credits fast. The floor is a product decision, not a technical limit — but it should be genuinely hard to bypass.

The UI offers presets (90 minutes, 2, 3, 6, 12, 24 hours) with a custom-minutes field behind a toggle.

### Schedule state management

The scheduler holds repeating jobs in Redis, keyed per workflow. Three rules govern it:

**Rule 1 — Every mutation is remove-then-add.** Changing an interval, disabling, re-enabling: always deregister the existing schedule before registering a new one. Skipping the removal step silently leaves the old schedule running alongside the new one, and the workflow starts posting twice as often for reasons that look inexplicable from the outside. Store the returned schedule key on the workflow row so removal is always possible.

**Rule 2 — Reconcile on boot.** When the worker starts, it compares the schedules registered in Redis against the enabled workflows in Postgres and repairs the difference in both directions: delete schedules with no matching enabled workflow, create schedules for enabled workflows that have none. This makes the system self-healing after a crashed deploy, a Redis restart, or a manual database edit. It is roughly thirty lines of logic and it removes most of the operational anxiety of running the thing.

**Rule 3 — Postgres wins.** Any disagreement between Redis and Postgres is resolved in favor of Postgres. Redis holds no unique information.

### First-run timing

Interval schedules typically anchor to a fixed grid derived from the epoch rather than from creation time. A 90-minute workflow enabled at 10:50 may first fire at 11:00 rather than 12:20 — surprising, and it makes "enable, then watch nothing happen for an hour" look like a bug.

Set an explicit start offset of one full interval from enablement, so the first run lands where the user expects. Display `nextRunAt` prominently in the UI either way.

---

## 6. Execution logic

The core loop, in order:

1. **Open an execution record** before doing anything else. If the process dies mid-run, there's still evidence it started.
2. **Reload the workflow** from the database. The schedule fires with only a workflow id — never with a cached payload. A prompt edited two minutes ago must take effect on the next run, and stale job payloads are a classic source of "I changed it but it kept posting the old thing".
3. **Check the enabled flag** and abort as `SKIPPED` if false. A belt-and-braces guard against a schedule that outlived its deregistration.
4. **Decrypt both secrets** — LLM key and bot token.
5. **Assemble the prompt** including anti-repetition context.
6. **Call the LLM** under a hard timeout of roughly 60 seconds.
7. **Sanitize and split** the output.
8. **Send to Telegram**, sequentially if split into parts.
9. **Close the execution record** with status, token counts, duration, and either the resulting message id or a staged error.
10. **Update workflow state** — last run timestamp, and either reset or increment the failure streak.

### Retry policy

Three attempts with exponential backoff — but only for genuinely transient failures. Rate limits, timeouts, and 5xx responses are worth retrying. Authentication failures, revoked tokens, and permission errors are not: they will fail identically three times, delay the failure notification, and pollute the logs.

Classify the error at the point it's caught, and mark non-retryable failures explicitly so the queue stops immediately.

### Failure streak and auto-disable

Consecutive failures increment a counter; any success resets it to zero. At five consecutive failures the workflow auto-disables and its schedule is removed.

The reasoning: an unattended system with a bad credential will otherwise retry forever, burning quota and filling the log with identical errors. Five failures at a 90-minute interval is about seven hours — long enough to ride out a provider outage, short enough to stop the bleeding. The workflow surfaces in the UI with a clear banner explaining why it stopped and what to fix.

Manual runs never touch the failure streak.

---

## 7. Prompt assembly and anti-repetition

This is where the product either works or doesn't.

An LLM given the identical prompt every 90 minutes produces near-identical output. Not literally identical — sampling introduces variation — but recognizably the same three ideas rephrased. A channel receiving that becomes obviously automated within a day.

The mitigation is to include recent output as negative context: fetch the last N successful generations, truncate each to a few hundred characters, and instruct the model to differ from them in both topic and angle.

Two details matter:

- **Only successful executions feed back.** Including failures means error strings and refusals leak into the context and steer subsequent generations badly.
- **Truncate each entry.** Full posts at a context window of ten would dominate the prompt and inflate token costs for diminishing benefit.

The context window is per-workflow and user-adjustable, defaulting to five. Higher values give better variety and cost more per run.

The assembled prompt also carries explicit output instructions: return only the post body, no preamble, no explanation, no code fences. Models ignore this often enough that sanitizing is still required — but it reduces the frequency substantially.

---

## 8. Output sanitizing

Model output is not publishable as-is. Four problems recur:

**Preamble.** "Here's a post about X:" prefixed to the actual content. Detect a short first line ending in a colon and strip it.

**Code fences.** Models wrap output in triple backticks reliably, regardless of instructions. Strip wrapping fences unconditionally.

**Invalid markup.** Telegram rejects malformed formatting with an unhelpful error. The system defaults to HTML parse mode and whitelists a small tag set — bold, italic, underline, strikethrough, code, preformatted, links — escaping everything else. The alternative markup mode requires escaping eighteen distinct characters, and a single missed one fails the entire send. HTML is far more forgiving and the difference is invisible to end readers.

**Length.** Telegram caps messages around 4096 characters. Models overshoot despite token limits. Split on paragraph boundaries first, sentence boundaries second, hard cut as last resort, and send parts sequentially with a short delay between them.

---

## 9. Frontend structure

Six screens. Five are conventional CRUD; one carries the complexity.

**Login / Register** — Registration requires the invite code.

**Credentials** — Table of stored secrets showing type, provider, label, masked hint, and validation status. Add via modal. Each row has a validate action with immediate feedback. Delete is blocked with an explanation when the credential is in use.

**Destinations** — Add flow follows the guided detection sequence described above. Each row shows verification status and offers a test-message action.

**Workflows list** — The operational dashboard. Each row: name, destination, interval, next run, last run outcome, and an enable toggle. Auto-disabled workflows surface a prominent failure banner here rather than hiding it in a detail view.

**Workflow editor** — The one genuinely complex screen. Prompt fields, model selection filtered by the chosen credential's provider, generation parameters, destination, interval, context window. Two actions distinguish it:

- **Preview** — runs generation only, shows the result, posts nothing. Free iteration on prompt wording without spamming the group.
- **Run now** — full execution including the send, logged as a manual trigger.

Preview is what makes prompt authoring tolerable. Without it the only feedback loop is waiting 90 minutes and watching the group.

**Execution history** — Per-workflow list of runs with status, duration, token usage, and the generated text. Failed runs expand to show the error stage and message.

State handling follows the signals-and-resource pattern throughout; the editor is the only place needing meaningful local reactive state.

---

## 10. Build sequence

Each phase ends at a point where something demonstrably works.

**Phase 1 — Foundation.** Nx workspace, Docker Compose for Postgres and Redis, Prisma schema and first migration, JWT auth with invite gate, Angular shell with login and a guarded layout.
*Done when:* you can register with an invite code, log in, and see an empty authenticated page.

**Phase 2 — Credentials.** Encryption service, credentials CRUD, validation endpoints for all three credential types, UI with validate buttons.
*Done when:* all three validation buttons return green. Do not proceed past this — everything downstream assumes working secrets, and debugging a scheduled failure caused by a bad key is far more expensive than catching it here.

**Phase 3 — Manual publishing.** Destinations CRUD, the guided chat-id detection flow, the Telegram send path including sanitizing and splitting.
*Done when:* a button in the UI posts arbitrary text to a real group.

**Phase 4 — Generation.** Both provider adapters behind a single interface, normalized response shape, the preview endpoint, prompt assembly with anti-repetition context.
*Done when:* preview returns sensible text from both providers.

**Phase 5 — Scheduling.** Queue setup, worker entrypoint, schedule registration on enable, deregistration on disable and delete, remove-then-add on update, boot reconciliation.
*Done when:* a workflow set to 90 minutes posts unattended for six hours across a deliberate server restart.

**Phase 6 — Observability.** Execution records written on every path, history UI, next-run display, failure streak and auto-disable, failure banners.
*Done when:* you can revoke a key, walk away, and later understand exactly what happened and why from the UI alone.

**Phase 7 — Hardening.** Per-user workflow caps, worker concurrency limits, daily token budget per workflow, log retention.

---

## 11. Known failure modes

Ranked by how likely they are to cost you an evening:

| Failure | Cause | Mitigation |
|---|---|---|
| Workflow posts twice per interval | Schedule updated without removing the old one | Remove-then-add, always; verify with boot reconciliation |
| Telegram rejects the send | Malformed markup in model output | Default to HTML mode with a strict tag whitelist |
| "Bot is not a member of the chat" | Bot added but not granted post permission | Catch and translate the raw error into an actionable message |
| Chat id rejected | Positive id pasted for a supergroup | Guided detection flow; normalize and warn on manual entry |
| Posts become repetitive within a day | No anti-repetition context | Feed back recent successful output |
| All schedules vanish after a deploy | Redis restarted, schedules held only in memory | Postgres as source of truth, reconcile on boot |
| Silent multi-day outage | Failures logged but never surfaced | Failure streak, auto-disable, visible banner |
| Unexpected API bill | No cap on generation cost | Max tokens per run, minimum interval, per-workflow daily budget |
| Secrets readable in a database dump | Plaintext storage | AES-256-GCM at rest, decryption confined to the worker |

---

## 12. Explicitly out of scope for v1

Cron scheduling. Timezone support. A visual node-graph editor. Teams and shared ownership. Image or media generation. Multi-destination fan-out from one workflow. Approval queues. Webhooks. Additional LLM providers.

The node-graph editor is the tempting one, since it's what makes n8n *look* like n8n. It is also a substantially larger project than everything described above, and it delivers nothing the form-based editor doesn't already do for this use case. If the general-purpose automation platform is the real goal, that's a deliberate second project built on this foundation — not a v1 feature.
