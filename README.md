# lifting3

**A workout app with an embedded coach, not a chat demo with workouts bolted on.**

`lifting3` is a single-user training app for planning sessions, logging sets quickly, and keeping workout history structured enough to query, edit, and learn from.

Today the app is strongest in three places:

- planning a workout from the coach into a real stored workout
- running that workout with fast set logging and quick RPE confirmation
- browsing workouts and exercises as first-class product surfaces

The coach is already integrated into the app shell, but the docs had drifted. The current implementation uses a single Cloudflare `CoachAgent` built on `Think`, not separate `AIChatAgent` classes, and there is not yet a dedicated post-workout review or follow-up agent flow.

## What Is Shipped

- `Home` shows recent workouts.
- `Workouts` lists planned, active, and completed sessions.
- `Workout detail` supports start/finish, set edits, set confirmation, notes, add/remove set, remove/reorder exercise, rest timer edits, and historical edit mode for completed sessions.
- `Exercises` provides a filterable catalog with history-aware summaries.
- `Coach` is a sheet in the app shell, not a standalone route.
- `Analytics` and `Settings` routes exist, but their UI is still marked coming soon.

## Coach Architecture Today

- The worker exports one `CoachAgent` class from [workers/coach-agent.ts](/home/advait/l3-root/l3/workers/coach-agent.ts).
- `CoachAgent` extends `@cloudflare/think`'s `Think`.
- Thread identity is encoded in the agent instance name:
  - `general`
  - `workout:{workoutId}`
- The coach tool surface is:
  - `create_workout`
  - `patch_workout`
  - `query_history`
  - `set_user_profile`
- Workout data lives in D1 and flows through shared route/service code. Chat does not own workout state.
- The current model is hardcoded to `openai/gpt-5.4` through Cloudflare AI Gateway `default`.
- The only persisted app setting today is `user_profile`.

## Important Gap

There is no dedicated post-workout agent flow yet.

What exists today:

- a workout-scoped coach thread can discuss the current workout
- it can create a follow-up planned workout by calling `create_workout` with `sourceWorkoutId`

What does not exist yet:

- an automatic review flow after workout completion
- a separate post-workout summary/reflection agent mode
- a specialized tool or route just for post-session analysis

## Stack

- React 19
- React Router 7
- Cloudflare Workers
- Cloudflare Agents
- Cloudflare D1 + Drizzle
- Tailwind CSS v4
- shadcn/ui
- Vite+

## Local Development

1. Copy `.env.sample` to `.env`.
2. Configure the Cloudflare AI Gateway named `default` with provider keys or billing.
3. Run `pnpm install`.
4. Apply local migrations with `pnpm db:migrate:local`.
5. Seed sample workouts with `pnpm db:seed:local`.
6. Start the app with `pnpm dev`.

Default local URL: `http://localhost:43110`

## Reference Docs

- [docs/spec.md](docs/spec.md) - current implementation status and product shape
- [docs/cloudflare-agents.md](docs/cloudflare-agents.md) - current agent/runtime architecture in this repo
