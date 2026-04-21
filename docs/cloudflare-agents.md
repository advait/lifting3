# Cloudflare Agent Architecture in `lifting3`

Reviewed: 2026-04-21

This document describes the agent architecture that is actually implemented in the repo today.

The previous version of this doc described a target design built around separate `GeneralCoachAgent` and `WorkoutCoachAgent` `AIChatAgent` classes plus an `AppEvents/default` Durable Object. That is not what the code does right now.

## Current Runtime

`lifting3` currently uses one exported agent class:

- `CoachAgent` in [workers/coach-agent.ts](/home/advait/l3-root/l3/workers/coach-agent.ts)

Implementation details:

- base class: `Think<Env>`
- worker entrypoint: [workers/app.ts](/home/advait/l3-root/l3/workers/app.ts)
- agent routing: `routeAgentRequest(request, env)`
- chat recovery: disabled via `chatRecovery = false`
- max steps: `5`
- message concurrency: `"queue"`

There is no separate `GeneralCoachAgent` class, no separate `WorkoutCoachAgent` class, and no app-defined session manager layer.

## Thread Model

The app still has two coaching modes, but they are represented as instance names on the same `CoachAgent` class.

Current instance naming lives in [app/features/workouts/contracts.ts](/home/advait/l3-root/l3/app/features/workouts/contracts.ts):

- general coach thread: `general`
- workout-scoped thread: `workout:{workoutId}`

Helpers:

- `createGeneralCoachTarget()`
- `createWorkoutCoachTarget(workoutId)`
- `parseCoachInstanceName(instanceName)`

The root app shell defaults to the general coach target, and the workout detail route overrides that target with the canonical workout-scoped thread for the current workout.

## Client Integration

The coach UI lives in a sheet component, not on its own `/coach` route.

Key files:

- [app/root.tsx](/home/advait/l3-root/l3/app/root.tsx)
- [app/features/coach/coach-sheet.tsx](/home/advait/l3-root/l3/app/features/coach/coach-sheet.tsx)

The client uses:

- `useAgent({ agent: "CoachAgent", name: target.instanceName })`
- `useAgentChat({ agent, getInitialMessages })`

Initial chat history is loaded from the agent route's `get-messages` endpoint. The app does not mirror chat transcripts into D1 `sessions` or `messages` tables.

## Tool Surface

The current tool surface is defined in [workers/coach-agent-tools.ts](/home/advait/l3-root/l3/workers/coach-agent-tools.ts):

- `create_workout`
- `patch_workout`
- `query_history`
- `set_user_profile`

Important behavior:

- `patch_workout` is scoped on workout threads. A workout-bound thread cannot patch some other workout.
- `create_workout` can be used from either general or workout-scoped threads.
- `query_history` reads structured workout history through the shared D1 service layer.
- `set_user_profile` is the only durable settings mutation exposed through the coach today.

## Prompt and Context Assembly

`CoachAgent.beforeTurn()` assembles different prompts depending on the thread kind.

General thread context:

- recent workouts from `loadWorkoutList()`
- saved user profile from settings
- exercise catalog prompt
- patch contract prompt

Workout thread context:

- workout detail snapshot from `loadWorkoutDetail()`
- saved user profile from settings
- next open set summary
- PR count
- exercise summary lines
- explicit patch reference with real exercise and set ids

This means the current architecture relies more on server-side context assembly than on a large read-tool surface.

## Data Ownership

### D1 is authoritative for structured workout state

Workout facts live in D1 through the shared service layer in [app/features/workouts/d1-service.server.ts](/home/advait/l3-root/l3/app/features/workouts/d1-service.server.ts).

That includes:

- workouts
- workout exercises
- exercise sets
- workout versions for optimistic concurrency
- history queries used by `query_history`
- the `user_profile` app setting

Both route actions and agent tools call into this shared domain layer.

### Agent runtime owns chat history

The app relies on the Cloudflare agent runtime for conversation history. The UI fetches existing messages from the agent route, and there is no app-owned D1 chat persistence layer.

### App events are browser-local today

The repo does have an invalidation/event contract, but it is not backed by a Durable Object.

Current implementation:

- schema: [app/features/app-events/schema.ts](/home/advait/l3-root/l3/app/features/app-events/schema.ts)
- transport: [app/features/app-events/client.ts](/home/advait/l3-root/l3/app/features/app-events/client.ts)

Behavior:

- successful route actions publish invalidation envelopes into browser events
- successful coach tool calls also publish invalidation envelopes
- revalidation is handled with route `handle.invalidateKeys` plus `useRevalidator()`
- cross-tab fanout uses `BroadcastChannel` when available

There is no `AppEvents/default` Durable Object in the current codebase.

## Model Selection Today

Model selection is simpler than the old docs described.

Current behavior in [workers/coach-agent-helpers.ts](/home/advait/l3-root/l3/workers/coach-agent-helpers.ts):

- AI Gateway id: `default`
- model id: hardcoded `openai/gpt-5.4`

There is no implemented D1-backed global model selector yet.

The only persisted setting today is:

- `user_profile`

## Workout UI vs Agent Mutation Surface

The direct workout UI and the agent do not expose the same mutation surface.

Direct route actions today:

- `start_workout`
- `finish_workout`
- `update_set_designation`
- `update_set_planned`
- `update_set_actuals`
- `confirm_set`
- `unconfirm_set`
- `add_set`
- `remove_set`
- `remove_exercise`
- `reorder_exercise`
- `update_workout_notes`
- `update_exercise_notes`
- `update_exercise_rest_seconds`
- `delete_workout`

Agent-only mutation capabilities today:

- `create_workout`
- `patch_workout` ops like `add_exercise`, `replace_exercise`, `skip_exercise`, `skip_remaining_sets`, and `update_workout_metadata`

That split matters when writing docs or planning product work. The agent can currently do some workout restructuring that the manual UI does not yet expose.

## Post-Workout Flow Status

This repo does not yet implement a dedicated post-workout agent flow.

Current state:

- the workout thread remains available after completion
- the coach can discuss the completed workout using the same workout-scoped context
- the workout coach prompt tells the model to prefer `sourceWorkoutId` when creating a follow-up workout based on the current session

Missing pieces:

- no automatic post-workout summary step
- no special review/reflection thread kind
- no completion-triggered follow-up workflow
- no dedicated UI for post-workout analysis

If this is the next feature area, it should be documented and built as a new layer on top of the existing `general` and `workout:{workoutId}` thread model rather than pretending it already exists.

## Recommended Documentation Vocabulary

Use these names in repo docs for the current implementation:

- "CoachAgent" for the runtime class
- "general thread" for `general`
- "workout-scoped thread" for `workout:{workoutId}`
- "browser app-event invalidation" for the current revalidation mechanism

Avoid these phrases unless you are explicitly describing future work:

- `GeneralCoachAgent`
- `WorkoutCoachAgent`
- `AIChatAgent` as the current base class
- `AppEvents/default`
- D1-backed model preference
- post-workout review flow

## Near-Term Gaps

The main architecture gaps between the docs and the code are:

1. Post-workout flow is still missing.
2. Model selection is hardcoded instead of user-configurable.
3. Settings UI is placeholder-only even though `user_profile` persistence exists.
4. Analytics UI is placeholder-only even though history querying and PR calculations already exist.
5. Live invalidation is browser-local today, not server-pushed.
