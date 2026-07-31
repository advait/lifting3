# Effect Durable Agent architecture

Reviewed: 2026-07-31

`lifting3` is a public reference application for [`effect-durable-agent`](../effect-durable-agent). The coach runs as an event-sourced Cloudflare Durable Object; D1 remains authoritative for workout and profile data.

## Runtime

The Worker exports `EDACoachAgent`, an `EDASessionDurableObject<Env>`. Its runtime composes:

- OpenAI `gpt-5.4` through Cloudflare AI Gateway `default`
- a four-tool EDA registry
- a prompt projector that reloads current D1 context before each turn
- the `lifting3.coach.thread` application reducer
- the typed EDA WebSocket protocol

The former `CoachAgent extends Think<Env>` remains exported only as a temporary source for the one-off migration. New traffic never routes to it.

## Session identity and thread binding

The product exposes the same stable thread keys as before:

- `general`
- `workout:{workoutId}`

EDA session ids are deterministic UUID v5 values derived from those keys. This preserves one durable session per public thread without exposing Durable Object implementation details to the browser.

Each session records one `CoachThreadAttached` application event. The small custom reducer projects that fact to `{ target }`, rejects attempts to rebind a session, and gives the prompt projector a durable link back to current D1 context. Framework reducers already own transcripts, commands, runs, inferences, and tools, so duplicating them in an application reducer would add a second source of truth.

## Application events

The coach defines two durable application events:

- `CoachThreadAttached` binds the EDA session to its semantic product thread.
- `WorkoutMutationCommitted` records the existing workout invalidation envelope after a successful create or patch tool call.

`WorkoutMutationCommitted` is the bridge between durable agent work and product UI revalidation. The panel receives it on the EDA WebSocket and publishes the existing browser app-event envelope. It no longer guesses mutations by inspecting tool results.

## Prompt projection

The configured system message is committed by EDA. Before every inference, the prompt projector replaces its text with fresh context:

- general threads load recent workouts, the user profile, the exercise catalog, and the patch contract;
- workout threads load the current workout snapshot, open-set summary, PR count, exercise ids, and saved profile.

That keeps chat durable while preserving D1 as the authority for mutable workout facts.

## Tool surface

The EDA tool registry exposes:

- `create_workout`
- `patch_workout`
- `query_history`
- `set_user_profile`

The registry reuses the existing Zod inputs and D1 services. Workout-scoped sessions cannot patch a different workout. Successful workout mutations emit `WorkoutMutationCommitted` through EDA's tool execution context, placing the domain fact in the same durable event log as the tool lifecycle.

## HTTP and WebSocket facade

The browser uses a narrow application facade:

- `POST /api/coach/threads/:thread/messages` durably admits a queued message;
- `POST /api/coach/threads/:thread/stop` admits a stop command;
- `GET /api/coach/threads/:thread/events?afterSeq=N` upgrades to the EDA WebSocket;
- `DELETE /api/coach/threads/:thread/session` destroys the EDA session.

The WebSocket replays durable events after the last acknowledged sequence, streams ephemeral model deltas, requires frame acknowledgements, and reconnects with bounded exponential backoff. The React panel projects messages and tool cards directly from those events. No polling or `get-messages` bootstrap is needed.

## Data ownership

- D1 owns workouts, exercises, sets, optimistic versions, history, and `user_profile`.
- The EDA Durable Object owns commands, the conversation transcript, run/inference/tool lifecycle, and coach application events.
- Browser app events remain the local route-revalidation transport; durable workout mutation events are their server-originated source for agent changes.

This split lets the repository demonstrate crash-safe agent execution and resumable UI streaming without moving structured product data into chat state.
