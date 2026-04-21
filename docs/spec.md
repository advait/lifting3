# lifting3 Current Implementation Spec

Reviewed: 2026-04-21

This document describes the product and architecture that are implemented today. It is intentionally narrower than the older aspirational spec.

## 1. Product Summary

`lifting3` is a single-user workout app with an embedded coach.

The shipped product loop is:

1. Create or adapt a workout with the coach.
2. Open the workout detail screen.
3. Start the workout and log sets quickly.
4. Use the coach in-context if you need adjustments or history lookups.
5. Finish the workout and keep the structured session in history.

The app is strongest today in planning, workout execution, and structured history browsing.

## 2. Current Product Areas

Implemented routes:

- `/` or `/home`
- `/workouts`
- `/workouts/:workoutId`
- `/exercises`
- `/analytics`
- `/settings`

Important note:

- there is no standalone `/coach` route
- coaching is presented as a sheet in the global app shell

## 3. What Each Area Does Today

### Home

- shows recent workouts
- acts as the default landing page
- inherits the global general coach sheet

### Workouts

- lists planned, active, and completed workouts
- supports filters through query params
- links into workout detail

### Workout Detail

- shows workout title, date, status, duration, and notes
- shows ordered exercises and sets
- supports quick set logging and RPE confirmation
- supports historical edit mode for completed or canceled workouts
- attaches the canonical workout-scoped coach thread for that workout

### Exercises

- shows the exercise catalog
- includes history-aware summaries
- supports filtering

### Analytics

- route exists
- current UI is a placeholder marked coming soon

### Settings

- route exists
- current UI is a placeholder marked coming soon
- durable user profile storage exists in D1, but only through the coach tool, not a settings form yet

## 4. Current Coaching Model

The repo currently uses one Cloudflare agent class:

- `CoachAgent extends Think<Env>`

Thread identity is encoded in the instance name:

- `general`
- `workout:{workoutId}`

Current behavior:

- the app shell defaults to the `general` thread
- workout detail routes override the coach target to `workout:{workoutId}`
- the coach sheet uses `useAgent` and `useAgentChat`
- initial history is loaded from the agent route's `get-messages` endpoint

The repo does not currently implement:

- separate `GeneralCoachAgent` and `WorkoutCoachAgent` classes
- a standalone coach page
- a post-workout review thread kind

## 5. Current Tool Surface

The coach exposes four tools:

- `create_workout`
- `patch_workout`
- `query_history`
- `set_user_profile`

### `create_workout`

- creates a planned workout in D1
- can optionally adapt from `sourceWorkoutId`
- returns `workoutId`, `workoutUrl`, `version`, and invalidate keys

### `patch_workout`

- applies one guarded workout patch against `expectedVersion`
- returns `VERSION_MISMATCH` when context is stale
- is scoped on workout threads so a workout thread cannot patch some other workout

Supported op types today:

- `add_exercise`
- `replace_exercise`
- `skip_exercise`
- `reorder_exercise`
- `update_exercise_targets`
- `add_set`
- `skip_remaining_sets`
- `update_workout_metadata`
- `add_note`

### `query_history`

- performs structured history lookups against D1
- supports metrics like `top_set`, `max_load`, `reps_at_load`, `e1rm`, `volume`, `frequency`, and `best_session`

### `set_user_profile`

- stores or clears the durable `user_profile` setting
- is the only persisted settings mutation currently implemented

## 6. Data Ownership

### D1

Authoritative structured state lives in D1:

- workouts
- workout exercises
- exercise sets
- workout version counters
- app setting `user_profile`
- history queries and derived workout/exercise reads

### Agent Runtime

Conversation state lives in the Cloudflare agent runtime used by `CoachAgent`.

The app does not currently maintain D1 `sessions` or `messages` tables for chat history.

### Browser App Events

Route revalidation is currently driven by browser-local app events:

- route actions publish invalidation envelopes
- successful coach tool calls also publish invalidation envelopes
- revalidation uses route handles plus `useRevalidator()`
- cross-tab propagation uses `BroadcastChannel` when available

There is no server-backed `AppEvents/default` Durable Object in the current implementation.

## 7. Manual Workout UI Surface

The manual workout detail UI supports these route actions today:

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

Important limitation:

- adding, replacing, or skipping exercises is not exposed as first-class manual UI yet
- those operations currently live on the coach `patch_workout` surface

## 8. Workout Logging Behavior

Current workout logging model:

- workouts can be `planned`, `active`, `completed`, or `canceled`
- sets can hold planned values, actual values, and an optional `confirmedAt`
- RPE supports half-step increments
- quick visible RPE options are `6`, `7`, `7.5`, `8`, `8.5`, `9`, `9.5`, `10`
- a completed workout may still contain unconfirmed sets

In practice the detail screen is optimized around:

- carry-forward values
- quick weight and rep edits
- one-tap RPE confirmation
- PR feedback on confirmed sets

## 9. Model Configuration Today

Inference is currently configured in code, not in D1 settings.

Current values:

- AI Gateway id: `default`
- model id: `openai/gpt-5.4`

The older docs described a D1-backed global model preference. That is not implemented yet.

## 10. Settings State Today

The only durable app setting in the current codebase is:

- `user_profile`

That profile is used to give the coach durable context such as:

- goals
- constraints
- injuries or limitations
- schedule
- equipment access
- preferences

There is no shipped settings form for:

- model preference
- equipment rules
- unit preferences
- progression defaults

Those are still roadmap items.

## 11. Import and Export

Local scripts exist for data import and export:

- `pnpm validate:workout-json`
- `pnpm import:workout-json`
- `pnpm export:app-state`
- `pnpm import:app-state`

The repo already has an implementation path for moving structured app state in and out of the system, but this is command-line driven rather than a user-facing in-app workflow.

## 12. Post-Workout Flow Status

This is the most important missing feature area relative to the product direction.

What exists:

- a workout thread remains available after the workout is completed
- the coach can analyze the workout using the same workout-scoped context
- the coach can create a follow-up planned workout using `sourceWorkoutId`

What does not exist yet:

- no dedicated post-workout review mode
- no completion-triggered summary step
- no separate reflection or recap agent flow
- no specialized UI for "what should happen after I finish this session?"

Any doc that implies a post-workout agent flow already exists is inaccurate.

## 13. Known Gaps Between Product Direction and Code

The main current gaps are:

1. Post-workout coaching flow is not implemented.
2. Analytics route is mostly placeholder UI.
3. Settings route is mostly placeholder UI.
4. Model selection is hardcoded instead of configurable.
5. Live invalidation is browser-local instead of server-pushed.
6. The direct workout UI exposes fewer restructuring actions than the coach can perform.

## 14. Current Documentation Rule

When updating docs for this repo, describe the current implementation using this vocabulary:

- `CoachAgent`
- `Think`
- `general` thread
- `workout:{workoutId}` thread
- browser app-event invalidation
- hardcoded AI Gateway model

Do not describe these as current implementation unless they are added later:

- `GeneralCoachAgent`
- `WorkoutCoachAgent`
- `AIChatAgent` as the runtime base class
- `AppEvents/default`
- D1-backed model preference
- post-workout review flow
