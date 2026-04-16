# Cloudflare Agents Guidance for `lifting3`

Reviewed: 2026-04-16

This document explains the subset of the Cloudflare Agents SDK that makes sense for `lifting3`.

It is intentionally opinionated. The goal is not to cover every Agents feature. The goal is to map the Cloudflare model onto this repo's actual product shape:

- one authoritative `CoachAgent` Durable Object for MVP
- persistent chat sessions tied to workouts and general coaching
- durable structured storage for workouts, events, notes, and analytics
- a narrow, guarded server-side tool surface
- message compaction and session search

This document omits features we do not plan to use in MVP:

- Browser Run / browser tools
- Dynamic Workers / codemode / sandboxed code execution
- the full Think base class
- voice
- MCP server hosting
- sub-agents
- client-side tools unless a concrete browser-only need appears

## 1. What Cloudflare Agents actually are

Cloudflare Agents are a programming model on top of Durable Objects.

The important mental model:

- each agent instance is a Durable Object instance
- each instance has an identity, its own SQLite database, and its own event lifecycle
- the same instance name always routes back to the same agent instance
- the instance can hibernate when idle and wake back up on HTTP, WebSocket, email, schedule, or other events
- persistence lives with the agent instance instead of being reconstructed from an external session store

For `lifting3`, that maps well to the spec's "one top-level `CoachAgent` Durable Object as the authority for MVP".

## 2. Which Agents layer we should use

Cloudflare gives us three relevant layers:

1. `Agent`
2. `AIChatAgent`
3. `Think`

### `Agent`

`Agent` is the lowest-level and most durable fit for this project.

Use it for:

- authoritative domain state
- SQLite tables
- workout reducers and event logs
- explicit routing
- custom chat/session handling
- narrow RPC methods

### `AIChatAgent`

`AIChatAgent` is the easiest way to build one chat thread per agent instance. It gives you:

- automatic message persistence
- resumable streaming
- built-in tool continuation
- `saveMessages`, `persistMessages`, `waitUntilStable`, `onChatResponse`

That is excellent for a pure chat app, but it is not the cleanest fit for this repo's current architecture.

Why:

- `lifting3` wants one authoritative `CoachAgent`
- `lifting3` wants many chat threads inside that one authority:
  - one long-lived general coaching session
  - one canonical workout session per workout
- `AIChatAgent` is optimized around one persisted chat history per agent instance

Recommendation:

- use `Agent` for `CoachAgent`
- use the experimental `Session` / `SessionManager` APIs for multi-session conversation storage inside that one agent
- call the model with AI SDK primitives directly

### `Think`

Project Think is useful as a direction-of-travel document, not as our MVP base class.

Reasons not to build on `Think` yet:

- it is more opinionated than we need
- it bundles features we explicitly do not want in MVP
- our product already has a strong domain model and reducer story
- the spec explicitly says not to introduce sub-agents or a broad tool surface unless a clear need emerges

Use the Project Think primitives selectively. Do not adopt the full "batteries-included" abstraction first.

## 3. Recommended MVP architecture

### One authoritative agent instance

Use one `CoachAgent` class and one stable instance name for the single-user app.

For MVP:

- agent class: `CoachAgent`
- instance name: `"default"` or another stable fixed value

If the app later becomes multi-user, switch the instance name to a stable opaque user identifier derived from Access identity.

### Storage split

Inside `CoachAgent`, use three storage tiers:

1. `this.sql` for authoritative domain data
2. `SessionManager` for conversations and compacted session history
3. `this.setState()` only for small live-synced UI state

That maps directly to the spec:

- SQL tables for workouts, exercises, sets, events, and projections
- event log and projections in SQLite
- session summaries / compaction in the session layer
- minimal synced state for live UX

Important clarification:

- raw chat session/message storage should be owned by `Session` / `SessionManager`
- do not build a second handwritten chat persistence layer unless we need extra product-specific metadata that the session layer cannot hold

### Strong recommendation: keep workout facts out of chat memory

Chat memory is not the source of truth.

Use sessions for:

- conversational history
- summarized context
- long-lived coaching memory
- session search

