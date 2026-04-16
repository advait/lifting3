# lifting3 Product Spec

## 1. Summary

`lifting3` is a single-user workout coaching app.

It combines four things in one durable system:

- workout planning with an LLM-backed coach
- fast in-workout logging with minimal friction
- live workout modification without losing existing state
- historical analysis across workouts, exercises, and conversations

The app is not a chatbot with a workout attached. It is a structured workout system with an agent embedded into it.

The core product bet is:

- structured workout state is the source of truth
- conversations are persistent and useful, but advisory
- all committed edits, whether manual or agent-authored, flow through one authoritative mutation pipeline that appends persisted workout events and may emit live notifications

## 2. Goals

- Generate the next workout based on recent performance, fatigue signals, and goals.
- Let the user log sets quickly during a workout without depending on the agent.
- Let the user talk to the agent during a workout to add, remove, replace, reorder, or retarget work without blowing away logged facts.
- Preserve historical conversations and tie them cleanly to workouts.
- Make historical workouts easy to browse, inspect, edit, and learn from.
- Make exercise progress obvious through derived stats, PR detection, and trend views.

## 3. Non-Goals

- Multi-user support.
- App-level authentication, login UI, or user account management in MVP.
- Social features, likes, follows, public profiles, or sharing.
- Generic wellness tracking outside the workout domain.
- Auto-programming for teams or coaches managing many athletes.
- Broad wearable/device integration in MVP.
- An unconstrained tool surface for the agent.

## 4. Product Principles

### 4.1 Structured State Wins

Workout facts live in structured storage, not in message text.

- A chat message that says "we swapped OHP for lateral raises" does nothing on its own.
- The change becomes real only after a structured mutation is committed.

### 4.2 Durable Sessions, Durable Workouts

Both chat and workout state persist across refreshes, device changes, and interruptions.

### 4.3 Fast Manual Logging First

Normal set logging should be faster than talking to the agent.

### 4.4 Minimal Agent Surface

The app should not expose dozens of narrowly scoped tools. Reads should mostly be assembled into context by the backend. Mutations should flow through a small number of guarded operations.

### 4.5 Stale Context Is Normal

The agent will sometimes hold stale context. The system must be designed for that. Mutations must be versioned and conflict-aware.

### 4.6 Historical Integrity Matters

Completed workouts are editable, but edits append correction events rather than silently rewriting history.

### 4.7 Common Actions Must Stay Visible

The most common in-workout actions should not be buried in overflow menus.

Directly visible actions should include:

- confirm or skip set
- add set
- remove unperformed set
- add exercise
- replace exercise
- open notes

Overflow menus are acceptable for rare or destructive actions, not for the core logging loop.

## 5. Target User

One user in MVP.

This matters because the design can assume:

- a single authoritative profile
- no permissioning matrix
- no shared plans
- direct, opinionated UX optimized for one workflow instead of generic configurability

## 5.1 Auth Model

`lifting3` will sit behind Cloudflare Access.

Implications:

- no in-app sign-in flow
- no password, OAuth, or magic-link implementation
- no multi-user account model in MVP
- the app can assume the request has already passed perimeter access control

Any identity surfaced inside the app should be treated as optional request context, not a product-level auth system.

## 6. Information Architecture

## 6.1 Primary Areas

- `Home`
- `Workouts`
- `Coach`
- `Analytics`
- `Settings`

## 6.2 Route Tree (RR7)

The UI will use React Router v7 with nested layouts and data APIs.

```text
/
  home
  workouts
    /workouts
    /workouts/new
    /workouts/:workoutId
    /workouts/:workoutId/edit
    /workouts/:workoutId/history
  coach
    /coach
  analytics
    /analytics
    /analytics/exercises/:exerciseSlug
  settings
    /settings
```

## 6.3 Screen Responsibilities

### Home

Landing page for daily use.

- active workout card if a workout is in progress
- next planned workout
- recent PRs / milestones
- short recent history
- quick launch into `Coach`

### Workouts List

Primary historical browsing surface.

