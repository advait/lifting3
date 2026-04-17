# Cloudflare Agents Guidance for `lifting3`

Reviewed: 2026-04-16

This document explains the Cloudflare architecture that best matches `lifting3` while staying on Cloudflare's path of least resistance.

The core decision is:

- use D1 as the authoritative store for structured workout data
- use Drizzle for D1 schema, migrations, and queries
- use Cloudflare `AIChatAgent` for canonical conversation threads
- use one global AI Gateway model ID from a singleton `settings` row, defaulting to `openai/gpt-5.4`
- use a singleton `AppEvents/default` Durable Object for best-effort live fanout
- keep agent tools narrow and server-side

This document intentionally omits features we do not plan to use in MVP:

- Browser Run / browser tools
- Dynamic Workers / codemode / sandboxed execution
- Think as the primary base class
- Session API / `SessionManager` as the default chat model
- sub-agents
- MCP servers
- voice

## 1. Recommended architecture

Use four major pieces:

1. one shared D1 database
2. one `GeneralCoachAgent` instance
3. one `WorkoutCoachAgent` instance per workout
4. one singleton `AppEvents/default` Durable Object

Recommended mapping:

- structured workout state -> D1
- workout list/history/analytics -> D1
- general coaching thread -> `GeneralCoachAgent/default`
- canonical workout thread -> `WorkoutCoachAgent/{workoutId}`
- global live mutation fanout -> `AppEvents/default`

This gives the app:

- one conversation per agent instance, which matches `AIChatAgent`
- normal SQL for cross-workout reads
- no custom app-owned chat persistence layer
- one global listener for best-effort invalidation in a single-user app
- direct alignment with Cloudflare's documented chat-agent path

## 2. Why this is the Cloudflare happy path

Cloudflare's easiest supported chat model is:

- one agent instance
- one persisted chat thread
- built-in message persistence
- streaming responses
- resumable streams
- tools defined inside `onChatMessage()`

That matches:

- `GeneralCoachAgent/default`
- `WorkoutCoachAgent/{workoutId}`

It does not match the older design of one top-level `CoachAgent` that owns many chat sessions internally.

That older design is still possible, but it pushes you toward the experimental Session API and extra custom architecture. For MVP, it is the harder path.

## 3. D1 vs agent/live storage

### Put this in D1

Use D1 as the authoritative structured store for:

- `settings`
- `workouts`
- `workout_exercises`
- `exercise_sets`
- notes
- import/export metadata
- exercise facts and analytics projections
- optimistic concurrency state such as `version`

This is where cross-workout queries belong.

### Put this in agent storage

Let `AIChatAgent` persist:

- general coach messages
- workout coach messages
- tool call/result history inside those conversations
- stream recovery state

Do not mirror that history into app-owned D1 `sessions` / `messages` tables in MVP.

### Put this in `AppEvents/default`

Use the singleton DO for:

- global WebSocket listeners
- best-effort broadcast of mutation notifications after every committed persisted mutation
- transient connection bookkeeping only

Do not put into `AppEvents/default`:

- authoritative workout state
- queryable history
- replayable event logs
- durable app state of any kind

### Use `setState()` sparingly

Only use `setState()` for small live-synced state if needed later, for example:

- ephemeral connection-visible UI flags
- live stream metadata
- tiny optimistic indicators

Do not put the workout database in `this.state`.

## 4. Recommended agent model

### `GeneralCoachAgent`

Use one stable instance:

- class: `GeneralCoachAgent`
- name: `"default"`

Responsibilities:

- general planning
- workout creation
- broad coaching discussion
- cross-workout reasoning using D1 reads
- patching any workout when needed, including historical corrections

### `WorkoutCoachAgent`

Use one instance per workout:

- class: `WorkoutCoachAgent`
- name: `workoutId`

Responsibilities:

- canonical workout conversation
- in-workout modifications
- workout-specific summaries
- reasoning over the active workout plus recent relevant history

Important rule:

- the workout's canonical conversation identity should just be `WorkoutCoachAgent/{workoutId}`
- `WorkoutCoachAgent` is the canonical in-context thread for a workout, not the exclusive mutation owner
- do not invent a second app-level session identity unless a later feature requires it

## 5. Chat transport

The lowest-friction Cloudflare routing model is:

```text
/agents/general-coach/default
/agents/workout-coach/:workoutId
```

Use:

- `routeAgentRequest()` in the Worker
- `useAgent()`
- `useAgentChat()`

This should be the primary chat transport.

The rest of the app can still use normal React Router loaders/actions for structured data screens.

Use a separate global WebSocket transport for live invalidation:

```text
/events/default
```

That route should connect to the singleton `AppEvents/default` Durable Object.

## 6. Shared mutation/query layer

