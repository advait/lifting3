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
- all edits, whether manual or agent-authored, flow through a single authoritative event log

## 2. Goals

- Generate the next workout based on recent performance, fatigue signals, and goals.
- Let the user log sets quickly during a workout without depending on the agent.
- Let the user talk to the agent during a workout to add, remove, replace, reorder, or retarget work without blowing away logged facts.
- Preserve historical conversations and tie them cleanly to workouts.
- Make historical workouts easy to browse, inspect, edit, and learn from.
- Make exercise progress obvious through derived stats, PR detection, and trend views.

## 3. Non-Goals

- Multi-user support.
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
- agent panel attached to the workout's canonical session
- direct links into exercise-specific history without losing workout context

### Coach

General coaching session not tied to a single workout.

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
- note on imported workout sources

## 6.4 Navigation Model

### Desktop

- left sidebar for primary navigation
- content pane center
- contextual right rail on workout detail for the workout session agent

### Mobile

- bottom navigation for primary areas
- workout detail keeps a floating `Coach` action that opens the workout session in a drawer/sheet
- active workout gets priority in navigation and resume affordances

## 6.5 IA Rule

Logging, history, analytics, and coaching must feel like connected views over the same workout system, not separate product islands.

The user should be able to move fluidly:

- from a workout to its exercise history
- from exercise history back to the exact parent workout
- from a workout into its canonical coaching thread
- from analytics into concrete historical sessions

## 7. Core Domain Model

## 7.1 Workout

Represents one planned, active, or completed session.

Fields:

- `id`
- `title`
- `date`
- `status`: `draft | active | completed | canceled`
- `source`: `manual | imported | agent`
- `user_notes`
- `coach_notes`
- `primary_session_id`
- `version`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

Notes semantics:

- `user_notes`: the user's own notes
- `coach_notes`: agent-authored or coaching-oriented notes, preserved separately from user notes

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
- `status`: `tbd | draft | done | skipped`
- `completed_at` nullable

Set semantics:

- `tbd`: planned but not yet performed
- `draft`: some actual fields entered, but set not confirmed
- `done`: confirmed completed
- `skipped`: intentionally skipped

Critical product rule:

- Setting `actual_rpe` is the default confirmation action for a set.
- A set is not considered `done` until `actual_rpe` is populated.

Implications:

- Weight and reps may be prefilled from plan or entered before completion.
- The act of assigning RPE is the moment that commits "this set happened."

RPE values should support half-step increments.

The quick-entry path must include at least:

- `7`
- `7.5`
- `8`
- `8.5`
- `9`
- `9.5`
- `10`

## 7.4 Conversation Session

Persistent conversation thread stored separately from workout facts.

Fields:

- `id`
- `kind`: `general | workout`
- `workout_id` nullable
- `title`
- `status`
- `created_at`
- `updated_at`

## 7.5 Message

Fields:

- `id`
- `session_id`
- `role`
- `content`
- `created_at`
- `summary_block_id` nullable

## 7.6 Workout Event

Append-only domain event log.

Examples:

- `workout_created`
- `workout_started`
- `exercise_added`
- `exercise_reordered`
- `exercise_replaced`
- `exercise_skipped`
- `set_added`
- `set_removed`
- `set_drafted`
- `set_confirmed`
- `set_corrected`
- `workout_note_updated`
- `exercise_note_updated`
- `workout_completed`

Each event includes:

- `id`
- `workout_id`
- `version`
- `type`
- `payload`
- `actor_type`: `user | agent | system`
- `actor_id`
- `source_message_id` nullable
- `created_at`

## 8. Conversations and Workouts

## 8.1 Session Model

Use a hybrid model:

- one long-lived `general` session for overall coaching
- one canonical `workout` session per workout

This avoids forcing every conversation into a workout while still making workout-specific discussions clean and auditable.

## 8.2 1:1 Rule

The enforced 1:1 relationship is:

- one workout has exactly one primary workout conversation

Not:

- every conversation corresponds to one workout

## 8.3 How They Relate

- `workout.primary_session_id` points to the canonical workout thread
- workout mutations may carry `source_message_id`
- the workout detail screen always opens the workout's canonical session
- the general coaching session can create workouts, discuss history, and compare plans across workouts

## 8.4 Why This Model

This gives:

- clean historical reasoning attached to each workout
- a single place to chat during a workout
- freedom for general planning conversations that span many workouts

## 9. System Architecture

## 9.1 Durable Backend

Use one top-level `CoachAgent` Durable Object as the authority for MVP.

Responsibilities:

- profile and preferences
- sessions and message history
- workout event log
- workout materialized state
- derived analytics projections
- minimal agent tool execution

MVP should not introduce sub-agents unless a clear need emerges. Project Think concepts matter here, but the simplest durable shape is a single authoritative object.

## 9.2 Storage Layers

Within `CoachAgent`:

- normalized domain tables for workouts, exercises, sets, sessions, messages
- append-only workout event log
- derived read models for analytics
- session summaries / compaction blocks

## 9.3 Materialized Views / Projections

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

## 10. Import From lifting2

`lifting3` should support an initial one-time import from local `lifting2/entries/workouts` TOML files.

Imported data:

- workout title and timestamps
- workout notes
- exercises
- sets
- source metadata

Import mapping:

- `notes` from `lifting2` workout becomes `user_notes`
- imported exercises preserve order
- exercise notes become `user_notes`
- imported workouts start as `completed`
- imported exercise names map to `exercise_schema_id` through a code-defined alias table

Import safety:

- personal historical workout data is local user data and must not be committed to the public repo
- the repo may include fixtures later, but they must be synthetic or sanitized

Imported workouts will not initially have rich session history. If desired, later versions can backfill a synthetic session summary, but MVP does not need that.

## 10.1 Public Repo Hygiene

The repository must remain safe to publish.

Rules:

- do not commit real workout history from `lifting2`
- do not commit real personal notes or coaching notes
- do not commit secrets, tokens, or local account data
- any fixtures or screenshots committed to the repo must be synthetic or sanitized

## 11. Frontend Stack

## 11.1 Framework

- TypeScript
- pnpm
- Ultracite
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

Always tied to the workout session.

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

- `tbd`: muted background, no completion marker
- `draft`: accent border or partial state styling
- `done`: strong completed treatment with timestamp/check
- `skipped`: crossed or muted with explicit label

The set list must make it impossible to confuse planned work with confirmed work.

## 12.3 Confirmation Model

The default flow for a set:

1. User taps into the set.
2. Weight and reps are reviewed or adjusted.
3. User sets RPE.
4. Setting RPE confirms the set and transitions it to `done`.

This is the key product behavior.

Because RPE is the confirmation gesture:

- the app can support very fast flows when plan and actual match
- the UI can emphasize RPE entry as the final commit
- a set with no RPE remains visibly incomplete
- half-step RPE values such as `7.5`, `8.5`, and `9.5` must be first-class, not hidden in a secondary flow

## 12.4 Fast Logging UX

The app should support:

- one-tap "same as planned"
- one-tap "same as last set"
- visible previous logged values from the last relevant session
- quick increment/decrement for weight
- quick increment/decrement for reps
- rapid RPE input

RPE quick entry should use visible chips/buttons rather than forcing a keyboard path.

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

Every workout detail screen includes easy access to the workout session agent.

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
- `draft_set_fields`
- `confirm_set`
- `skip_set`
- `add_set`
- `remove_set`
- `reorder_exercise`
- `update_workout_notes`
- `update_exercise_notes`
- `finish_workout`
- `undo_last_event`

These may still use the same backend mutation pipeline, but they are not part of the model's exposed tool surface.

## 15.2 Context Assembly (Not Tools)

Before the model runs, `CoachAgent` should assemble:

- profile and preferences
- active workout snapshot
- recent relevant workouts
- derived exercise stats
- session summary

This avoids a large family of read tools.

## 15.3 Agent Tools

MVP tool surface:

### `create_workout_draft`

Used mainly in the general coaching session.

Inputs:

- intent
- target date
- constraints
- optional source workout to adapt

### `patch_workout`

Used mainly in the workout session.

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

### `query_history`

Used for analytics and planning.

Inputs are structured, not freeform SQL.

Allowed dimensions:

- subject: `exercise | workout`
- metric: `top_set | max_load | reps_at_load | e1rm | volume | frequency | best_session`
- filters: date window, exercise, status, rep range
- compare window: optional

## 16. Concurrency and Stale Context

This is a first-class design constraint.

## 16.1 Authority Rule

Agent context is advisory. Durable workout state is authoritative.

## 16.2 Required Mutation Guards

Every mutation, whether from UI or agent, must:

- target stable IDs
- include `expected_version`
- run through the authoritative workout reducer

Avoid position-based targeting like "exercise 3" whenever possible.

## 16.3 Conflict Behavior

If the agent issues a stale mutation because the user manually changed the UI:

- reject the mutation
- return `VERSION_MISMATCH`
- include current version
- include latest snapshot
- include events since the caller's version

The agent may retry once after refreshing context.

## 16.4 Destructive Safety

Operations that would destroy history must be guarded.

Examples:

- removing an exercise with logged sets becomes "skip remaining" or "replace remaining"
- removing a completed set becomes a correction flow

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
- `workouts`
- `workout_exercises`
- `exercise_sets`
- `workout_events`
- `sessions`
- `messages`
- `exercise_aliases`
- `exercise_set_facts`
- `exercise_prs`

### Example workout tables

```text
workouts
  id
  title
  date
  status
  user_notes
  coach_notes
  primary_session_id
  version
  started_at
  completed_at
  created_at
  updated_at

workout_exercises
  id
  workout_id
  order_index
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
- `POST /api/workouts/:id/events`
- `POST /api/coach/chat`
- `POST /api/coach/tools/create-workout-draft`
- `POST /api/coach/tools/patch-workout`
- `POST /api/coach/tools/query-history`

RR7 loaders/actions can sit on top of these boundaries or call server functions directly depending on deployment shape.

## 21. MVP Scope

MVP must include:

- import historical workouts from `lifting2`
- browse workouts
- open workout detail
- edit workout, exercise, and set data
- maintain top-level user and coach notes
- maintain exercise-level user and coach notes
- start and complete a live workout
- fast set logging
- clear `tbd` vs `done` state
- canonical workout session agent on workout detail
- general coach session
- minimal analytics
- PR detection and animation

MVP may defer:

- advanced periodization
- wearable sync
- voice mode
- background agent jobs beyond simple planning
- multi-program templates beyond draft generation

## 22. Open Questions

- Should draft workouts support reusable templates in MVP, or only agent-generated drafts?
- Should historical correction flows require a reason, or keep the reason optional?
- Should set confirmation support a one-tap default RPE shortcut for common values such as `7`, `8`, and `9`?
- Should the active workout screen auto-focus the next `tbd` set after confirming the current one?

## 23. Companion Documents

- `hevy-app.md`: teardown of Hevy's IA and interaction patterns, used to inform `lifting3` workout UX