- reverse chronological workout list
- filters by date range, status, source, exercise
- quick stats per workout
- click into workout detail
- exercise-driven drill-down that can always return to the parent workout

### Workout Detail

Used for both live and historical workouts.

- workout header
- user notes and coaching notes
- ordered exercise list
- ordered sets inside each exercise
- clear `done` vs `tbd` treatment
- agent panel attached to the workout's canonical `WorkoutCoachAgent`
- direct links into exercise-specific history without losing workout context

### Coach

General coaching thread not tied to a single workout.

- programming questions
- planning
- injury/equipment constraints
- longitudinal analysis

### Analytics

Derived progress views.

- exercise trends
- best sets
- estimated 1RM trends
- volume trends
- frequency and consistency

### Settings

- profile
- available equipment
- unit preferences
- default progression preferences
- global model preference stored as a Cloudflare AI Gateway model ID
- default model value: `openai/gpt-5.4`
- note on imported workout sources

## 6.4 Navigation Model

### Desktop

- left sidebar for primary navigation
- content pane center
- contextual right rail on workout detail for the canonical workout coach agent

### Mobile

- bottom navigation for primary areas
- workout detail keeps a floating `Coach` action that opens the canonical workout coach thread in a drawer/sheet
- active workout gets priority in navigation and resume affordances

## 6.5 IA Rule

Logging, history, analytics, and coaching must feel like connected views over the same workout system, not separate product islands.

The user should be able to move fluidly:

- from a workout to its exercise history
- from exercise history back to the exact parent workout
- from a workout into its canonical coaching thread
- from analytics into concrete historical workouts

## 7. Core Domain Model

## 7.1 Workout

Represents one planned, active, completed, or canceled workout.

Fields:

- `id`
- `title`
- `date`
- `status`: `planned | active | completed | canceled`
- `source`: `manual | imported | agent`
- `user_notes`
- `coach_notes`
- `version`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

Notes semantics:

- `user_notes`: the user's own notes
- `coach_notes`: agent-authored or coaching-oriented notes, preserved separately from user notes

Status semantics:

- `planned`: created but not yet started
- `active`: started and currently in progress
- `completed`: finished workout with preserved logged history
- `canceled`: abandoned workout that should remain visible in history

## 7.2 Exercise

Ordered child of a workout.

Fields:

- `id`
- `workout_id`
- `order_index`
- `exercise_schema_id`
- `name`
- `normalized_exercise_key`
- `status`: `planned | active | completed | skipped | replaced`
- `user_notes`
- `coach_notes`

Constraints:

- exercises are ordered
- each exercise has stable identity independent of order
- reordering must not change IDs
- a normalized exercise key should survive minor naming variations for analytics and PR detection
- every exercise must map to a hard schema defined in code

## 7.2.1 Exercise Schemas

Exercise definitions should live in TypeScript as explicit schemas, not as ad hoc user strings.

Each exercise schema should define at least:

- canonical ID
- canonical display name
- alias list for import and normalization
- equipment classification
- lift category
- supported logging shape if needed later

Implications:

- MVP does not rely on freeform user-defined exercises as the primary data model
- imported `lifting2` exercise names must map into code-defined schema IDs
- aliases handle legacy naming variation without weakening the canonical schema model

## 7.3 Set

Ordered child of an exercise.

Fields:

- `id`
- `exercise_id`
- `order_index`
- `designation`: `warmup | working`
- `planned_weight_lbs` nullable
- `planned_reps` nullable
- `planned_rpe` nullable
- `actual_weight_lbs` nullable
- `actual_reps` nullable
- `actual_rpe` nullable
- `status`: `tbd | done | skipped`
- `completed_at` nullable

Set semantics:

- `tbd`: not yet confirmed; may still carry partial actual fields entered ahead of confirmation
- `done`: confirmed completed
- `skipped`: intentionally skipped

Critical product rules:

- Setting `actual_rpe` is the default confirmation action for a live set.
- The user may enter actual weight/reps while the set remains `tbd`.
- A workout may be completed even if some remaining sets are still `tbd`.

Implications:

- Weight and reps may be prefilled from plan or entered before confirmation.
- The act of assigning RPE is usually the fastest way to commit "this set happened."
- Completed workouts may preserve leftover planned work as `tbd` when the session ends early.

RPE values should support half-step increments.

The quick-entry path must include at least:

- `7`
- `7.5`
- `8`
- `8.5`
- `9`
- `9.5`
- `10`

## 7.4 Agent Conversation

Canonical conversation thread implemented as a Cloudflare `AIChatAgent` instance.

Logical fields:

- `agent_class`: `GeneralCoachAgent | WorkoutCoachAgent`
- `instance_name`
- `kind`: `general | workout`
- `workout_id` nullable

Semantics:

- the general coaching thread is `GeneralCoachAgent/default`
- the canonical workout thread is `WorkoutCoachAgent/{workout.id}`
- Cloudflare Agents persist message history inside agent storage
- MVP does not maintain a normalized D1 `sessions` table for chat persistence

## 7.5 Agent Message

Logical message fields the application may reference:

- `id`
- `role`
- `content`
- `created_at`
- `agent_class`
- `instance_name`

Semantics:

- messages are persisted by Cloudflare Agents rather than mirrored into D1 in MVP

## 7.6 Settings

Singleton app configuration row persisted in D1.

Logical fields:

- `singleton_key`
- `default_model_id`
- `updated_at`

Semantics:

- MVP uses exactly one row, keyed by a stable singleton value such as `default`
- the row stores app-wide settings such as the active Cloudflare AI Gateway model ID
- the default model value is `openai/gpt-5.4`
- additional singleton settings may be added over time without changing the one-row model

## 8. Conversations and Workouts

## 8.1 Conversation Runtime Model

Use Cloudflare Agents happy path:

- one long-lived `GeneralCoachAgent` instance for overall coaching
- one canonical `WorkoutCoachAgent` instance per workout

This keeps one conversation thread per agent instance, which matches `AIChatAgent` cleanly while still making workout-specific discussions auditable and easy to route.

## 8.2 1:1 Rule

The enforced 1:1 relationship is:

- one workout has exactly one canonical workout conversation

Not:

- every conversation corresponds to one workout

In MVP, the canonical workout conversation is the `WorkoutCoachAgent` instance whose name equals `workout.id`.

## 8.3 How They Relate

- the workout detail screen opens `WorkoutCoachAgent/{workout.id}`
- the general coach screen opens `GeneralCoachAgent/default`
- `GeneralCoachAgent` may patch any workout, including historical corrections, through the same guarded mutation service layer as the workout-specific agent
- `WorkoutCoachAgent` remains the canonical in-context conversation for one workout, not the exclusive mutation owner
- the general coaching thread can create workouts, discuss history, and compare plans across workouts
- workout history and analytics live in D1, not in agent message history

## 8.4 Why This Model

This gives:

- clean historical reasoning attached to each workout
- a single place to chat during a workout
- freedom for general planning conversations that span many workouts
- direct alignment with Cloudflare's one-agent-instance-per-conversation model

## 9. System Architecture

## 9.1 Authoritative Structured Store

Use one shared Cloudflare D1 database as the authoritative store for structured workout data in MVP.

Use Drizzle ORM for:

- schema definition
- migrations
- query construction
- transaction-scoped mutation helpers

Responsibilities of D1:

- workouts, exercises, and sets
- singleton `settings` row for global app configuration
- top-level and exercise-level notes
- versioned mutation guards
- derived analytics projections
- import/export metadata

## 9.2 Agent Runtime

Use Cloudflare `AIChatAgent` as the conversation/runtime layer:

- `GeneralCoachAgent/default` for long-lived general coaching
- `WorkoutCoachAgent/{workout.id}` for the canonical workout thread

Model selection rule:

- store one global model preference in the singleton `settings` row
- use the exact Cloudflare AI Gateway model ID string
- default it to `openai/gpt-5.4`
- do not introduce app-level model aliases in MVP

Responsibilities of agents:

- message persistence for their conversation
- streaming chat
- tool execution
- in-context reasoning over assembled workout/history context
- issuing guarded mutations through the shared D1-backed domain service layer