Keep one domain service layer for workout mutations and reads.

Both of these should call the same code:

- manual UI actions
- agent tools

That layer should:

- use Drizzle against D1
- enforce `expected_version`
- rebuild/update projections
- reject stale writes with `VERSION_MISMATCH`
- publish a best-effort invalidation envelope to `AppEvents/default` after commit

For multi-workout correction flows:

- execute one guarded patch per target workout
- allow partial success
- return an explicit per-workout result summary to the caller

The important architectural rule is:

- agent tools do not own business rules
- reducers/services own business rules

## 7. Tool design

Keep the tool surface exactly as narrow as the spec wants:

- `create_workout`
- `patch_workout`
- `query_history`

Recommended ownership:

- `create_workout` -> either agent
- `patch_workout` -> both agents
- `query_history` -> either agent, backed by D1 reads

Typical usage:

- `WorkoutCoachAgent` usually patches its own workout
- `WorkoutCoachAgent` may also create a follow-up workout, often adapted from its current workout context
- `GeneralCoachAgent` may patch any existing workout after loading the latest snapshot
- cross-workout correction requests from `GeneralCoachAgent` should still decompose into one guarded patch per target workout
- all persisted mutations, including lightweight set-field updates, should emit the same live invalidation flow

The invalidation envelope should use a shared Zod schema in code so UI emitters and listeners validate the same contract.

Define tools inside `onChatMessage()` with AI SDK `tool()`.

Example shape:

```ts
import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, streamText, tool } from "ai";
import { z } from "zod";

export class WorkoutCoachAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workoutId = this.name;
    const modelId = await loadGlobalModelSetting(this.env.DB);

    const result = streamText({
      model: gatewayLanguageModel(this.env, modelId),
      messages: await convertToModelMessages(this.messages),
      tools: {
        patch_workout: tool({
          description: "Apply a guarded patch to the active workout.",
          inputSchema: z.object({
            workout_id: z.string(),
            expected_version: z.number(),
            reason: z.string(),
            ops: z.array(z.unknown()),
          }),
          execute: async (input) => patchWorkoutWithGuards(this.env.DB, input),
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
```

### Model selection and inference

Use one global setting value for the active model.

Rules:

- store the exact Cloudflare AI Gateway model ID in the singleton `settings` row
- default it to `openai/gpt-5.4`
- use Cloudflare AI Gateway taxonomy directly
- do not define app-level model aliases
- do not define per-agent model mappings in MVP

Example stored values:

- `openai/gpt-5.4`
- `anthropic/claude-opus-4-1`
- `google/gemini-2.5-pro`

Inference flow:

- the client sends a message to a Cloudflare agent route
- `AIChatAgent` persists the thread and handles chat/runtime concerns
- the agent reads the global model setting from D1
- the agent passes that exact model ID to an AI SDK model created through Cloudflare AI Gateway

Important rule:

- Cloudflare Agents are the chat/runtime layer
- Cloudflare AI Gateway is the inference routing layer
- the app stores one vendor-qualified model ID, not a local alias

### Do not use in MVP

Avoid:

- client-side tools
- generic SQL tools
- one tool per UI button
- "edit anything" tools

The user should still log sets faster through direct UI actions than through chat.

## 8. Concurrency and consistency

Moving structured data into D1 means you no longer get implicit single-threaded serialization for workout storage.

That is acceptable, but the spec must keep explicit concurrency guards.

Required rules:

- every mutation carries `expected_version`
- updates run in a D1 transaction where applicable
- stale writes return `VERSION_MISMATCH`
- all mutations target stable IDs

### Important consistency seam

There is no automatic single transaction spanning:

- AIChatAgent message persistence in Durable Object storage
- D1 workout mutation
- `AppEvents/default` notification broadcast

Design implications:

- mutation handlers must be idempotent
- D1 state should be the source of truth for what committed
- live broadcast is best-effort and non-authoritative
- the UI should prefer committed workout state over optimistic chat assumptions
- WebSocket listeners should treat notifications as invalidation hints and trigger RR7 loader revalidation or fetcher reloads from D1-backed reads
- `AppEvents/default` should stay stateless apart from transient connection tracking

## 9. Context assembly

Do not build a large read-tool surface.

Before the model runs, assemble the needed context on the server from D1:

- profile/preferences
- active workout snapshot
- recent relevant workouts
- derived exercise stats
- recent milestones / PRs

Then pass the assembled context into the model prompt or tool layer.

This preserves the spec's "context assembly, not tool sprawl" principle.

## 10. What about compaction?

If the goal is strict Cloudflare happy path, do not start with the Session API just to get message compaction.

Instead, in MVP:

- use `AIChatAgent`
- let it handle normal message persistence and resumable streaming
- rely on `pruneMessages()` or similar model-context trimming for what the LLM sees
- rely on built-in row-size protection for oversized message/tool payloads

What `AIChatAgent` already gives you:

- automatic message persistence
- resumable streams
- row-size protection for large message/tool payloads

What it does not give you as the primary model:

- explicit Session API compaction overlays
- multi-session search inside one agent

If later you need:

- long-lived searchable coaching memory
- explicit non-destructive summary overlays
- session forking

then evaluate the Session API as a phase-2 enhancement. It is not the MVP happy path.

## 11. Drizzle + D1 guidance

Use Drizzle as the only application-facing persistence layer for D1.

Recommended uses:

- schema definitions in TypeScript
- migration files checked into the repo
- query helpers for reads
- transaction-scoped service functions for guarded writes

Recommended posture:

- D1 schema is the authoritative structured model
- Drizzle migrations are the authoritative schema history
- agent tool handlers should call typed Drizzle services, not inline SQL

## 12. Cross-workout reads

This is the main reason D1 is preferable here.

The following should read D1 directly:

- Home
- Workouts list
- Analytics
- General coach history lookups
- PR views

Do not build these by querying many workout agents at request time.

That would be the main operational trap if workout truth lived inside per-workout DO storage.

## 13. What not to use in MVP

Skip these until the core product is working:

- Think as the main base class
- Session API as the default chat layer
- sub-agents
- Browser Run
- sandboxed code execution
- self-authored tools
- MCP server hosting
- workflow-based orchestration for ordinary chat turns

This is not anti-Cloudflare. It is just staying on the shortest path.

## 14. Required repo/config changes

The repo will need at least:

- `agents`
- `@cloudflare/ai-chat`
- `ai`
- `drizzle-orm`
- `drizzle-kit`
- `zod`

Wrangler will need at minimum:

- `nodejs_compat`
- a D1 binding, for example `DB`
- Durable Object bindings for `GeneralCoachAgent` and `WorkoutCoachAgent`
- a Durable Object binding for `AppEvents`
- migration entries for all three Durable Object classes
- an `AI` binding plus Cloudflare AI Gateway configuration for provider keys or billing

Illustrative shape:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "lifting3",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-04-16",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "lifting3",
      "database_id": "replace-me",
    },
  ],
  "durable_objects": {
    "bindings": [
      { "name": "GeneralCoachAgent", "class_name": "GeneralCoachAgent" },
      { "name": "WorkoutCoachAgent", "class_name": "WorkoutCoachAgent" },
      { "name": "AppEvents", "class_name": "AppEvents" },
    ],
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["GeneralCoachAgent", "WorkoutCoachAgent", "AppEvents"],
    },
  ],
  "observability": { "enabled": true },
}
```

Require the shared Workers AI `AI` binding for inference, and keep third-party provider keys in Cloudflare AI Gateway instead of Worker secrets.

## 15. Final recommendation

For `lifting3`, the Cloudflare-native architecture should be:

1. D1 as the authoritative store for structured workout data.
2. Drizzle for D1 schema, migrations, and queries.
3. `GeneralCoachAgent/default` for the general coach thread.
4. `WorkoutCoachAgent/{workoutId}` for the canonical workout thread.
5. one singleton `settings` row storing an AI Gateway model ID, defaulting to `openai/gpt-5.4`
6. Cloudflare AI Gateway as the inference routing layer for that model ID
7. `AppEvents/default` as a singleton WebSocket fanout hub for best-effort invalidation.
8. Direct chat via `routeAgentRequest()` and `useAgentChat()`.
9. Shared D1-backed domain services used by both UI actions and agent tools.

That gives you the part of Cloudflare that helps most:

- built-in durable chat runtime
- direct conversation routing
- DO-backed message persistence
- one global live notification channel for a single-user app
- resumable streams
- ordinary SQL for app data
- clean cross-workout querying

without forcing the workout database itself into Durable Object storage.

## Official references

- Cloudflare Agents overview: https://developers.cloudflare.com/agents/
- Agents API: https://developers.cloudflare.com/agents/api-reference/agents-api/
- Chat agents: https://developers.cloudflare.com/agents/api-reference/chat-agents/
- Routing: https://developers.cloudflare.com/agents/api-reference/routing/
- Store and sync state: https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/
- Using AI models: https://developers.cloudflare.com/agents/api-reference/using-ai-models/
- AI Gateway: https://developers.cloudflare.com/ai-gateway/
- AI Gateway + Vercel AI SDK: https://developers.cloudflare.com/ai-gateway/integrations/vercel-ai-sdk/
- D1: https://developers.cloudflare.com/d1/
- Durable Objects: https://developers.cloudflare.com/durable-objects/
- Project Think: https://blog.cloudflare.com/project-think/