Use SQL tables and reducers for:

- workouts
- exercises
- sets
- event versions
- PRs
- analytics projections

This preserves the spec rule that structured workout state wins.

## 4. `setState()` vs SQLite

Cloudflare Agents have two persistence styles that are easy to confuse.

### Use `this.setState()` for small synced state

`setState()`:

- persists to SQLite automatically
- broadcasts to connected clients
- triggers `onStateChanged()`
- replaces the whole state object rather than merging partials

For `lifting3`, use it only for things like:

- active stream metadata
- live UI status
- optimistic progress state
- connection-visible flags
- possibly pending approval state if we ever expose approval through direct agent connections

Do not put the whole workout database into `this.state`.

### Use `this.sql` for authoritative application data

Use SQL for:

- `workouts`
- `workout_exercises`
- `exercise_sets`
- `workout_events`
- analytics projections

If we use `SessionManager`, let it own the underlying session/message tables. Keep only the app-level linkage we actually need, such as:

- `workout.primary_session_id`
- optional session metadata references used by app screens or analytics

This is the durable system of record.

## 5. Sessions are the right Cloudflare primitive for this app

Cloudflare's Session API is the part of Project Think that best matches `lifting3`.

It gives us:

- persistent conversation storage
- tree-structured messages
- full-text search
- context blocks
- compaction
- generated context tools
- a `SessionManager` for multiple sessions in one Durable Object

Important caveat:

- the Session API lives under `agents/experimental/memory/session`
- Cloudflare says the API surface is stable but may still evolve before graduating into the main package

That is acceptable here because it matches the product model unusually well, but we should wrap it behind our own internal abstraction instead of spreading it everywhere.

## 6. Recommended session model for `lifting3`

Use one `SessionManager` inside `CoachAgent`.

Suggested mapping:

- general coaching thread -> one SessionManager session
- workout thread -> one SessionManager session per workout
- `sessions.id` in app SQL -> SessionManager session ID
- `workout.primary_session_id` -> the session ID used by SessionManager

Recommended pattern:

```ts
import { Agent } from "agents";
import { SessionManager } from "agents/experimental/memory/session";

export class CoachAgent extends Agent<Env, CoachUiState> {
  manager = SessionManager.create(this)
    .withContext("identity", {
      provider: {
        get: async () => "You are the coaching agent for lifting3.",
      },
    })
    .withContext("profile-memory", {
      description: "Durable coaching memory about the user.",
      maxTokens: 1200,
    })
    .withSearchableHistory("history")
    .withCachedPrompt()
    .onCompaction(this.compactSession.bind(this))
    .compactAfter(100_000);
}
```

Use session metadata to store app-level references like:

- title
- kind: `general | workout`
- `workoutId`
- source
- model

## 7. Context blocks: use them, but keep them narrow

Sessions support context blocks and auto-generated tools for reading and writing them.

That is powerful, but we should be selective.

### Good uses

- durable coach memory about the user
- equipment constraints
- profile/preferences
- stable instructions
- searchable historical session summaries

### Bad uses

- raw workout facts
- full event logs
- arbitrary mutable application state
- giant imported history dumps

### Default posture

Prefer read-only context blocks unless the model truly needs to write to them.

If a block is writable, the session layer generates `set_context`.

That is fine for "coach memory" or "profile memory".

It is not fine for the canonical workout domain model.

## 8. Compaction: how to use it here

Session compaction is one of the main reasons to use the Session API.

What Cloudflare's compaction does:

- preserves original messages in SQLite
- stores a summary overlay instead of destructively deleting history
- protects the head of the conversation
- protects the most recent tail of the conversation
- avoids splitting tool call/result pairs
- updates summaries iteratively on later compactions

This is exactly the behavior we want for long-lived coaching threads.

### Recommended use in `lifting3`

Use compaction for:

- the general coaching session
- workout chat sessions after they get long

Do not use compaction as a substitute for:

- the workout event log
- an audit trail
- derived analytics tables

Those remain in SQL.

### Suggested operating rule

Start with auto-compaction enabled and tune later:

- `.compactAfter(100_000)` is a reasonable initial default
- only compact chat/session history, never structured workout tables

### Important implementation note

If context blocks change after using `withCachedPrompt()`, call `refreshSystemPrompt()`.

Otherwise the frozen prompt will continue using the old block layout.

## 9. Tool design for `lifting3`

Cloudflare chat tooling supports three tool styles:

- server-side tools
- client-side tools
- approval-gated tools via `needsApproval`

For this app, the right default is simple:

- use server-side tools
- avoid client-side tools
- use explicit UI confirmation for meaningful mutations

### Server-side tools we should expose

This matches the spec:

- `create_workout_draft`
- `patch_workout`
- `query_history`

Design rules:

- each tool takes narrow structured input
- each mutation tool targets stable IDs
- every mutation carries `expected_version`
- every committed mutation should retain the originating chat message ID when available
- tool output stays small and structured
- heavy data stays in SQL or derived summaries, not raw tool output blobs

### What not to do

Do not expose:

- one tool per button
- raw SQL tools
- generic "edit anything" tools
- browser-only client tools for normal logging flows

The user can already log sets through ordinary UI actions faster than the model can.

### Combining session tools with app tools

If we use writable/searchable context blocks, the session layer can generate tools like:

- `set_context`
- `search_context`
- `load_context`
- `session_search`

Those should be additive, not primary.

The model's main domain surface should still be our explicit app tools.

Conceptually:

```ts
const session = this.manager.getSession(sessionId);

const tools = {
  ...(await session.tools()),
  create_workout_draft: createWorkoutDraftTool,
  patch_workout: patchWorkoutTool,
  query_history: queryHistoryTool,
};
```

## 10. Approval model

Cloudflare supports approval-gated tools with `needsApproval`.

That is useful, but it should not be our first line of mutation safety.

For `lifting3`, the better default is:

- reducer-level validation in the backend
- explicit conflict handling with `expected_version`
- a clear diff card in the UI for meaningful agent-authored changes

If we later adopt `AIChatAgent` for some flows, `needsApproval` is a good fit for:

- destructive workout edits
- actions that replace remaining planned work
- anything the user should explicitly accept before execution

But for MVP, visible patch review in the app UI is clearer than pushing all approval semantics into the chat layer.

## 11. `AIChatAgent` features we should still understand

Even if we do not build `CoachAgent` on `AIChatAgent` first, a few `AIChatAgent` concepts matter because they inform good design.

### `persistMessages` vs `saveMessages`

If we later use `AIChatAgent`:

- `persistMessages` stores messages without triggering a model turn
- `saveMessages` stores messages and triggers a new turn

`saveMessages` is serialized and safe for server-driven follow-ups.

### `waitUntilStable()`

If a non-chat entry point triggers turns, Cloudflare recommends `waitUntilStable()` before reading or appending to the chat history.

That avoids colliding with:

- an active stream
- queued continuations
- pending client-tool interactions

### `onChatResponse`

This hook runs after a turn completes and persistence is finished.

That is useful if we later want to trigger sequential follow-up work after a response is fully stored.

### Message row size protection

`AIChatAgent` automatically protects against SQLite's 2 MB row limit by compacting huge tool outputs and truncating oversized text parts.

That is valuable if we ever move to `AIChatAgent`.

If we stay on `Agent` + `SessionManager`, we need to adopt the same discipline ourselves:

- never persist giant tool outputs directly
- store heavy artifacts elsewhere
- persist summaries, IDs, and structured small results

## 12. Routing and instance access

Cloudflare supports a default route shape:

```text
/agents/{agent-name}/{instance-name}
```

with `routeAgentRequest()`.

That is useful if we expose direct WebSocket or HTTP agent endpoints.

For this app, there are two valid patterns.

### Pattern A: direct agent route

Use `routeAgentRequest()` and connect the browser directly to:

- `/agents/coach-agent/default`

Pros:

- easy real-time connections
- natural fit for WebSocket-based agent UX

Cons:

- pushes more of the chat transport model directly into the UI

### Pattern B: app routes call the agent internally

Use normal React Router loaders/actions and look up the agent from Worker code with `getAgentByName()`.