Agents are not the authoritative database for workout facts.

## 9.3 Storage Layers

- D1 via Drizzle for authoritative structured data
- agent-owned Durable Object storage for chat messages and runtime state
- singleton `AppEvents/default` Durable Object for global live notification fanout
- optional `setState()` for small live-synced UI state if needed later

Important rule:

- cross-workout screens must read from D1
- live notification payloads are invalidation hints, not authoritative state
- one global listener is acceptable in MVP because the app is single-user
- MVP must not fan out across many workout agents at request time to build history or analytics

## 9.4 Live Notification Fanout

Use a singleton `AppEvents/default` Durable Object as the app's live notification hub.

Responsibilities:

- keep track of active WebSocket listeners
- broadcast best-effort mutation notifications after every committed persisted mutation
- remain stateless with respect to app data, aside from transient connection bookkeeping needed for fanout

Non-responsibilities:

- it is not an authoritative store for workout state
- it does not replace D1 reads
- it does not need replayable event history in MVP
- it does not persist durable app state, event backlogs, or read models

The notification envelope should be validated by a shared Zod schema in code.

Recommended notification envelope:

- `type`
- `workout_id`
- `version`
- `event_id`
- `invalidate[]`

Recommended invalidation keys include at minimum:

- `home`
- `workouts:list`
- `workout:{workout_id}`
- `analytics`
- `exercise:{exercise_schema_id}`

Client rule:

- treat a notification as a signal to refetch D1-backed data, not as committed truth by itself
- RR7 clients should map `invalidate[]` keys to route-level `revalidator.revalidate()` calls for the currently mounted routes

## 9.5 Materialized Views / Projections

At minimum:

- `workout_snapshots`
- `exercise_set_facts`
- `exercise_day_stats`
- `exercise_prs`

These support fast reads for:

- recent top set
- best set by rep range
- max load
- volume
- estimated 1RM
- frequency / last performed

## 10. Workout Interchange, Import, and Export

`lifting3` should define a versioned workout JSON interchange format backed by a shared Zod schema.

This interchange format is the only supported import/export boundary in MVP.

## 10.1 JSON Interchange Format

Requirements:

- one JSON file per workout
- validated by a shared Zod schema in code
- versioned so the format can evolve safely
- includes canonical `exercise_schema_id` values rather than unresolved freeform exercise names

The interchange payload should include at minimum:

- workout metadata
- top-level `user_notes`
- top-level `coach_notes`
- ordered exercises
- exercise-level notes
- ordered sets
- source metadata

Locked enum decisions for MVP:

- workout `status`: `planned | active | completed | canceled`
- set `status`: `tbd | done | skipped`
- a `completed` workout may still contain `tbd` sets

The interchange format should be stable enough to support:

- local export from `lifting3`
- local import into `lifting3`
- out-of-band migration pipelines from legacy systems such as `lifting2`

## 10.2 Export

`lifting3` should support local export of workouts into the interchange JSON format.

Requirements:

- export is a local command, not a UI flow
- export emits a directory of per-workout JSON files
- every exported file validates against the shared Zod schema
- exported workouts preserve exercise order, set order, notes, and source metadata

Initial export scope:

- completed workouts
- planned or active workouts may be added later if needed

## 10.3 Import

`lifting3` should support local import of workouts from the interchange JSON format.

Requirements:

- import is a local command, not an in-app screen
- import consumes a directory of workout JSON files
- every imported file must pass Zod validation before persistence
- imported workouts preserve order, notes, and canonical exercise schema IDs
- imported workouts preserve the supported workout `status` from the interchange file
- imported `completed` workouts may retain `tbd` sets

MVP should not implement direct import from legacy TOML files in application code.

## 10.4 lifting2 Migration Path

The `lifting2` migration path should be:

1. generate intermediate workout JSON files out of band
2. ensure those JSON files satisfy the shared Zod schema
3. import those files with the local `lifting3` import command

This keeps migration logic separate from the app runtime and prevents `lifting3` from carrying one-off legacy parsing code.

Expected legacy mapping in the out-of-band step:

- `lifting2` workout `notes` -> `user_notes`
- `lifting2` exercise notes -> exercise `user_notes`
- legacy exercise names -> canonical `exercise_schema_id`
- source metadata preserved where useful

Imported workouts will not initially have rich agent conversation history. If desired, later versions can backfill synthetic conversation context, but MVP does not need that.

## 10.5 Public Repo Hygiene

The repository must remain safe to publish.

Rules:

- do not commit real workout history from `lifting2` or exported `lifting3` JSONs
- do not commit real personal notes or coaching notes
- do not commit secrets, tokens, or local account data
- any fixtures or screenshots committed to the repo must be synthetic or sanitized

## 11. Frontend Stack

## 11.1 Framework

- TypeScript
- pnpm
- Ultracite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare AI Gateway
- Drizzle ORM
- Cloudflare Agents SDK
- `AIChatAgent`
- AI SDK
- React Router v7
- React
- Tailwind CSS
- shadcn/ui components as source

The package and repo name should be `lifting3`.

UI styling should start from this shadcn theme:

```bash
pnpm dlx shadcn@latest add https://tweakcn.com/r/themes/cmlk6zefr000004lbe9jygsqc
```

## 11.2 UI Composition

Use shadcn primitives rather than custom bespoke controls unless the interaction clearly demands custom behavior.

Likely component set:

- `Sidebar`
- `Sheet`
- `Drawer`
- `Card`
- `ScrollArea`
- `Tabs`
- `Accordion`
- `Badge`
- `Button`
- `Textarea`
- `Input`
- `ToggleGroup`
- `AlertDialog`
- `Separator`
- `Dialog`
- `Tooltip`
- `Empty`

## 11.3 Visual Direction

The app should feel like a focused training tool, not a generic AI dashboard.

Desired qualities:

- high information density without clutter
- obvious hierarchy between planned work and completed work
- strong statefulness
- minimal latency between tap and feedback
- tasteful motion, especially around completion and PRs

## 12. Workout Detail Screen Spec

This is the core screen of the app.

## 12.1 Layout

### Header

- workout title
- date and status
- source badge
- progress summary, e.g. `9 / 16 sets done`
- actions: `Start`, `Finish`, `Edit`, `More`

### Notes Block

Two top-level note areas:

- `Your notes`
- `Coach notes`

These are distinct fields, both visible on the detail screen.

### Exercise List

Ordered vertically.

Each exercise card shows:

- order number / drag handle in edit mode
- exercise name
- exercise status badge
- exercise progress summary
- previous-values context, such as the last completed set or last session top set
- `Your notes`
- `Coach notes`
- set table / rows
- direct `Add set`, `Replace`, `Skip`, and notes controls
- overflow reserved for uncommon actions

### Agent Panel

Always tied to the workout's canonical coach thread.

Desktop:

- right rail

Mobile:

- bottom drawer / sheet, opened from floating action or toolbar action

## 12.2 Set Row Design

Each set row needs to make state visually obvious.

Fields shown inline:

- set number
- warmup / working chip
- planned weight x reps
- previous value context when useful
- actual weight
- actual reps
- actual RPE
- status treatment

Set row states:

- `tbd`: muted background, no completion marker, but may still show partially entered actual values
- `done`: strong completed treatment with timestamp/check
- `skipped`: crossed or muted with explicit label

The set list must make it impossible to confuse planned work with confirmed work.
A `tbd` row with partial actual values may use stronger input emphasis, but it must not share the `done` visual treatment.

## 12.3 Confirmation Model

The default flow for a set:

1. User taps into the set.
2. Weight and reps are reviewed or adjusted.
3. User sets RPE.
4. Setting RPE confirms the set and transitions it to `done`.

If the workout ends before all planned work is confirmed, the remaining sets may stay `tbd` when the workout is completed.

This is the key product behavior.

Because RPE is the confirmation gesture:

- the app can support very fast flows when plan and actual match
- the UI can emphasize RPE entry as the final commit
- a set with no RPE remains visibly incomplete
- half-step RPE values such as `7.5`, `8.5`, and `9.5` must be first-class, not hidden in a secondary flow
- `6.5` should not be part of the default quick-entry set

## 12.4 Fast Logging UX

The app should support:

- one-tap "same as planned"
- one-tap "same as last set"
- visible previous logged values from the last relevant session
- quick increment/decrement for weight
- quick increment/decrement for reps
- rapid RPE input

RPE quick entry should use visible chips/buttons rather than forcing a keyboard path.

The default visible RPE chip set should be:

- `7`
- `7.5`
- `8`
- `8.5`
- `9`
- `9.5`
- `10`

Preferred behavior:

- if planned values match actual, the user should usually only need to set RPE
- entering RPE should feel like checking off the set while preserving useful load data
- inline previous-values context should make it obvious whether the user is progressing, matching, or backing off

Recommended interaction:

- if a set already has the right weight and reps populated, tapping an RPE chip confirms it immediately
- if the user changes weight or reps first, the subsequent RPE input confirms the modified values

## 12.5 Add / Remove Set UX

Adding and removing sets must be lightweight.

Requirements:

- `Add set` inline at the exercise level
- duplicate previous set as the default seed for a new set
- easy ability to mark warmup vs working
- `Remove set` is lightweight for unperformed sets
- removing a completed set requires explicit correction confirmation
- reorder/replace/skip affordances should be available without leaving the workout detail screen

For completed sets:

- the system should prefer a correction flow over silent deletion
- the historical record should remain auditable

## 12.6 Exercise Notes UX

Each exercise has:

- `Your notes`
- `Coach notes`

These should be visible but collapsed by default if empty.

If routines/templates are introduced later, template notes must remain separate from live workout notes. `lifting3` should not conflate reusable programming cues with session-specific coaching notes.

## 12.7 Exercise Reordering and Editing

In edit mode:

- drag handle or explicit move controls
- reorder should not change exercise identity
- replacing an exercise with logged sets only affects remaining work

Examples:

- if no sets logged: remove or replace is allowed
- if some sets logged: the exercise cannot be erased; it can be marked partial, skipped for remaining sets, or replaced for remaining planned work

## 13. Historical Workout UX

## 13.1 Browsing

The workouts list should optimize for scanning.

Each row/card should show:

- title
- date
- status
- key exercises
- quick summary stats
- source

The user should be able to click directly into the full workout detail.

## 13.2 Historical Workout Detail

Historical detail uses the same core layout as the live workout screen, but defaults to read mode.

It is the canonical historical record.

It should clearly display:

- workout notes
- coaching notes
- exercise order
- all sets with warmup / working designation
- actual weight, reps, RPE
- clear done state

## 13.3 Editing Historical Workouts

Historical workouts are editable.

Edits do not mutate the past in place. They append correction events and rebuild materialized state.

Supported historical edits:

- fix workout notes
- fix coaching notes
- add/remove/reorder exercises
- fix exercise notes
- add/remove/correct sets
- correct designation, weight, reps, or RPE

Whenever historical edits change derived stats:

- PRs and analytics projections must recompute

Internal correction events remain part of the backend model, but MVP should not expose a visible historical edit log or audit timeline in the UI.

## 14. Agent UX

## 14.1 General Coach

The general `Coach` screen is for:

- next workout planning
- cycle or block planning
- long-term analysis
- general Q&A

## 14.2 Workout Coach

Every workout detail screen includes easy access to the canonical `WorkoutCoachAgent`.

Use cases:

- "swap this exercise"
- "add one more backoff set"
- "drop the last accessory, I'm short on time"
- "what should my next deadlift set be?"
- "summarize how today compares to last week"

## 14.3 Agent Interaction Pattern

The agent should not directly mutate the view by rewriting the whole workout object.

Instead:

- the agent proposes a structured patch
- the UI shows a clear result
- committed changes appear in the workout state

For meaningful changes, the UI should surface a compact diff card, e.g.:

- `Removed final accessory circuit`
- `Added 1 backoff set to Bench Press`
- `Replaced Split Squat with Leg Press for remaining work`

The workout coach should stay in context. Opening chat must not navigate the user away from the workout state they are editing.