Pros:

- keeps the app's server boundary in one place
- simpler if most traffic is ordinary app CRUD
- a better fit for the current repo structure

Cons:

- more custom work for live streaming chat transport

For MVP, Pattern B is the safer default unless we decide that chat streaming must be agent-native from day one.

## 13. `@callable()` is optional here

`@callable()` is for external WebSocket RPC into an agent.

Use it when:

- the browser talks directly to the agent
- a mobile client talks directly to the agent
- another external runtime talks to the agent over the agent protocol

Do not use it for same-worker internal calls.

Inside the Worker, use Durable Object RPC via `getAgentByName()` instead.

For this repo, that means:

- internal app code -> use `getAgentByName()`
- direct browser-to-agent connection -> consider `@callable()` only if needed

If we do use `@callable()`, Cloudflare's current requirements matter:

- add the `agents/vite` plugin
- extend `agents/tsconfig` or at least target `ES2021`
- do not enable `experimentalDecorators`

## 14. Minimal repo changes required before implementation

The repo does not yet have Agents packages or Durable Object bindings configured.

Before implementation, we will need at least:

- `agents`
- `ai`
- a provider package such as `workers-ai-provider`
- `zod`

Potentially later:

- `@cloudflare/ai-chat` if we explicitly adopt `AIChatAgent`

Wrangler will also need:

- `nodejs_compat`
- a Durable Object binding for `CoachAgent`
- a `new_sqlite_classes` migration for `CoachAgent`
- optionally an `AI` binding if we start with Workers AI

Illustrative `wrangler.jsonc` shape:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "lifting3",
  "main": "./workers/app.ts",
  "compatibility_date": "2026-04-16",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [{ "name": "CoachAgent", "class_name": "CoachAgent" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["CoachAgent"] }],
  "observability": { "enabled": true }
}
```

If we start with Workers AI:

```jsonc
{
  "ai": { "binding": "AI" }
}
```

## 15. What we should deliberately not use in MVP

Skip these until the core workout system is solid:

- `Think` as the main base class
- sub-agents
- Browser Run / browser tools
- sandboxed code execution
- Dynamic Workers / codemode
- self-authored tools
- broad client-side tool surfaces
- MCP servers
- workflow-based orchestration unless a real background job need appears

This is not anti-Cloudflare. It is discipline.

The app already has a strong domain model. The main risk is adding too much agent machinery too early.

## 16. Final recommendation

For `lifting3`, the recommended Cloudflare architecture is:

1. Build one `CoachAgent extends Agent`.
2. Use one stable agent instance for MVP.
3. Store workouts, events, projections, and notes in `this.sql`.
4. Use `SessionManager` for the general coaching thread plus one workout thread per workout.
5. Enable session compaction and searchable history.
6. Keep domain tools narrow and server-side.
7. Keep direct app actions outside the LLM tool surface.
8. Treat Project Think as a source of primitives, not as the product architecture.

This gives us the part of Cloudflare Agents that actually helps:

- durable identity
- built-in SQLite
- persistent sessions
- compaction
- search
- tool calling
- optional real-time transport

without dragging in the parts the product does not need yet.

## Official references

- Cloudflare Agents overview: https://developers.cloudflare.com/agents/
- Agents API: https://developers.cloudflare.com/agents/api-reference/agents-api/
- Configuration: https://developers.cloudflare.com/agents/api-reference/configuration/
- Routing: https://developers.cloudflare.com/agents/api-reference/routing/
- Store and sync state: https://developers.cloudflare.com/agents/api-reference/store-and-sync-state/
- Chat agents: https://developers.cloudflare.com/agents/api-reference/chat-agents/
- Sessions: https://developers.cloudflare.com/agents/api-reference/sessions/
- Human in the loop: https://developers.cloudflare.com/agents/concepts/human-in-the-loop/
- Autonomous responses: https://developers.cloudflare.com/agents/guides/autonomous-responses/
- Using AI models: https://developers.cloudflare.com/agents/api-reference/using-ai-models/
- Project Think blog post: https://blog.cloudflare.com/project-think/