## 15. Tool Surface

Avoid tool sprawl by separating direct app actions from agent tools.

## 15.1 Direct App Actions (Not LLM Tools)

These are deterministic mutations from UI controls:

- `start_workout`
- `update_set_actuals`
- `confirm_set`
- `skip_set`
- `add_set`
- `remove_set`
- `reorder_exercise`
- `update_workout_notes`
- `update_exercise_notes`
- `finish_workout`

These may still use the same backend mutation pipeline, but they are not part of the model's exposed tool surface.

If a direct app action persists to D1, it also participates in cross-tab live sync.

This includes lightweight persisted changes such as `update_set_actuals`.

## 15.2 Context Assembly (Not Tools)

Before the model runs, the relevant agent should assemble context by reading D1 and derived read models:

- profile and preferences
- active workout snapshot when in `WorkoutCoachAgent`
- recent relevant workouts
- derived exercise stats
- recent agent conversation context

This avoids a large family of read tools.

## 15.3 Agent Tools

MVP tool surface:

### `create_workout`

Used mainly in `GeneralCoachAgent`.

Inputs:

- intent
- target date
- constraints
- optional source workout to adapt

Behavior:

- creates a new workout in `planned` status
- returns the new `workout_id`

### `patch_workout`

Available to both agents.

Typical usage:

- `WorkoutCoachAgent` usually patches its own workout
- `GeneralCoachAgent` may patch any existing workout after loading the latest snapshot
- `GeneralCoachAgent` may issue historical correction flows across multiple past workouts, but each committed patch still targets one workout and one expected version at a time

For a multi-workout correction request:

- the system may partially succeed
- the response should include an explicit per-workout result summary
- one failed workout must not roll back unrelated successful corrections in MVP

Inputs:

- `workout_id`
- `expected_version`
- `ops[]`
- `reason`

Supported op types:

- `add_exercise`
- `replace_exercise`
- `skip_exercise`
- `reorder_exercise`
- `update_exercise_targets`
- `add_set`
- `skip_remaining_sets`
- `add_note`

Important rule:

- no op may erase logged facts
- all tool-backed mutations should call the same D1-backed domain service layer as manual UI actions

### `query_history`

Used for analytics and planning.

Inputs are structured, not freeform SQL.

Allowed dimensions:

- metric: `top_set | max_load | reps_at_load | e1rm | volume | frequency | best_session`
- filters: date window, exercise, status, rep range
- compare window: optional

Implementation note:

- `query_history` should read from D1 tables and projections
- it should not fan out over agent instances

## 16. Concurrency and Stale Context

This is a first-class design constraint.

## 16.1 Authority Rule

Agent context is advisory. D1-backed workout state is authoritative.

## 16.2 Required Mutation Guards

Every mutation, whether from UI or agent, must:

- target stable IDs
- include `expected_version`
- run through the authoritative D1-backed workout reducer inside a transaction where applicable

Avoid position-based targeting like "exercise 3" whenever possible.

## 16.3 Conflict Behavior

If the agent issues a stale mutation because the user manually changed the UI:

- reject the mutation
- return `VERSION_MISMATCH`
- include current version
- include latest snapshot

The agent may retry once after refreshing context.

## 16.4 Destructive Safety

Operations that would destroy history must be guarded.

Examples:

- removing an exercise with logged sets becomes "skip remaining" or "replace remaining"
- removing a completed set becomes a correction flow

## 16.5 Live Sync Behavior

After a committed mutation:

- the shared mutation pipeline updates D1 state
- then emits a best-effort notification to `AppEvents/default`

This applies to all persisted changes, including lightweight set-field updates such as `update_set_actuals`.

Notification delivery is advisory:

- clients must refetch authoritative state from D1-backed loaders or queries
- clients must not treat the notification payload as the source of truth
- RR7 routes should use loader revalidation as the refresh boundary, typically via `useRevalidator()` when a matching invalidation key arrives
- missed notifications are acceptable because the next refetch recovers the latest committed state

## 17. PR Detection and Celebration

PR detection occurs when a set is confirmed.

## 17.1 Confirmation Trigger

The system evaluates PRs when `actual_rpe` is set and the set transitions to `done`.

## 17.2 PR Types

At minimum:

- max load PR
- rep PR at a given load
- estimated 1RM PR
- session volume PR for an exercise

## 17.3 UX Treatment

The animation should feel rewarding, not gimmicky.

Proposed behavior:

- the completed set row briefly glows
- a compact PR badge animates into place
- the exercise card header updates to show the PR type
- on mobile, optional haptic feedback
- the workout timeline and exercise history preserve the PR marker after the animation completes

Avoid:

- full-screen confetti on every PR
- blocking modals

## 18. Analytics

## 18.1 Minimum Analytics Surface

- recent PRs
- best historical sets per exercise
- max weight over time
- e1RM trend over time
- volume trend
- last performed / frequency

## 18.2 Drill-Down

The user should be able to go from:

- analytics overview
- to exercise history
- to exact workout detail

## 19. Data Model Outline

Illustrative logical tables:

- `profiles`
- `settings`
- `workouts`
- `workout_exercises`
- `exercise_sets`
- `exercise_aliases`
- `exercise_set_facts`
- `exercise_prs`

Chat message history is persisted by agent runtime storage, not by app-owned D1 `sessions` / `messages` tables in MVP.

### Example workout tables

```text
settings
  singleton_key
  default_model_id
  updated_at

workouts
  id
  title
  date
  status
  source
  user_notes
  coach_notes
  version
  started_at
  completed_at
  created_at
  updated_at

workout_exercises
  id
  workout_id
  order_index
  exercise_schema_id
  name
  normalized_exercise_key
  status
  user_notes
  coach_notes

exercise_sets
  id
  exercise_id
  order_index
  designation
  planned_weight_lbs
  planned_reps
  planned_rpe
  actual_weight_lbs
  actual_reps
  actual_rpe
  status
  completed_at
```

## 20. API / Backend Boundaries

Not final, but the boundaries should look like this:

- `GET /api/home`
- `GET /api/workouts`
- `GET /api/workouts/:id`
- `POST /api/workouts`
- `GET/WS /events/default`
- `GET/WS /agents/general-coach/default`
- `GET/WS /agents/workout-coach/:workoutId`

RR7 loaders/actions can sit on top of these boundaries or call server functions directly depending on deployment shape.

RR7 read/write rule:

- route loaders are the authoritative UI refresh boundary
- route actions or fetcher actions should call the shared mutation layer
- app-event notifications should trigger route revalidation rather than direct client-side patching of authoritative workout state

Important rule:

- agent tools should live inside the relevant agent runtime, not as standalone HTTP tool endpoints in MVP
- manual UI mutations and agent tools should both call the same D1-backed domain service layer

MVP should not expose HTTP import/export endpoints. Import and export are local command workflows only.

## 21. MVP Scope

MVP must include:

- use D1 as the authoritative structured store
- use Drizzle for D1 migrations and querying
- export workouts to versioned JSON files validated by a shared Zod schema
- import workouts from those validated JSON files via a local command
- support `lifting2` migration through the intermediate JSON format
- browse workouts
- open workout detail
- edit workout, exercise, and set data
- maintain top-level user and coach notes
- maintain exercise-level user and coach notes
- start and complete a live workout
- fast set logging
- clear `tbd` vs `done` state
- global live notification fanout via singleton `AppEvents/default`
- canonical `WorkoutCoachAgent` on workout detail
- long-lived `GeneralCoachAgent` thread
- minimal analytics
- PR detection and animation

MVP may defer:

- advanced periodization
- wearable sync
- voice mode
- background agent jobs beyond simple planning
- multi-program templates beyond simple workout generation

## 22. Open Questions

- Should historical correction flows require a reason, or keep the reason optional?
- Should the active workout screen auto-focus the next `tbd` set after confirming the current one?
- Should export include only workout state, or also agent conversation/message history in a separate format later?

## 23. Companion Documents

- `hevy-app.md`: teardown of Hevy's IA and interaction patterns, used to inform `lifting3` workout UX
